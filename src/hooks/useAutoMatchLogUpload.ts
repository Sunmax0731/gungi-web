import { useEffect, useMemo, useRef, useState } from 'react';
import { createAutoMatchLogPayload, getAutoMatchLogMatchId, getAutoMatchLogUploadKey } from '../game/autoMatchLog';
import { type CpuLevel, type GameState, type Player } from '../game/types';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface UseAutoMatchLogUploadOptions {
  autoMatch: boolean;
  cpuLevels: Record<Player, CpuLevel>;
  game: GameState;
}

interface AutoMatchLogUploadResponse {
  error?: string;
  id?: string;
  savedAt?: string;
}

interface UploadSnapshot {
  errorMessage: string | null;
  matchId: string;
  remoteId: string | null;
  savedAt: string | null;
  uploadState: UploadState;
}

function getUploadEndpoint(): string {
  return (import.meta.env.VITE_AUTOMATCH_LOG_ENDPOINT ?? '').trim();
}

async function parseJsonResponse(response: Response): Promise<AutoMatchLogUploadResponse> {
  try {
    return (await response.json()) as AutoMatchLogUploadResponse;
  } catch {
    return {};
  }
}

function getResponseErrorMessage(response: Response, body: AutoMatchLogUploadResponse): string {
  if (!response.ok) {
    return typeof body.error === 'string' && body.error.length > 0
      ? `${body.error} (${response.status})`
      : `ログ保存に失敗しました (${response.status})`;
  }

  return 'ログ保存に失敗しました。';
}

export function useAutoMatchLogUpload({ autoMatch, cpuLevels, game }: UseAutoMatchLogUploadOptions) {
  const endpoint = useMemo(() => getUploadEndpoint(), []);
  const matchId = getAutoMatchLogMatchId(game);
  const uploadKey = getAutoMatchLogUploadKey(game);
  const attemptedUploadsRef = useRef(new Set<string>());
  const [retryNonce, setRetryNonce] = useState(0);
  const [snapshot, setSnapshot] = useState<UploadSnapshot>({
    errorMessage: null,
    matchId,
    remoteId: null,
    savedAt: null,
    uploadState: 'idle',
  });
  const currentSnapshot =
    snapshot.matchId === matchId
      ? snapshot
      : {
          errorMessage: null,
          matchId,
          remoteId: null,
          savedAt: null,
          uploadState: 'idle' as const,
        };

  useEffect(() => {
    if (!endpoint || !autoMatch || !game.winner) {
      return;
    }
    if (attemptedUploadsRef.current.has(uploadKey)) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const payload = createAutoMatchLogPayload(game, cpuLevels);

    attemptedUploadsRef.current.add(uploadKey);
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setSnapshot({
        errorMessage: null,
        matchId,
        remoteId: null,
        savedAt: null,
        uploadState: 'uploading',
      });
    });

    void fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await parseJsonResponse(response);
        if (!response.ok) {
          throw new Error(getResponseErrorMessage(response, body));
        }
        if (cancelled) {
          return;
        }

        setSnapshot({
          errorMessage: null,
          matchId,
          remoteId: body.id ?? payload.matchId,
          savedAt: body.savedAt ?? payload.savedAt,
          uploadState: 'success',
        });
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        attemptedUploadsRef.current.delete(uploadKey);
        setSnapshot({
          errorMessage: error instanceof Error ? error.message : 'ログ保存に失敗しました。',
          matchId,
          remoteId: null,
          savedAt: null,
          uploadState: 'error',
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [autoMatch, cpuLevels, endpoint, game, matchId, retryNonce, uploadKey]);

  return {
    endpoint,
    endpointConfigured: endpoint.length > 0,
    errorMessage: currentSnapshot.errorMessage,
    remoteId: currentSnapshot.remoteId,
    retryUpload: () => {
      if (!endpoint || !autoMatch || !game.winner) {
        return;
      }

      attemptedUploadsRef.current.delete(uploadKey);
      setRetryNonce((current) => current + 1);
    },
    savedAt: currentSnapshot.savedAt,
    uploadState: currentSnapshot.uploadState,
  };
}

import { useEffect, useMemo, useState } from 'react';
import { createCpuService } from '../game/cpu-service';
import { type CpuThought } from '../game/cpu-thought';
import { type CpuLevel, type GameMove, type GameState } from '../game/types';

interface UsePlayerHintOptions {
  enabled: boolean;
  game: GameState;
  level: CpuLevel;
}

interface HintState {
  elapsedMs: number;
  error: string | null;
  move: GameMove | null;
  requestKey: string | null;
  resolved: boolean;
  thought: CpuThought | null;
}

const INITIAL_STATE: HintState = {
  elapsedMs: 0,
  error: null,
  move: null,
  requestKey: null,
  resolved: false,
  thought: null,
};

export function usePlayerHint({ enabled, game, level }: UsePlayerHintOptions) {
  const cpuService = useMemo(() => createCpuService(), []);
  const [state, setState] = useState<HintState>(INITIAL_STATE);
  const requestKey = enabled ? `${game.updatedAt}:${level}` : null;

  useEffect(() => {
    return () => {
      cpuService.dispose();
    };
  }, [cpuService]);

  useEffect(() => {
    if (!requestKey) {
      return;
    }

    let cancelled = false;
    const startedAt = performance.now();

    void cpuService
      .computeMove(game, level, (thought) => {
        if (cancelled) {
          return;
        }

        setState({
          elapsedMs: performance.now() - startedAt,
          error: null,
          move: null,
          requestKey,
          resolved: false,
          thought,
        });
      })
      .then((move) => {
        if (cancelled) {
          return;
        }

        setState({
          elapsedMs: performance.now() - startedAt,
          error: null,
          move,
          requestKey,
          resolved: true,
          thought: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          elapsedMs: performance.now() - startedAt,
          error: error instanceof Error ? error.message : 'ヒントの解析に失敗しました。',
          move: null,
          requestKey,
          resolved: true,
          thought: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [cpuService, game, level, requestKey]);

  if (!requestKey) {
    return {
      hintElapsedMs: 0,
      hintError: null,
      hintLoading: false,
      hintMove: null,
      hintThought: null,
    };
  }

  if (state.requestKey !== requestKey) {
    return {
      hintElapsedMs: 0,
      hintError: null,
      hintLoading: true,
      hintMove: null,
      hintThought: null,
    };
  }

  return {
    hintElapsedMs: state.elapsedMs,
    hintError: state.error,
    hintLoading: !state.resolved,
    hintMove: state.move,
    hintThought: state.thought,
  };
}

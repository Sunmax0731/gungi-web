import { startTransition, useEffect, useEffectEvent, useState, type Dispatch, type SetStateAction } from 'react';
import { type CpuService } from '../game/cpu-service';
import { type CpuThought } from '../game/cpu-thought';
import { applyMove, createResignMove } from '../game/engine';
import { type CpuLevel, type GameState, type Player } from '../game/types';

interface CpuThoughtEntry {
  thought: CpuThought;
  elapsedMs: number;
}

interface UseCpuTurnOptions {
  activeCpuLevel: CpuLevel;
  autoMatch: boolean;
  autoMatchPaused: boolean;
  clearSelectionState: () => void;
  cpuService: CpuService;
  game: GameState;
  humanPlayer: Player;
  onError: (message: string | null) => void;
  setGame: Dispatch<SetStateAction<GameState>>;
}

function appendCpuThought(thoughts: CpuThoughtEntry[], thought: CpuThought, elapsedMs: number): CpuThoughtEntry[] {
  return [...thoughts, { thought, elapsedMs }].slice(-8);
}

export function useCpuTurn({
  activeCpuLevel,
  autoMatch,
  autoMatchPaused,
  clearSelectionState,
  cpuService,
  game,
  humanPlayer,
  onError,
  setGame,
}: UseCpuTurnOptions) {
  const [cpuThoughts, setCpuThoughts] = useState<CpuThoughtEntry[]>([]);
  const [cpuThoughtPlayer, setCpuThoughtPlayer] = useState<Player | null>(null);
  const [cpuThoughtStartedAt, setCpuThoughtStartedAt] = useState<number | null>(null);
  const [cpuThoughtElapsedMs, setCpuThoughtElapsedMs] = useState(0);
  const clearSelection = useEffectEvent(() => {
    clearSelectionState();
  });
  const reportError = useEffectEvent((message: string | null) => {
    onError(message);
  });
  const resetThoughts = () => {
    setCpuThoughtElapsedMs(0);
    setCpuThoughtPlayer(null);
    setCpuThoughtStartedAt(null);
    setCpuThoughts([]);
  };

  const thinking = !game.winner && (autoMatch ? !autoMatchPaused : game.turn !== humanPlayer);

  useEffect(() => {
    return () => {
      cpuService.dispose();
    };
  }, [cpuService]);

  useEffect(() => {
    if (!thinking || cpuThoughtStartedAt === null) {
      return;
    }

    const timer = window.setInterval(() => {
      setCpuThoughtElapsedMs(performance.now() - cpuThoughtStartedAt);
    }, 100);

    return () => {
      window.clearInterval(timer);
    };
  }, [cpuThoughtStartedAt, thinking]);

  useEffect(() => {
    let cancelled = false;
    if (!thinking) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCpuThoughtPlayer(game.turn);
      setCpuThoughts([]);
      const startedAt = performance.now();
      setCpuThoughtStartedAt(startedAt);
      setCpuThoughtElapsedMs(0);

      void cpuService
        .computeMove(game, activeCpuLevel, (thought) => {
          if (cancelled) {
            return;
          }

          const elapsedMs = performance.now() - startedAt;
          setCpuThoughtElapsedMs(elapsedMs);
          setCpuThoughts((current) => appendCpuThought(current, thought, elapsedMs));
        })
        .then((move) => {
          if (cancelled) {
            return;
          }

          setCpuThoughtElapsedMs(performance.now() - startedAt);
          clearSelection();

          startTransition(() => {
            setGame((current) => {
              if (current.updatedAt !== game.updatedAt) {
                return current;
              }

              return applyMove(current, move ?? createResignMove(game.turn), {
                recordedAt: new Date().toISOString(),
              });
            });
          });
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          reportError(error instanceof Error ? error.message : 'CPU の思考に失敗しました。');
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeCpuLevel, autoMatch, autoMatchPaused, cpuService, game, humanPlayer, setGame, thinking]);

  return {
    cpuThoughtElapsedMs,
    cpuThoughtPlayer,
    cpuThoughts,
    resetThoughts,
    thinking,
  };
}

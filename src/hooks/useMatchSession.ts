import { startTransition, useEffect, useMemo, useState } from 'react';
import { getMatchElapsedMs, pauseGameClock, resumeGameClock } from '../game/clock';
import { applyMove } from '../game/engine';
import { applySetupTemplate, createInitialGame } from '../game/setup';
import { clearSavedGame, saveGame } from '../game/storage';
import { type CpuLevel, type GameMove, type GameState, type Player, type RulesetId, type SetupTemplateId } from '../game/types';

export type MatchMode = 'human-vs-cpu' | 'cpu-vs-cpu';

const DEFAULT_AUTO_CPU_LEVELS: Record<Player, CpuLevel> = {
  south: 'normal',
  north: 'normal',
};

interface UseMatchSessionOptions {
  initialGame: GameState;
}

export function useMatchSession({ initialGame }: UseMatchSessionOptions) {
  const [game, setGame] = useState(initialGame);
  const [matchMode, setMatchMode] = useState<MatchMode>('human-vs-cpu');
  const [autoMatchPaused, setAutoMatchPaused] = useState(false);
  const [pendingRulesetId, setPendingRulesetId] = useState<RulesetId>(initialGame.rulesetId);
  const [setupTemplateId, setSetupTemplateId] = useState<SetupTemplateId>(initialGame.setupTemplateId ?? 'manual');
  const [cpuLevel, setCpuLevel] = useState<CpuLevel>('normal');
  const [autoMatchCpuLevels, setAutoMatchCpuLevels] = useState<Record<Player, CpuLevel>>(DEFAULT_AUTO_CPU_LEVELS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    saveGame(game);
  }, [game]);

  useEffect(() => {
    if (!game.clock.runningSince || game.winner) {
      return;
    }

    const timer = window.setInterval(() => {
      setClockNow(new Date().toISOString());
    }, 1_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [game.clock.runningSince, game.winner]);

  const autoMatch = matchMode === 'cpu-vs-cpu';
  const matchElapsedMs = useMemo(() => getMatchElapsedMs(game, clockNow), [clockNow, game]);

  const executeMove = (move: GameMove) => {
    try {
      startTransition(() => {
        setGame((current) => applyMove(current, move, { recordedAt: new Date().toISOString() }));
      });
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '手を適用できませんでした。');
    }
  };

  const createPreparedGame = (rulesetId: RulesetId, mode: MatchMode): GameState =>
    createInitialGame(rulesetId, mode === 'human-vs-cpu' ? setupTemplateId : 'manual');

  const startNewMatch = (mode: MatchMode) => {
    startTransition(() => {
      setMatchMode(mode);
      setGame(createPreparedGame(pendingRulesetId, mode));
    });
    setAutoMatchPaused(false);
    setErrorMessage(null);
  };

  const removeSavedGame = () => {
    clearSavedGame();
    setErrorMessage('保存データをブラウザから削除しました。');
  };

  const toggleAutoMatchPaused = () => {
    if (!autoMatch || game.winner) {
      return;
    }

    const recordedAt = new Date().toISOString();
    setAutoMatchPaused((current) => !current);
    setGame((current) => (autoMatchPaused ? resumeGameClock(current, recordedAt) : pauseGameClock(current, recordedAt)));
  };

  const applyRecommendedSetup = () => {
    if (game.rulesetId !== 'advanced' || game.phase !== 'setup') {
      return;
    }

    startTransition(() => {
      setGame((current) => applySetupTemplate(current, 'recommended'));
    });
    setSetupTemplateId('recommended');
    setErrorMessage(null);
  };

  return {
    autoMatch,
    autoMatchCpuLevels,
    autoMatchPaused,
    clockNow,
    cpuLevel,
    errorMessage,
    executeMove,
    game,
    matchElapsedMs,
    matchMode,
    pendingRulesetId,
    removeSavedGame,
    setAutoMatchCpuLevels,
    setCpuLevel,
    setErrorMessage,
    setGame,
    setPendingRulesetId,
    setSetupTemplateId,
    setupTemplateId,
    startAutoMatch: () => startNewMatch('cpu-vs-cpu'),
    startNewGame: () => startNewMatch('human-vs-cpu'),
    toggleAutoMatchPaused,
    applyRecommendedSetup,
  };
}

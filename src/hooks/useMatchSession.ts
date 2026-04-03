import { startTransition, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getMatchElapsedMs, pauseGameClock, resumeGameClock } from '../game/clock';
import { applyMove } from '../game/engine';
import { applySetupTemplate, createInitialGame } from '../game/setup';
import {
  clearSavedGame,
  deleteGameFromSlot,
  exportGameState,
  getSaveBrowserSnapshot,
  importGameState,
  loadGameFromSlot,
  saveGame,
  saveGameToSlot,
  subscribeStorage,
} from '../game/storage';
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
  const saveBrowserState = useSyncExternalStore(subscribeStorage, getSaveBrowserSnapshot, getSaveBrowserSnapshot);

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

  const restoreGame = (nextGame: GameState) => {
    startTransition(() => {
      setGame(nextGame);
      setMatchMode('human-vs-cpu');
      setPendingRulesetId(nextGame.rulesetId);
      setSetupTemplateId(nextGame.setupTemplateId ?? 'manual');
    });
    setAutoMatchPaused(false);
    setErrorMessage(null);
  };

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

  const saveCurrentGameToSlot = (slotId: string) => {
    const summary = saveGameToSlot(slotId, game);
    setErrorMessage(`${summary.label} に保存しました。`);
  };

  const loadSelectedGame = (slotId: string) => {
    const savedGame = loadGameFromSlot(slotId);
    if (!savedGame) {
      setErrorMessage('指定した保存スロットに対局データがありません。');
      return;
    }

    restoreGame(savedGame);
  };

  const deleteSelectedSave = (slotId: string) => {
    deleteGameFromSlot(slotId);
    setErrorMessage('保存スロットを削除しました。');
  };

  const importSavedGame = (raw: string) => {
    const imported = importGameState(raw);
    restoreGame(imported);
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
    autosaveSummary: saveBrowserState.autosaveSummary,
    clockNow,
    cpuLevel,
    deleteSelectedSave,
    errorMessage,
    executeMove,
    exportCurrentGameState: () => exportGameState(game),
    game,
    importSavedGame,
    loadSelectedGame,
    matchElapsedMs,
    matchMode,
    pendingRulesetId,
    removeSavedGame,
    saveCurrentGameToSlot,
    saveSlots: saveBrowserState.saveSlots,
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

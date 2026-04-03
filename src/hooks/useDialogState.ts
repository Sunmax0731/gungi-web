import { useEffect, useRef, useState } from 'react';
import { type Player, type VictoryReason } from '../game/types';

export type MatchMode = 'human-vs-cpu' | 'cpu-vs-cpu';
export type ConfirmActionId = 'new-game' | 'auto-match' | 'clear-save' | 'ready' | 'resign';

export type DialogState =
  | { type: 'rules' }
  | { type: 'log' }
  | { type: 'save-manager' }
  | { type: 'confirm'; action: ConfirmActionId }
  | { type: 'result'; winner: Player; reason: VictoryReason | null }
  | null;

interface UseDialogStateOptions {
  updatedAt: string;
  winner: Player | null;
  victoryReason: VictoryReason | null;
}

export function useDialogState({ updatedAt, winner, victoryReason }: UseDialogStateOptions) {
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const resultDialogKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!winner) {
      resultDialogKeyRef.current = null;
      return;
    }

    const resultKey = `${updatedAt}:${winner}:${victoryReason ?? 'unknown'}`;
    if (resultDialogKeyRef.current === resultKey) {
      return;
    }

    resultDialogKeyRef.current = resultKey;
    const frame = window.requestAnimationFrame(() => {
      setDialogState({ type: 'result', winner, reason: victoryReason });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [updatedAt, victoryReason, winner]);

  return {
    dialogState,
    closeDialog: () => setDialogState(null),
    openLogDialog: () => setDialogState({ type: 'log' as const }),
    openRuleDialog: () => setDialogState({ type: 'rules' as const }),
    openSaveManagerDialog: () => setDialogState({ type: 'save-manager' as const }),
    openConfirmDialog: (action: ConfirmActionId) => setDialogState({ type: 'confirm', action }),
    setDialogState,
  };
}

import { useRef } from 'react';
import { victoryReasonText } from '../../app/gameUi';
import { type Player, type VictoryReason } from '../../game/types';
import { ModalDialog } from './ModalDialog';

interface GameResultDialogProps {
  winner: Player;
  winnerLabel: string;
  reason: VictoryReason | null;
  onClose: () => void;
}

export function GameResultDialog({ winner, winnerLabel, reason, onClose }: GameResultDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      eyebrow="Result"
      title="対局結果"
      onClose={onClose}
      initialFocusRef={closeButtonRef}
      panelClassName="modal-panel-compact"
      headerActions={
        <button ref={closeButtonRef} type="button" className="rule-button" onClick={onClose}>
          閉じる
        </button>
      }
    >
      <div className="result-block">
        <strong className="result-winner" data-winner={winner}>
          {winnerLabel}の勝ち
        </strong>
        <p className="modal-lead">勝因: {victoryReasonText(reason)}</p>
      </div>
    </ModalDialog>
  );
}

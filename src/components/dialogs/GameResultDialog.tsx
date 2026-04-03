import { useRef } from 'react';
import { victoryReasonText } from '../../app/gameUi';
import { type Player, type VictoryReason } from '../../game/types';
import { ModalDialog } from './ModalDialog';

interface GameResultDialogProps {
  winner: Player;
  winnerLabel: string;
  reason: VictoryReason | null;
  elapsedLabel: string;
  logSaveStatusLabel?: string | null;
  onClose: () => void;
  onRetryLogSave?: (() => void) | null;
}

export function GameResultDialog({
  winner,
  winnerLabel,
  reason,
  elapsedLabel,
  logSaveStatusLabel = null,
  onClose,
  onRetryLogSave = null,
}: GameResultDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      eyebrow="結果"
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
          {winnerLabel}の勝利
        </strong>
        <p className="modal-lead">勝因: {victoryReasonText(reason)}</p>
        <p className="modal-lead">対局時間: {elapsedLabel}</p>
        {logSaveStatusLabel ? <p className="modal-lead">ログ保存: {logSaveStatusLabel}</p> : null}
        {onRetryLogSave ? (
          <div className="modal-action-row">
            <button type="button" className="settings-button secondary" onClick={onRetryLogSave}>
              ログ保存を再送信
            </button>
          </div>
        ) : null}
      </div>
    </ModalDialog>
  );
}

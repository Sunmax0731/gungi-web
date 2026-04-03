import { useRef } from 'react';
import { formatClockDuration } from '../../app/gameUi';
import { type MoveRecord } from '../../game/types';
import { ModalDialog } from './ModalDialog';

interface MatchLogDialogProps {
  records: MoveRecord[];
  onClose: () => void;
}

export function MatchLogDialog({ records, onClose }: MatchLogDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      eyebrow="ログ"
      title="対局ログ"
      onClose={onClose}
      initialFocusRef={closeButtonRef}
      headerActions={
        <button ref={closeButtonRef} type="button" className="rule-button" onClick={onClose}>
          閉じる
        </button>
      }
    >
      {records.length === 0 ? (
        <p className="modal-lead">まだ棋譜は記録されていません。</p>
      ) : (
        <ol className="modal-log">
          {records.map((record) => (
            <li key={record.ply}>
              <span>{record.notation}</span>
              <span className="modal-log-meta">
                <strong>所要時間 {formatClockDuration(record.elapsedMs)}</strong>
              </span>
              {record.captured.length > 0 ? <strong>{record.captured.length} 枚捕獲</strong> : null}
            </li>
          ))}
        </ol>
      )}
    </ModalDialog>
  );
}

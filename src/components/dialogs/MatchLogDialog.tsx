import { useRef } from 'react';
import { ModalDialog } from './ModalDialog';
import { type MoveRecord } from '../../game/types';

interface MatchLogDialogProps {
  records: MoveRecord[];
  onClose: () => void;
}

export function MatchLogDialog({ records, onClose }: MatchLogDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      eyebrow="Match Log"
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
              {record.captured.length > 0 ? <strong>{record.captured.length} 駒捕獲</strong> : null}
            </li>
          ))}
        </ol>
      )}
    </ModalDialog>
  );
}

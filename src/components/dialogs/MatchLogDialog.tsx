import { useRef } from 'react';
import { formatClockDuration } from '../../app/gameUi';
import { type MoveRecord } from '../../game/types';
import { ModalDialog } from './ModalDialog';

interface MatchLogDialogProps {
  currentPly: number;
  onClose: () => void;
  onJumpToLatest: () => void;
  onJumpToStart: () => void;
  onSelectPly: (ply: number) => void;
  onStepBackward: () => void;
  onStepForward: () => void;
  records: MoveRecord[];
  replaying: boolean;
}

export function MatchLogDialog({
  currentPly,
  onClose,
  onJumpToLatest,
  onJumpToStart,
  onSelectPly,
  onStepBackward,
  onStepForward,
  records,
  replaying,
}: MatchLogDialogProps) {
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
      <div className="modal-toolbar">
        <strong>{replaying ? `解析表示: ${currentPly} 手目` : '最新局面を表示中'}</strong>
        <div className="modal-toolbar-actions">
          <button type="button" className="rule-button" onClick={onJumpToStart}>
            先頭
          </button>
          <button type="button" className="rule-button" onClick={onStepBackward}>
            前手
          </button>
          <button type="button" className="rule-button" onClick={onStepForward}>
            次手
          </button>
          <button type="button" className="rule-button" onClick={onJumpToLatest}>
            最新
          </button>
        </div>
      </div>

      {records.length === 0 ? (
        <p className="modal-lead">まだ棋譜は記録されていません。</p>
      ) : (
        <ol className="modal-log replay-log">
          {records.map((record) => (
            <li key={record.ply} className={record.ply === currentPly ? 'active' : ''}>
              <button type="button" className="log-entry-button" onClick={() => onSelectPly(record.ply)}>
                <span>{record.notation}</span>
                <span className="modal-log-meta">
                  <strong>所要時間 {formatClockDuration(record.elapsedMs)}</strong>
                  {record.captured.length > 0 ? <strong>{record.captured.length} 枚捕獲</strong> : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </ModalDialog>
  );
}

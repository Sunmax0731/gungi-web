import { useRef } from 'react';
import { ModalDialog } from './ModalDialog';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = 'default',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      eyebrow="Confirmation"
      title={title}
      onClose={onClose}
      initialFocusRef={cancelButtonRef}
      panelClassName="modal-panel-compact"
    >
      <p className="modal-lead">{message}</p>
      <div className="modal-action-row">
        <button ref={cancelButtonRef} type="button" className="settings-button secondary" onClick={onClose}>
          キャンセル
        </button>
        <button
          type="button"
          className={tone === 'danger' ? 'settings-button danger-button' : 'settings-button'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalDialog>
  );
}

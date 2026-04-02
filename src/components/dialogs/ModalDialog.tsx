import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { useModalFocusTrap } from './useModalFocusTrap';

interface ModalDialogProps {
  eyebrow?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  headerActions?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  panelClassName?: string;
}

export function ModalDialog({
  eyebrow,
  title,
  onClose,
  children,
  headerActions,
  initialFocusRef,
  panelClassName = '',
}: ModalDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useModalFocusTrap(panelRef, onClose, initialFocusRef);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className={['modal-panel', panelClassName].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          {headerActions}
        </div>
        {children}
      </div>
    </div>
  );
}

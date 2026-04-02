import { useEffect, type RefObject } from 'react';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

export function useModalFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const previousFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTarget = () => {
      const initialTarget = initialFocusRef?.current;
      if (initialTarget) {
        initialTarget.focus();
        return;
      }

      const firstFocusable = getFocusableElements(panel)[0];
      if (firstFocusable) {
        firstFocusable.focus();
        return;
      }

      panel.focus();
    };

    const frame = window.requestAnimationFrame(focusTarget);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!active || active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!active || active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      panel.removeEventListener('keydown', onKeyDown);
      previousFocused?.focus();
    };
  }, [initialFocusRef, onClose, panelRef]);
}

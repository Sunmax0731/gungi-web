import { useEffect, useState } from 'react';

const STORAGE_KEY = 'gungi-web-first-play-guide-v1';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'dismissed');
  } catch {
    // Ignore storage failures and keep the guide in-memory only.
  }
}

export function useFirstPlayGuide(hasHistory: boolean) {
  const [dismissed, setDismissed] = useState(() => readDismissed());

  useEffect(() => {
    if (!hasHistory || dismissed) {
      return;
    }

    persistDismissed();
  }, [dismissed, hasHistory]);

  const dismissGuide = () => {
    persistDismissed();
    setDismissed(true);
  };

  return {
    showGuide: !dismissed && !hasHistory,
    dismissGuide,
  };
}

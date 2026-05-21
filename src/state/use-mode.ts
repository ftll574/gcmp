/**
 * Beginner vs Pro mode toggle.
 *
 * Beginner mode:
 *   - bigger explanatory empty-state hints
 *   - jargon glossary tooltips visible
 *   - sample-routings carousel surfaced
 *   - plain-language earning summary in panel
 *   - "城市 (Tokyo)" placeholders in input
 *
 * Pro mode:
 *   - compact data-dense UI
 *   - IATA-code placeholder only
 *   - no glossary popovers by default
 *
 * Default: Beginner on first visit; Pro if the user has interacted before
 * (we infer "interacted" by presence of saved routings or a non-default
 * locale switch).
 */

import { useEffect, useState } from 'react';

export type AppMode = 'beginner' | 'pro';

const STORAGE_KEY = 'gcmp.mode';

function read(): AppMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'pro' || stored === 'beginner') return stored;
  } catch {
    // ignore
  }
  return 'beginner';
}

function write(mode: AppMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function useAppMode(): { mode: AppMode; setMode: (next: AppMode) => void } {
  const [mode, setModeState] = useState<AppMode>(() => read());

  useEffect(() => {
    function onStorage(e: StorageEvent): void {
      if (e.key === STORAGE_KEY) setModeState(read());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function setMode(next: AppMode): void {
    write(next);
    setModeState(next);
  }

  return { mode, setMode };
}

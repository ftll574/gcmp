/**
 * localStorage-backed saved routings. Wraps reads/writes with try/catch —
 * Safari iOS has a 5MB quota and silently fails over the cliff. We catch
 * QuotaExceededError and surface a toast (returned via lastError).
 */

import { useCallback, useEffect, useState } from 'react';
import type { SavedRouting } from '../components/SavedRoutings.tsx';

const STORAGE_KEY = 'gcmp.savedRoutings.v1';

function readAll(): SavedRouting[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is SavedRouting =>
        typeof x === 'object' && x !== null && typeof x.name === 'string' && typeof x.url === 'string',
    );
  } catch {
    return [];
  }
}

function writeAll(routings: ReadonlyArray<SavedRouting>): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routings));
    return null;
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
      return 'Saved-routings storage is full. Delete some saved routings to free space.';
    }
    return 'Could not save routing. Your browser may have storage disabled.';
  }
}

export function useSavedRoutings(): {
  saved: ReadonlyArray<SavedRouting>;
  save: (name: string, url: string) => void;
  remove: (name: string) => void;
  lastError: string | null;
} {
  const [saved, setSaved] = useState<SavedRouting[]>(() => readAll());
  const [lastError, setLastError] = useState<string | null>(null);

  // Listen for storage events from other tabs.
  useEffect(() => {
    function onStorage(e: StorageEvent): void {
      if (e.key === STORAGE_KEY) setSaved(readAll());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const save = useCallback((name: string, url: string) => {
    setSaved((current) => {
      // Replace existing entry with same name; insert at top otherwise.
      const others = current.filter((r) => r.name !== name);
      const next: SavedRouting[] = [
        { name, url, savedAt: new Date().toISOString() },
        ...others,
      ];
      const err = writeAll(next);
      if (err) {
        setLastError(err);
        return current; // Don't update state if write failed.
      }
      setLastError(null);
      return next;
    });
  }, []);

  const remove = useCallback((name: string) => {
    setSaved((current) => {
      const next = current.filter((r) => r.name !== name);
      writeAll(next);
      return next;
    });
  }, []);

  return { saved, save, remove, lastError };
}

'use client';

/**
 * Viewer preferences for the public site.
 *
 * Only one so far, and it is an accessibility control rather than a
 * decoration: score changes are announced into a live region by default, and
 * anyone who would rather not have a screen reader interrupt them can switch
 * that off without losing the visible score. The choice is remembered on the
 * device.
 *
 * `useSyncExternalStore` is used deliberately: it renders the server value
 * during hydration and then settles to the stored preference, so the toggle
 * can differ from the default without a hydration mismatch.
 */

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'swanlake:announce-scores';

function readStored(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

let announceEnabled = typeof window === 'undefined' ? true : readStored();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return announceEnabled;
}

function getServerSnapshot(): boolean {
  return true;
}

export interface AnnouncementPreference {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
}

export function useAnnouncements(): AnnouncementPreference {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setEnabled = useCallback((next: boolean) => {
    if (announceEnabled === next) return;
    announceEnabled = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // A private-mode browser simply forgets the choice next visit.
    }
    for (const listener of listeners) listener();
  }, []);

  const toggle = useCallback(() => setEnabled(!announceEnabled), [setEnabled]);

  return { enabled, setEnabled, toggle };
}

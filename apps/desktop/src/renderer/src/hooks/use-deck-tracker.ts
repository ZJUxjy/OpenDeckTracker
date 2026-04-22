import { useEffect } from 'react';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';

/**
 * Subscribe the global Zustand store to the main-process deck-tracker
 * IPC streams. Mount once in `App.tsx` (or any always-mounted root
 * component) — subsequent mounts are idempotent because subscriptions
 * are kept on the global window object.
 *
 * On first mount also pulls the current snapshot synchronously via
 * `getSnapshot()` so the panel doesn't flash empty before the next
 * push arrives.
 */
export function useDeckTracker(): void {
  const setSnapshot = useDeckTrackerStore((s) => s.setSnapshot);
  const applyEvent = useDeckTrackerStore((s) => s.applyEvent);

  useEffect(() => {
    const api = window.hdt?.deckTracker;
    if (!api) return;

    let alive = true;
    void api.getSnapshot().then((snapshot) => {
      if (alive && snapshot !== null) setSnapshot(snapshot);
    });

    const offState = api.onStateChange((s) => setSnapshot(s));
    const offEvent = api.onEvent((e) => applyEvent(e));

    return () => {
      alive = false;
      offState();
      offEvent();
    };
  }, [setSnapshot, applyEvent]);
}

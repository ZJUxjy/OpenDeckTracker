import { useEffect } from 'react';
import { useHearthWatcherStore } from '../stores/hearthwatcher-store';

export function useHearthWatcherStatus(): void {
  const setStatus = useHearthWatcherStore((state) => state.setStatus);

  useEffect(() => {
    const api = window.hdt?.hearthwatcher;
    if (!api) return;

    let alive = true;
    void api.getStatus().then((status) => {
      if (alive) setStatus(status);
    });
    const offStatus = api.onStatus((status) => setStatus(status));

    return () => {
      alive = false;
      offStatus();
    };
  }, [setStatus]);
}

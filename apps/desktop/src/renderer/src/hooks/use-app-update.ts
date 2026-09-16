import { useEffect, useRef, useState } from 'react';
import type { AppUpdateStatus } from '../../../shared/app-update';

export function useAppUpdate() {
  const [status, setStatus] = useState<AppUpdateStatus>({ state: 'idle' });
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const mounted = useRef(true);
  const requestPending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const api = window.hdt?.updates;
    if (!api) return;
    const off = api.onStatus((next) => {
      revision.current++;
      setStatus(next);
    });
    const initialRevision = revision.current;
    void api
      .getStatus()
      .then((next) => {
        if (mounted.current && revision.current === initialRevision) setStatus(next);
      })
      .catch((error: unknown) => {
        if (mounted.current && revision.current === initialRevision) {
          setStatus({ state: 'error', retry: 'check', message: String(error) });
        }
      });
    return () => {
      mounted.current = false;
      off();
    };
  }, []);

  async function act(action: 'check' | 'download' | 'install' | 'openReleases') {
    if (requestPending.current) return;
    requestPending.current = true;
    setBusy(true);
    const before = revision.current;
    try {
      const api = window.hdt?.updates;
      const next = api
        ? await api[action]()
        : action === 'check'
          ? await window.hdt?.about?.checkForUpdates()
          : undefined;
      if (mounted.current && revision.current === before && next) setStatus(next);
    } catch (error) {
      if (mounted.current)
        setStatus((previous) => ({
          ...previous,
          state: 'error',
          retry: action === 'openReleases' ? 'check' : action,
          message: String(error),
        }));
    } finally {
      requestPending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { status, busy, act };
}

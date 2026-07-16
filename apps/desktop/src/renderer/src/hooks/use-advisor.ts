import { useEffect } from 'react';
import { useAdvisorStore } from '../stores/advisor-store';

/**
 * Subscribe the global advisor store to main-process suggestion pushes.
 * Mounted once at App root so overlay/main routes share the same state.
 */
export function useAdvisor(): void {
  const applyState = useAdvisorStore((s) => s.applyState);

  useEffect(() => {
    const api = window.hdt?.advisor;
    if (!api?.onState) return;

    const offState = api.onState((state) => applyState(state));
    return () => {
      offState();
    };
  }, [applyState]);
}

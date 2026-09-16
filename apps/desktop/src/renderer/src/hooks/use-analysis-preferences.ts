import { useEffect, useState } from 'react';
import type { ResourceGroup } from '@hdt/core';

export interface AnalysisPreferences {
  targets: string[];
  mode: 'any' | 'all';
  draws: number;
  includeHand: boolean;
  groups: ResourceGroup[];
}
const DEFAULTS: AnalysisPreferences = { targets: [], mode: 'any', draws: 1, includeHand: false, groups: [] };
const CHANGED = 'hdt-analysis-preferences-changed';
const PREFIX = 'hdt.analysis.v1.';

function read(key: string): AnalysisPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null');
    if (!value || typeof value !== 'object') return DEFAULTS;
    const record = value as Record<string, unknown>;
    return {
      targets: Array.isArray(record.targets) ? [...new Set(record.targets.filter((id): id is string => typeof id === 'string'))] : [],
      mode: record.mode === 'all' ? 'all' : 'any',
      draws: typeof record.draws === 'number' && Number.isInteger(record.draws) && record.draws >= 0 && record.draws <= 100 ? record.draws : 1,
      includeHand: record.includeHand === true,
      groups: Array.isArray(record.groups) ? record.groups.filter((group): group is ResourceGroup => {
        if (!group || typeof group !== 'object') return false;
        const candidate = group as Record<string, unknown>;
        return typeof candidate.id === 'string' && typeof candidate.name === 'string' && Array.isArray(candidate.cardIds)
          && candidate.cardIds.every(id => typeof id === 'string');
      }).slice(0, 30) : [],
    };
  } catch { return DEFAULTS; }
}

/** Synchronize overlay windows and same-window consumers. */
export function useAnalysisPreferences(key: string) {
  const [state, setState] = useState(() => ({ key, value: read(key), saved: true }));
  useEffect(() => {
    const refresh = () => setState({ key, value: read(key), saved: true });
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === PREFIX + key) refresh(); };
    refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGED, refresh);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(CHANGED, refresh); };
  }, [key]);
  const current = state.key === key ? state.value : read(key);
  const update = (patch: Partial<AnalysisPreferences>) => {
    const value = { ...current, ...patch };
    let saved = true;
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { saved = false; }
    if (saved) window.dispatchEvent(new Event(CHANGED));
    setState({ key, value, saved });
  };
  return { preferences: current, update, saved: state.key !== key || state.saved };
}

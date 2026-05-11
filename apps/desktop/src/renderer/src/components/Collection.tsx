import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Database } from 'lucide-react';
import type { SetProgress } from '@hdt/core';

import { useTranslation } from '../i18n';
import { CollectionSetGrid } from './CollectionSetGrid';
import { CollectionSetDetail } from './CollectionSetDetail';
import { CollectionSyncButton, type SyncButtonState } from './CollectionSyncButton';

const COLLECTION_PROGRESS_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;
const SYNC_SUCCESS_AUTO_REVERT_MS = 2_000;
const SYNC_ERROR_AUTO_REVERT_MS = 3_000;

type ProgressResponse = {
  standard: SetProgress[];
  wild: SetProgress[];
  mirrorAlive: boolean;
  source?: 'live' | 'cache' | 'empty';
  lastUpdatedAt?: number | null;
};

export function Collection() {
  const { t } = useTranslation();
  const [dbStats, setDbStats] = useState<{ total: number; sets: number } | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [selectedSetCode, setSelectedSetCode] = useState<string | null>(null);
  const [ownedByDbfId, setOwnedByDbfId] = useState<Map<number, number>>(new Map());
  const [syncState, setSyncState] = useState<SyncButtonState>('idle');

  const mountedRef = useRef(true);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (revertTimerRef.current !== null) clearTimeout(revertTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (typeof window === 'undefined' || !window.hdt?.cards?.search) return;
    void window.hdt.cards
      .search({ limit: 10000 })
      .then((all) => {
        if (cancelled) return;
        const sets = new Set(all.map((c) => c.set));
        setDbStats({ total: all.length, sets: sets.size });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const loadProgress = useCallback(async (): Promise<ProgressResponse | null> => {
    if (typeof window === 'undefined' || !window.hdt?.collection?.getProgress) return null;
    const res = await window.hdt.collection.getProgress();
    if (mountedRef.current) setProgress(res);
    return res;
  }, []);

  // Per-card ownership for the detail view. Aggregates `count` across
  // premium tiers (normal/golden/diamond/signature) into a single
  // dbfId → total-copies map. Falls back to an empty map when
  // HearthMirror is unavailable; the detail view then shows every card
  // as unowned, which the dim overlay communicates clearly enough.
  const loadOwnedByDbfId = useCallback(async (): Promise<Map<number, number> | null> => {
    if (typeof window === 'undefined' || !window.hdt?.hearthmirror?.getCollection) return null;
    const rows = await window.hdt.hearthmirror.getCollection();
    if (rows === null) return null;
    const map = new Map<number, number>();
    for (const c of rows) map.set(c.dbfId, (map.get(c.dbfId) ?? 0) + c.count);
    if (mountedRef.current) setOwnedByDbfId(map);
    return map;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryIndex = 0;

    const tryLoad = async (): Promise<void> => {
      try {
        const res = await loadProgress();
        if (cancelled || res === null) return;
        if (res.source !== 'live' && !res.mirrorAlive) {
          if (retryIndex < COLLECTION_PROGRESS_RETRY_DELAYS_MS.length) {
            const delay = COLLECTION_PROGRESS_RETRY_DELAYS_MS[retryIndex]!;
            retryIndex += 1;
            retryTimer = setTimeout(() => { void tryLoad(); }, delay);
          }
        }
      } catch {
        if (cancelled) return;
        if (retryIndex < COLLECTION_PROGRESS_RETRY_DELAYS_MS.length) {
          const delay = COLLECTION_PROGRESS_RETRY_DELAYS_MS[retryIndex]!;
          retryIndex += 1;
          retryTimer = setTimeout(() => { void tryLoad(); }, delay);
        }
      }
    };

    void tryLoad();
    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, [loadProgress]);

  useEffect(() => {
    let cancelled = false;
    void loadOwnedByDbfId().catch(() => {});
    return () => { cancelled = true; void cancelled; };
  }, [loadOwnedByDbfId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.hdt?.decks?.syncFromLive) return;
    // Wrap in Promise.resolve so a stubbed `syncFromLive` that returns
    // `undefined` (e.g. after `vi.restoreAllMocks()` between tests) still
    // routes into the catch handler instead of throwing synchronously.
    void Promise.resolve(window.hdt.decks.syncFromLive()).catch(() => {});
  }, []);

  const handleSyncClick = useCallback(async (): Promise<void> => {
    if (revertTimerRef.current !== null) {
      clearTimeout(revertTimerRef.current);
      revertTimerRef.current = null;
    }
    setSyncState('syncing');

    const decksPromise = (window.hdt?.decks?.syncFromLive
      ? Promise.resolve(window.hdt.decks.syncFromLive())
      : Promise.resolve(undefined));
    const [, progressResult] = await Promise.allSettled([
      decksPromise.catch(() => undefined),
      loadProgress(),
      loadOwnedByDbfId().catch(() => null),
    ]);

    if (!mountedRef.current) return;
    if (progressResult.status === 'fulfilled') {
      setSyncState('success');
      revertTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setSyncState('idle');
      }, SYNC_SUCCESS_AUTO_REVERT_MS);
    } else {
      setSyncState('error');
      revertTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setSyncState('idle');
      }, SYNC_ERROR_AUTO_REVERT_MS);
    }
  }, [loadProgress, loadOwnedByDbfId]);

  const selectedRow = useMemo<SetProgress | null>(() => {
    if (selectedSetCode === null || progress === null) return null;
    const all = [...progress.standard, ...progress.wild];
    return all.find((r) => r.setCode === selectedSetCode) ?? null;
  }, [selectedSetCode, progress]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      <div className="px-8 pt-7 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shrink-0">
        <div className="flex flex-col w-full sm:w-auto mb-4 sm:mb-0">
          <h1 className="text-2xl font-bold text-text mb-1 flex items-center">
            <BookOpen size={22} className="mr-3 text-accent" />
            {t('collection.title')}
          </h1>
          <p className="text-text-secondary text-sm">{t('collection.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <CollectionSyncButton state={syncState} onClick={handleSyncClick} />
          {dbStats && (
            <div className="tahoe-card px-4 py-3 flex items-center space-x-3">
              <Database size={20} className="text-green opacity-80" />
              <div className="flex flex-col">
                <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-wider">{t('collection.dbCards')}</span>
                <span className="text-green font-bold text-lg font-mono tabular-nums leading-tight">{dbStats.total.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 px-8 pb-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {progress && selectedSetCode === null && (
            <CollectionSetGrid
              progress={progress}
              onOpenSet={(code) => setSelectedSetCode(code)}
            />
          )}
          {progress && selectedSetCode !== null && selectedRow !== null && (
            <CollectionSetDetail
              setCode={selectedSetCode}
              row={selectedRow}
              ownedByDbfId={ownedByDbfId}
              onBack={() => setSelectedSetCode(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

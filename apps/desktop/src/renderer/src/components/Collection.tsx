import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Database } from 'lucide-react';
import type { SetProgress } from '@hdt/core';

import { useTranslation } from '../i18n';
import { CollectionSetGrid } from './CollectionSetGrid';
import { CollectionSetDetail } from './CollectionSetDetail';
import { CollectionSyncButton, type SyncButtonState } from './CollectionSyncButton';

const COLLECTION_PROGRESS_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;
const COLLECTION_AUTO_SYNC_COOLDOWN_MS = 10 * 60 * 1000;
const SYNC_SUCCESS_AUTO_REVERT_MS = 2_000;
const SYNC_ERROR_AUTO_REVERT_MS = 3_000;

type ProgressResponse = {
  standard: SetProgress[];
  wild: SetProgress[];
  mirrorAlive: boolean;
  source?: 'live' | 'cache' | 'empty';
  lastUpdatedAt?: number | null;
  lastSyncedAt?: number | null;
  liveReadSkipped?: boolean;
  ownedCards?: Array<{ dbfId: number; count: number; premium: number }>;
};

function aggregateOwnedByDbfId(
  rows: readonly { dbfId: number; count: number; premium: number }[] | undefined,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const c of rows ?? []) map.set(c.dbfId, (map.get(c.dbfId) ?? 0) + c.count);
  return map;
}

export function Collection() {
  const { t } = useTranslation();
  const [dbStats, setDbStats] = useState<{ total: number; sets: number } | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [selectedSetCode, setSelectedSetCode] = useState<string | null>(null);
  const [ownedByDbfId, setOwnedByDbfId] = useState<Map<number, number>>(new Map());
  const [coverCardIds, setCoverCardIds] = useState<Map<string, string>>(new Map());
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

        // Pick a representative card per set for tile cover art:
        // prefer LEGENDARY-rarity collectible with the lowest dbfId
        // (typically the set's keynote legendary), falling back to any
        // collectible with the lowest dbfId.
        const covers = new Map<string, string>();
        const RARITY_RANK: Record<string, number> = {
          LEGENDARY: 0, EPIC: 1, RARE: 2, COMMON: 3, FREE: 4,
        };
        const bySet = new Map<string, { id: string; rank: number; dbfId: number }>();
        for (const c of all) {
          if (!c.collectible) continue;
          const rank = RARITY_RANK[c.rarity ?? 'FREE'] ?? 99;
          const prev = bySet.get(c.set);
          if (!prev || rank < prev.rank || (rank === prev.rank && c.dbfId < prev.dbfId)) {
            bySet.set(c.set, { id: c.id, rank, dbfId: c.dbfId });
          }
        }
        for (const [setCode, entry] of bySet) covers.set(setCode, entry.id);
        setCoverCardIds(covers);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const loadProgress = useCallback(async (request?: {
    force?: boolean;
    cooldownMs?: number;
  }): Promise<ProgressResponse | null> => {
    if (typeof window === 'undefined' || !window.hdt?.collection?.getProgress) return null;
    const res = await window.hdt.collection.getProgress(request);
    if (mountedRef.current) {
      setProgress(res);
      setOwnedByDbfId(aggregateOwnedByDbfId(res.ownedCards));
    }
    return res;
  }, []);

  const handleSyncClick = useCallback(async (): Promise<ProgressResponse | null> => {
    if (revertTimerRef.current !== null) {
      clearTimeout(revertTimerRef.current);
      revertTimerRef.current = null;
    }
    setSyncState('syncing');

    const decksPromise = (window.hdt?.decks?.syncFromLive
      ? Promise.resolve(window.hdt.decks.syncFromLive())
      : Promise.resolve(undefined));
    const diagnosticPromise = (window.hdt?.hearthmirror?.getCollectionDiagnostic
      ? Promise.resolve(window.hdt.hearthmirror.getCollectionDiagnostic())
      : Promise.resolve(null));
    const startedAt = Date.now();
    console.log('[collection-sync] start');
    const [decksResult, progressResult, diagnosticResult] = await Promise.allSettled([
      decksPromise,
      loadProgress({ force: true }),
      diagnosticPromise,
    ]);
    console.log('[collection-sync] decks', decksResult.status, decksResult.status === 'fulfilled' ? decksResult.value : decksResult.reason);
    console.log('[collection-sync] progress', progressResult.status, progressResult.status === 'fulfilled' ? {
      source: progressResult.value?.source,
      mirrorAlive: progressResult.value?.mirrorAlive,
      standardTiles: progressResult.value?.standard.length,
      totalOwned: progressResult.value?.standard.reduce((s, r) => s + r.ownedCopies, 0),
    } : progressResult.reason);
    console.log('[collection-sync] owned cards', progressResult.status === 'fulfilled' ? `${progressResult.value?.ownedCards?.length ?? 0} rows` : progressResult.reason);
    console.log('[hearthmirror:collection]', diagnosticResult.status, diagnosticResult.status === 'fulfilled' ? diagnosticResult.value : diagnosticResult.reason);
    console.log('[collection-sync] elapsed', Date.now() - startedAt, 'ms');

    if (!mountedRef.current) return progressResult.status === 'fulfilled' ? (progressResult.value ?? null) : null;
    if (progressResult.status === 'fulfilled') {
      setSyncState('success');
      revertTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setSyncState('idle');
      }, SYNC_SUCCESS_AUTO_REVERT_MS);
      return progressResult.value ?? null;
    }
    setSyncState('error');
    revertTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setSyncState('idle');
    }, SYNC_ERROR_AUTO_REVERT_MS);
    return null;
  }, [loadProgress]);

  // Auto-load on page mount. Main-side cooldown skips expensive live
  // reflection when a recent snapshot exists; retries are only scheduled
  // for actual live-read misses, not for cooldown cache hits.
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryIndex = 0;

    const trySync = async (): Promise<void> => {
      if (revertTimerRef.current !== null) {
        clearTimeout(revertTimerRef.current);
        revertTimerRef.current = null;
      }
      setSyncState('syncing');
      let res: ProgressResponse | null = null;
      try {
        res = await loadProgress({ cooldownMs: COLLECTION_AUTO_SYNC_COOLDOWN_MS });
        if (!cancelled && res !== null && res.source === 'live') {
          void Promise.resolve(window.hdt?.decks?.syncFromLive?.()).catch((err) => {
            console.warn('[collection-sync] auto deck sync failed', err);
          });
        }
        if (!cancelled) setSyncState('idle');
      } catch (err) {
        console.warn('[collection-sync] auto progress load failed', err);
        if (!cancelled) setSyncState('error');
      }
      if (cancelled || res === null) return;
      if (!res.liveReadSkipped && res.source !== 'live' && !res.mirrorAlive) {
        if (retryIndex < COLLECTION_PROGRESS_RETRY_DELAYS_MS.length) {
          const delay = COLLECTION_PROGRESS_RETRY_DELAYS_MS[retryIndex]!;
          retryIndex += 1;
          retryTimer = setTimeout(() => { void trySync(); }, delay);
        }
      }
    };

    void trySync();
    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, [loadProgress]);

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
              coverCardIds={coverCardIds}
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

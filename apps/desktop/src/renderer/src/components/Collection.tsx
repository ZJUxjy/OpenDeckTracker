import { useEffect, useState } from 'react';
import { BookOpen, Database } from 'lucide-react';
import type { SetProgress } from '@hdt/core';

import { useTranslation } from '../i18n';
import { CollectionSetGrid } from './CollectionSetGrid';

const COLLECTION_PROGRESS_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

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

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryIndex = 0;
    if (typeof window === 'undefined' || !window.hdt?.collection?.getProgress) return;

    const scheduleRetry = (): void => {
      if (cancelled || retryIndex >= COLLECTION_PROGRESS_RETRY_DELAYS_MS.length) return;
      const delay = COLLECTION_PROGRESS_RETRY_DELAYS_MS[retryIndex]!;
      retryIndex += 1;
      retryTimer = setTimeout(() => {
        void loadProgress();
      }, delay);
    };

    const loadProgress = async (): Promise<void> => {
      try {
        const res = await window.hdt.collection.getProgress();
        if (cancelled) return;
        setProgress(res);
        if (res.source !== 'live' && !res.mirrorAlive) {
          scheduleRetry();
        }
      } catch {
        scheduleRetry();
      }
    };

    void loadProgress();
    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.hdt?.decks?.syncFromLive) return;
    // Wrap in Promise.resolve so a stubbed `syncFromLive` that returns
    // `undefined` (e.g. after `vi.restoreAllMocks()` between tests) still
    // routes into the catch handler instead of throwing synchronously.
    void Promise.resolve(window.hdt.decks.syncFromLive()).catch(() => {});
  }, []);

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

      <div className="flex-1 px-8 pb-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {progress && selectedSetCode === null && (
            <CollectionSetGrid
              progress={progress}
              onOpenSet={(code) => setSelectedSetCode(code)}
            />
          )}
          {progress && selectedSetCode !== null && (
            <div data-testid="set-detail-placeholder">
              {/* Filled in by section 4 — CollectionSetDetail */}
              <button
                type="button"
                onClick={() => setSelectedSetCode(null)}
                data-testid="detail-back-placeholder"
              >
                back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

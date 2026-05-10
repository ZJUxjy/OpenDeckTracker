import { useEffect, useState } from 'react';
import { BookOpen, Database, AlertTriangle } from 'lucide-react';
import { SET_LABELS } from '@hdt/hearthdb';
import type { SetProgress } from '@hdt/core';

import { useTranslation } from '../i18n';

type ProgressResponse = {
  standard: SetProgress[];
  wild: SetProgress[];
  mirrorAlive: boolean;
};

export function Collection() {
  const { t, locale } = useTranslation();
  const [activeFormat, setActiveFormat] = useState<'standard' | 'wild'>('standard');
  const [dbStats, setDbStats] = useState<{ total: number; sets: number } | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);

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
    if (typeof window === 'undefined' || !window.hdt?.collection?.getProgress) return;
    void window.hdt.collection
      .getProgress()
      .then((res) => { if (!cancelled) setProgress(res); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const activeRows = progress
    ? activeFormat === 'standard' ? progress.standard : progress.wild
    : [];

  const totalOwned = activeRows.reduce((s, r) => s + r.ownedCopies, 0);
  const totalMax = activeRows.reduce((s, r) => s + r.totalCopies, 0);
  const percentage = totalMax > 0 ? Math.round((totalOwned / totalMax) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Top Header — translucent so the body's Mica surface bleeds through */}
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
        <div className="max-w-4xl mx-auto space-y-5">

          {/* Format Switcher */}
          <div className="flex justify-start">
            <div className="flex bg-white/5 dark:bg-black/20 rounded-md p-1 border border-border-hairline">
              {(['standard', 'wild'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setActiveFormat(fmt)}
                  className={`px-4 py-1.5 rounded text-sm font-semibold transition-all ${
                    activeFormat === fmt
                      ? 'bg-accent text-text-on-accent shadow-[0_1px_3px_rgba(0,0,0,0.18)]'
                      : 'text-text-secondary hover:text-text'
                  }`}
                >
                  {t(`collection.progress.tab${fmt === 'standard' ? 'Standard' : 'Wild'}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Mirror banner */}
          {progress && !progress.mirrorAlive && (
            <div className="tahoe-card p-4 flex items-center space-x-3">
              <AlertTriangle size={20} className="text-accent shrink-0" />
              <p className="text-text-secondary text-sm">{t('collection.progress.mirrorBanner')}</p>
            </div>
          )}

          {/* Overall Progress */}
          <div className="tahoe-card p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-text">{t('collection.overallProgress')}</h2>
              <div className="text-right">
                <span className="text-accent font-bold text-2xl font-mono tabular-nums">{totalOwned}</span>
                <span className="text-text-tertiary font-medium font-mono tabular-nums"> / {totalMax}</span>
              </div>
            </div>

            <div className="w-full bg-black/8 dark:bg-white/8 rounded-full h-3 mb-2 overflow-hidden">
              <div
                className="bg-accent h-3 rounded-full transition-all duration-1000 ease-out relative"
                style={{ width: `${percentage}%` }}
              >
                <div className="absolute inset-0 w-full h-full animate-[shimmer_2s_infinite]" style={{
                  backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0) 100%)',
                  backgroundSize: '200% 100%'
                }} />
              </div>
            </div>
            <p className="text-text-secondary text-sm font-medium">{t('collection.percentComplete', { percent: percentage })}</p>
          </div>

          {/* Expansions Grid */}
          <div>
            <h2 className="text-xl font-bold text-text mb-4 flex items-center">
              {t('collection.expansions')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeRows.map((row) => {
                const setPercentage = row.totalCopies > 0
                  ? Math.round((row.ownedCopies / row.totalCopies) * 100)
                  : 0;
                const isComplete = row.totalCopies > 0 && row.ownedCopies === row.totalCopies;
                const label = SET_LABELS[row.setCode]
                  ? SET_LABELS[row.setCode]![locale] ?? SET_LABELS[row.setCode]!['en-US']
                  : t('collection.progress.unknownSet', { code: row.setCode });

                return (
                  <div key={row.setCode} className="tahoe-card p-5 group cursor-pointer relative overflow-hidden">
                    {isComplete && (
                      <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none">
                        <div className="absolute top-4 right-[-16px] w-[100px] transform rotate-45 bg-accent text-text-on-accent text-[10px] font-bold text-center py-1 uppercase shadow-[0_1px_3px_rgba(0,0,0,0.20)]">
                          {t('collection.complete')}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-4 mb-4 relative z-10">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-text font-bold truncate pr-4">{label}</h3>
                        <p className="text-text-tertiary text-sm font-mono tabular-nums">
                          {t('collection.cardsCount', { collected: row.ownedUniqueCards, total: row.totalCards })}
                        </p>
                      </div>
                    </div>

                    <div className="w-full bg-black/8 dark:bg-white/8 rounded-full h-2 overflow-hidden relative z-10">
                      <div
                        className={`h-2 rounded-full transition-all duration-1000 ease-out ${
                          isComplete ? 'bg-green' : 'bg-accent'
                        }`}
                        style={{ width: `${setPercentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

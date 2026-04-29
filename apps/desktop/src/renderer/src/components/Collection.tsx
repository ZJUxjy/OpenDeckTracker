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
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">

      {/* Top Header */}
      <div className="bg-bg border-b border-border p-6 flex flex-col sm:flex-row items-center justify-between shrink-0 sticky top-0 z-10">
        <div className="flex flex-col w-full sm:w-auto mb-4 sm:mb-0">
          <h1 className="text-2xl font-bold text-text mb-1 flex items-center">
            <BookOpen size={24} className="mr-3 text-accent" />
            {t('collection.title')}
          </h1>
          <p className="text-text-dim text-sm">{t('collection.subtitle')}</p>
        </div>

        <div className="flex space-x-4 w-full sm:w-auto">
          {dbStats && (
            <div className="bg-bg-2 p-3 rounded-lg border border-border flex items-center space-x-3 shadow-md">
              <div className="flex flex-col items-end">
                <span className="text-xs text-text-dim font-bold uppercase tracking-wider">{t('collection.dbCards')}</span>
                <span className="text-green font-black text-lg font-mono tabular-nums">{dbStats.total.toLocaleString()}</span>
              </div>
              <Database size={24} className="text-green opacity-80" />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* Main Content Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-8">

            {/* Format Switcher */}
            <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 bg-bg-2 p-4 rounded-xl border border-border shadow-sm">
              <div className="flex bg-bg rounded-md p-1 border border-border">
                {(['standard', 'wild'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setActiveFormat(fmt)}
                    className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
                      activeFormat === fmt
                        ? 'bg-accent text-bg shadow'
                        : 'text-text-mute hover:text-text'
                    }`}
                  >
                    {t(`collection.progress.tab${fmt === 'standard' ? 'Standard' : 'Wild'}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Mirror banner */}
            {progress && !progress.mirrorAlive && (
              <div className="bg-bg-2 border border-accent/30 rounded-xl p-4 flex items-center space-x-3">
                <AlertTriangle size={20} className="text-accent shrink-0" />
                <p className="text-text-dim text-sm">{t('collection.progress.mirrorBanner')}</p>
              </div>
            )}

            {/* Overall Progress */}
            <div className="bg-bg-2 border border-border rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-text">{t('collection.overallProgress')}</h2>
                <div className="text-right">
                  <span className="text-accent font-bold text-2xl font-mono tabular-nums">{totalOwned}</span>
                  <span className="text-text-mute font-medium font-mono tabular-nums"> / {totalMax}</span>
                </div>
              </div>

              <div className="w-full bg-bg rounded-full h-4 mb-2 border border-border overflow-hidden shadow-inner">
                <div
                  className="bg-gradient-to-r from-accent to-accent h-4 rounded-full transition-all duration-1000 ease-out relative"
                  style={{ width: `${percentage}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]" style={{
                    backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%)',
                    backgroundSize: '200% 100%'
                  }} />
                </div>
              </div>
              <p className="text-text-dim text-sm font-medium">{t('collection.percentComplete', { percent: percentage })}</p>
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
                    <div key={row.setCode} className="bg-bg-2 border border-border rounded-xl p-5 hover:border-border-hi transition-colors group cursor-pointer relative overflow-hidden">
                      {isComplete && (
                        <div className="absolute top-0 right-0 w-16 h-16">
                          <div className="absolute top-4 right-[-16px] w-[100px] transform rotate-45 bg-accent text-bg text-[10px] font-bold text-center py-1 uppercase shadow-md">
                            {t('collection.complete')}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center space-x-4 mb-4 relative z-10">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-text font-bold truncate pr-4">{label}</h3>
                          <p className="text-text-mute text-sm font-mono tabular-nums">
                            {t('collection.cardsCount', { collected: row.ownedUniqueCards, total: row.totalCards })}
                          </p>
                        </div>
                      </div>

                      <div className="w-full bg-bg rounded-full h-2.5 border border-border overflow-hidden relative z-10">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${
                            isComplete ? 'bg-accent shadow-[0_0_10px_var(--color-accent)]' : 'bg-bg-3'
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
    </div>
  );
}

import { useMemo, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { calculateDrawOdds, type DeckTrackerSnapshot } from '@hdt/core';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useAnalysisPreferences } from '../hooks/use-analysis-preferences';
import { useCardDef } from '../hooks/use-card-def';
import { useLocale, useTranslation } from '../i18n';
import { DrawRiskPanel } from './DrawRiskPanel';
import { ResourceGroupsPanel } from './ResourceGroupsPanel';

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties;
type AnalysisSnapshot = { [K in 'deck' | 'phase' | 'matchStartedAt' | 'friendlyDeckCount' | 'friendlyHand'
  | 'friendlyDrawContext' | 'friendlyEffects' | 'opposingEffects' | 'resourcePlays']: DeckTrackerSnapshot[K] };

export function TrackerAnalysisPanel() {
  const snapshot = useDeckTrackerStore(useShallow(s => s.snapshot ? {
    deck: s.snapshot.deck, phase: s.snapshot.phase, matchStartedAt: s.snapshot.matchStartedAt,
    friendlyDeckCount: s.snapshot.friendlyDeckCount, friendlyHand: s.snapshot.friendlyHand,
    friendlyDrawContext: s.snapshot.friendlyDrawContext, friendlyEffects: s.snapshot.friendlyEffects,
    opposingEffects: s.snapshot.opposingEffects, resourcePlays: s.snapshot.resourcePlays,
  } : null));
  const { t } = useTranslation();
  if (!snapshot?.deck || !['IN_MATCH', 'PRE_MATCH'].includes(snapshot.phase)) {
    return <div className="p-4 text-sm text-text-mute">{t('analysis.waiting')}</div>;
  }
  return <AnalysisContents snapshot={snapshot} />;
}

function AnalysisContents({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const deck = snapshot.deck!;
  const key = String(deck.id) + ':' + deck.original.map(c => `${c.cardId}:${c.count}`).sort().join(',');
  const { preferences, update, saved } = useAnalysisPreferences(key);
  const choices = useMemo(() => [...new Set([...deck.original, ...deck.remaining].map(c => c.cardId))], [deck.original, deck.remaining]);
  const activeTargets = preferences.targets.filter(id => choices.includes(id));
  const getOdds = (draws: number) => calculateDrawOdds({ remaining: deck.remaining, targets: activeTargets,
    draws, mode: preferences.mode, knownPositions: deck.knownPositions,
    observedDeckSize: snapshot.friendlyDeckCount, held: preferences.includeHand ? snapshot.friendlyHand : [],
  });
  const result = getOdds(preferences.draws);
  return (
    <div data-testid="tracker-analysis-panel" className="h-full overflow-y-auto p-3 space-y-4 text-sm text-text bg-overlay-surface" style={NO_DRAG}>
      <DrawRiskPanel key={snapshot.matchStartedAt ?? 'unknown-match'} snapshot={snapshot} draws={preferences.draws} />
      <ResourceGroupsPanel key={key} storageKey={key} choices={choices} deck={deck.original} remaining={deck.remaining}
        hand={snapshot.friendlyHand} observed={snapshot.resourcePlays?.filter(play => play.side === 'friendly') ?? []} predicted={false} />
      <section className="space-y-3" aria-label={t('analysis.odds')}>
        <h2 className="font-semibold text-accent">{t('analysis.odds')}</h2>
        <p className="text-xs text-text-mute">{t('analysis.explanation')}</p>
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1 min-w-0">
            <span className="block text-xs">{t('analysis.mode')}</span>
            <select aria-label={t('analysis.mode')} className="bg-overlay-elevated border border-border rounded p-1 max-w-full" value={preferences.mode}
              onChange={event => update({ mode: event.target.value === 'all' ? 'all' : 'any' })}>
              <option value="any">{t('analysis.any')}</option>
              <option value="all">{t('analysis.all')}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs">{t('analysis.draws')}</span>
            <input type="number" min={0} max={100} className="w-16 bg-overlay-elevated border border-border rounded p-1"
              value={preferences.draws} onChange={event => {
                const value = event.target.valueAsNumber;
                if (Number.isInteger(value) && value >= 0 && value <= 100) update({ draws: value });
              }} />
          </label>
        </div>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={preferences.includeHand} onChange={event => update({ includeHand: event.target.checked })} />
          {t('analysis.includeHand')}
        </label>
        <div className="grid grid-cols-3 gap-2 rounded border border-border p-2 text-center">
          {[1, 3, preferences.draws].map((draws, index) => {
            const probability = getOdds(draws).probability;
            return <div key={index}>
              <div className="text-[11px] text-text-mute">{t(index === 2 ? 'analysis.selectedDraws' : 'analysis.nextDraws', { n: draws })}</div>
              <output className="font-mono text-lg text-accent" data-testid={`draw-odds-${index}`}>
                {probability === null ? '—' : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(probability)}
              </output>
            </div>;
          })}
        </div>
        {result.status !== 'ready' && <p role="status" className="text-xs text-text-mute">
          {t(result.status === 'no-targets' ? 'analysis.selectTargets' : 'analysis.inconsistent')}
        </p>}
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold mb-2">{t('analysis.targets')}</legend>
          {choices.map(id => <TargetChoice key={id} cardId={id} count={deck.remaining.find(c => c.cardId === id)?.count ?? 0}
            checked={activeTargets.includes(id)} onChange={() => update({ targets: activeTargets.includes(id)
              ? activeTargets.filter(target => target !== id) : [...activeTargets, id] })} />)}
        </fieldset>
        <button type="button" className="text-xs text-accent underline" onClick={() => update({ targets: [] })}>{t('analysis.clear')}</button>
        {!saved && <p role="alert" className="text-xs text-red">{t('analysis.saveFailed')}</p>}
      </section>
    </div>
  );
}

function TargetChoice({ cardId, count, checked, onChange }: { cardId: string; count: number; checked: boolean; onChange: () => void }) {
  const card = useCardDef(cardId);
  return <label className="flex items-center gap-2 rounded p-1 hover:bg-overlay-elevated cursor-pointer">
    <input type="checkbox" aria-label={card?.name ?? cardId} checked={checked} onChange={onChange} />
    <span className="flex-1 min-w-0 break-words">{card?.name ?? cardId}</span>
    <span className="text-xs text-text-mute tabular-nums">×{count}</span>
  </label>;
}

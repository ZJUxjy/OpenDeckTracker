import { useState } from 'react';
import { forecastDrawRisk, type DeckTrackerSnapshot } from '@hdt/core';
import { useTranslation } from '../i18n';

type DrawSnapshot = { [K in 'friendlyDrawContext' | 'friendlyDeckCount' | 'friendlyHand' | 'friendlyEffects' | 'opposingEffects']: DeckTrackerSnapshot[K] };
export function DrawRiskPanel({ snapshot, draws }: { snapshot: DrawSnapshot; draws: number }) {
  const { t } = useTranslation();
  const [fatigue, setFatigue] = useState('');
  const [capacity, setCapacity] = useState('');
  const context = snapshot.friendlyDrawContext;
  const manualNumber = (value: string): number | null => value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const fatigueTaken = manualNumber(fatigue) ?? context?.fatigueTaken ?? null;
  const handLimit = manualNumber(capacity) ?? context?.handLimit ?? null;
  const forecast = (count: number) => forecastDrawRisk({
    deckSize: snapshot.friendlyDeckCount, handSize: snapshot.friendlyHand.length,
    draws: count, fatigueTaken, handLimit, fatigueImmune: context?.fatigueImmune ?? false,
  });
  const planned = forecast(draws);
  const extraDraws = [...snapshot.friendlyEffects, ...snapshot.opposingEffects]
    .filter(effect => effect.id === 'dew-process' && !effect.pending)
    .reduce((sum, effect) => sum + effect.triggerCount, 0);
  const nextTurn = forecast(1 + extraDraws);
  const value = (number: number | null) => number === null ? t('analysis.unknown') : String(number);
  return <section className="space-y-3 border-b border-border pb-3" aria-label={t('analysis.drawRisk')}>
    <h2 className="font-semibold text-accent">{t('analysis.drawRisk')}</h2>
    <p className="text-xs text-text-mute">{t('analysis.drawRiskHint')}</p>
    <div className="flex flex-wrap gap-3 text-xs">
      <label>{t('analysis.fatigueOverride')}
        <input type="number" min={0} max={1000} value={fatigue} placeholder={value(context?.fatigueTaken ?? null)}
          className="block w-24 bg-overlay-elevated border border-border rounded p-1" onChange={event => setFatigue(event.target.value)} />
      </label>
      <label>{t('analysis.capacityOverride')}
        <input type="number" min={0} max={100} value={capacity} placeholder={value(context?.handLimit ?? null)}
          className="block w-24 bg-overlay-elevated border border-border rounded p-1" onChange={event => setCapacity(event.target.value)} />
      </label>
    </div>
    <p className="text-xs text-text-mute">{t('analysis.nextFatigue', { n: value(planned.nextFatigue) })}</p>
    <div className="space-y-2 text-xs" data-testid="draw-risk-results">
      <p>{t('analysis.riskResult', { n: draws, drawn: value(planned.drawn), burned: value(planned.burned), damage: value(planned.fatigueDamage) })}</p>
      {(planned.burned ?? 0) > 0 || (planned.fatigueDamage ?? 0) > 0
        ? <p role="status" className="text-red">{t('analysis.drawWarning')}</p> : null}
      <p>{t('analysis.nextTurnRisk', { n: 1 + extraDraws, burned: value(nextTurn.burned), damage: value(nextTurn.fatigueDamage) })}</p>
      <p className="text-text-mute">{t('analysis.nextTurnHint')}</p>
      {context?.fatigueImmune && <p>{t('analysis.fatigueImmune')}</p>}
    </div>
  </section>;
}

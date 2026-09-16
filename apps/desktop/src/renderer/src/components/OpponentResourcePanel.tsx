import { useState } from 'react';
import type { OpponentDeckPrediction } from '@hdt/core';
import { useTranslation } from '../i18n';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { ResourceGroupsPanel } from './ResourceGroupsPanel';

export function OpponentResourcePanel({ predictions }: { predictions: readonly OpponentDeckPrediction[] }) {
  const { t } = useTranslation();
  const snapshot = useDeckTrackerStore(state => state.snapshot);
  const [selected, setSelected] = useState('');
  const prediction = predictions.find(candidate => candidate.deck.id === selected) ?? predictions[0];
  const observed = snapshot?.resourcePlays?.filter(play => play.side === 'opposing') ?? snapshot?.opponent.revealed ?? [];
  const cards = prediction?.deck.deckCardList ?? observed.map(card => ({ cardId: card.cardId, count: 1 }));
  const key = prediction ? `opponent:${prediction.deck.id}:${prediction.deck.deckstring}` : `opponent:${snapshot?.opponentClass ?? 'unknown'}`;
  return <div className="p-3 space-y-2">
    {predictions.length > 0 && <label className="block text-xs text-text-mute">{t('analysis.resourceDeck')}
      <select className="block w-full bg-overlay-elevated border border-border p-1 rounded" value={prediction?.deck.id}
        onChange={event => setSelected(event.target.value)}>
        {predictions.map(candidate => <option key={candidate.deck.id} value={candidate.deck.id}>{candidate.deck.name}</option>)}
      </select>
    </label>}
    <ResourceGroupsPanel key={key} storageKey={key} deck={cards} choices={[...new Set(cards.map(card => card.cardId))]}
      observed={observed} predicted={Boolean(prediction)} />
  </div>;
}

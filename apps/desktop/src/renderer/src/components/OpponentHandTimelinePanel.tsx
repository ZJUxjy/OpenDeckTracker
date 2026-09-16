import type { OpponentHandCard } from '@hdt/core';
import { useShallow } from 'zustand/react/shallow';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useCardDef } from '../hooks/use-card-def';
import { useTranslation } from '../i18n';

export function OpponentHandTimelinePanel() {
  const { t } = useTranslation();
  const snapshot = useDeckTrackerStore(useShallow(state => ({
    opposingHandTimeline: state.snapshot?.opposingHandTimeline,
    opposingHandCount: state.snapshot?.opposingHandCount,
    turn: state.snapshot?.turn,
  })));
  const cards = snapshot?.opposingHandTimeline ?? [];
  const count = snapshot?.opposingHandCount ?? 0;
  return <section className="p-3 space-y-2 text-xs text-text border-b border-border" aria-label={t('analysis.opponentHand')}>
    <h2 className="font-semibold text-accent">{t('analysis.opponentHand')}</h2>
    <p className="text-text-mute">{t('analysis.handHint')}</p>
    {!cards.length && <p>{t('analysis.handEmpty')}</p>}
    {cards.length !== count && <p role="status" className="text-text-mute">{t('analysis.handIncomplete', { observed: cards.length, total: count })}</p>}
    <ol className="space-y-2">
      {cards.map(card => <HandCardRow key={card.entityId} card={card} turn={snapshot?.turn ?? null} />)}
    </ol>
  </section>;
}

function HandCardRow({ card, turn }: { card: OpponentHandCard; turn: number | null }) {
  const { t } = useTranslation();
  const definition = useCardDef(card.cardId ?? '');
  const source = useCardDef(card.sourceCardId ?? '');
  return <li className="rounded border border-border bg-overlay-elevated p-2 space-y-1">
    <div className="font-medium">{t('analysis.handPosition', { n: card.position ?? '?' })} · {card.cardId ? definition?.name ?? card.cardId : t('analysis.hiddenCard')}</div>
    <p className="text-text-mute">{t(`analysis.handOrigin.${card.origin}`)} · {card.acquiredTurn === null ? t('analysis.unknownAcquisition')
      : t('analysis.acquiredTurn', { n: card.acquiredTurn })}
      {turn !== null && card.acquiredTurn !== null && turn >= card.acquiredTurn
        ? ` · ${t('analysis.handAge', { n: turn - card.acquiredTurn })}` : ''}</p>
    {card.keptFromMulligan === true && <p className="text-accent">{t('analysis.kept')}</p>}
    {card.sourceCardId && <p>{t('analysis.createdBy', { name: source?.name ?? card.sourceCardId })}</p>}
  </li>;
}

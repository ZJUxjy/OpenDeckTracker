import type {
  GameProgressAnalysisEvent,
  GameProgressAnalysisEventKind,
} from './game-progress-analysis';

export type CardNameResolver = (cardId: string) => string | null;

export type GameProgressNarrationFactValue = string | number | boolean | null;

export interface GameProgressNarrationFrame {
  sequence: number;
  sourceEventIndex: number;
  eventKind: GameProgressAnalysisEventKind;
  text: string;
  facts: Record<string, GameProgressNarrationFactValue>;
}

export function narrateGameProgressEvents(
  events: readonly GameProgressAnalysisEvent[],
  options: { resolveCardName?: CardNameResolver } = {},
): GameProgressNarrationFrame[] {
  return events.map((event) => ({
    sequence: event.sequence,
    sourceEventIndex: event.sourceEventIndex,
    eventKind: event.kind,
    text: narrateEvent(event, options.resolveCardName ?? fallbackCardName),
    facts: eventFacts(event),
  }));
}

function narrateEvent(
  event: GameProgressAnalysisEvent,
  resolveCardName: CardNameResolver,
): string {
  switch (event.kind) {
    case 'game-started':
      return '对局开始。';
    case 'starting-hand':
      return '起手牌已记录。';
    case 'post-mulligan-hand':
      return '换牌后的手牌已记录。';
    case 'turn-start':
      return narrateTurnStart(event);
    case 'card-drawn':
      return narrateCardDrawn(event, resolveCardName);
    case 'card-played':
      return narrateCardPlayed(event, resolveCardName);
    case 'opponent-card-revealed':
      return narrateOpponentReveal(event, resolveCardName);
    case 'deck-shuffled':
      return `${subjectForActor(event.actor)}牌库被洗牌。`;
    case 'game-completed':
      return '对局结束。';
  }
}

function narrateTurnStart(event: GameProgressAnalysisEvent): string {
  if (typeof event.turnNumber === 'number') {
    return `第${event.turnNumber}回合开始。`;
  }
  if (event.actor === 'local' || event.actor === 'opponent') {
    return `${subjectForActor(event.actor)}回合开始。`;
  }
  return '新的回合开始。';
}

function narrateCardDrawn(
  event: GameProgressAnalysisEvent,
  resolveCardName: CardNameResolver,
): string {
  const subject = subjectForActor(event.actor);
  if (event.cardId === undefined) {
    return `${subject}抽了一张牌。`;
  }
  return `${subject}抽到了${cardLabel(event.cardId, resolveCardName)}。`;
}

function narrateCardPlayed(
  event: GameProgressAnalysisEvent,
  resolveCardName: CardNameResolver,
): string {
  const subject = subjectForActor(event.actor);
  if (event.cardId === undefined) {
    return `${subject}使用了一张牌。`;
  }
  return `${subject}使用了${cardLabel(event.cardId, resolveCardName)}。`;
}

function narrateOpponentReveal(
  event: GameProgressAnalysisEvent,
  resolveCardName: CardNameResolver,
): string {
  if (event.cardId === undefined) {
    return '对手公开了一张牌。';
  }
  return `对手公开了${cardLabel(event.cardId, resolveCardName)}。`;
}

function cardLabel(cardId: string, resolveCardName: CardNameResolver): string {
  return resolveCardName(cardId) ?? cardId;
}

function fallbackCardName(cardId: string): string {
  return cardId;
}

function subjectForActor(actor: GameProgressAnalysisEvent['actor']): string {
  switch (actor) {
    case 'local':
      return '我方';
    case 'opponent':
      return '对手';
    case 'game':
      return '';
    case 'unknown':
      return '未知玩家';
  }
}

function eventFacts(event: GameProgressAnalysisEvent): Record<string, GameProgressNarrationFactValue> {
  return compactFacts({
    actor: event.actor,
    cardId: event.cardId,
    entityId: event.entityId,
    controllerId: event.controllerId,
    targetEntityId: event.targetEntityId,
    turnNumber: event.turnNumber,
    playerId: event.playerId,
  });
}

function compactFacts(
  facts: Record<string, GameProgressNarrationFactValue | undefined>,
): Record<string, GameProgressNarrationFactValue> {
  const compact: Record<string, GameProgressNarrationFactValue> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (value !== undefined) {
      compact[key] = value;
    }
  }
  return compact;
}

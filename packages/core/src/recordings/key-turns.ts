import type { MatchRecordingDetail, MatchTimelineEvent } from './match-recording';

export interface ReplayCard {
  entityId: number;
  controllerId: number | null;
  zone: string;
  position: number | null;
  cardId: string | null;
  attack: number | null;
  health: number | null;
  damage: number | null;
  armor: number | null;
  cardType: string | null;
}
export interface ReplayFrame {
  sourceEventIndex: number;
  turn: number | null;
  friendlyControllerId: number | null;
  board: ReplayCard[];
  friendlyHand: ReplayCard[];
  opponentHand: ReplayCard[];
  incomplete: boolean;
}
export interface ReplayKeyEvent {
  sourceEventIndex: number;
  turn: number | null;
  kinds: MatchTimelineEvent['kind'][];
}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const number = (value: unknown): number | null => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};
const entityId = (value: unknown): number | null => number(value)
  ?? (typeof value === 'string' ? number(/\bid=(\d+)/i.exec(value)?.[1]) : null);
const zones: Record<number, string> = { 1: 'PLAY', 2: 'DECK', 3: 'HAND', 4: 'GRAVEYARD', 5: 'REMOVEDFROMGAME', 6: 'SETASIDE', 7: 'SECRET' };

/** Group recorded decision boundaries without inferring a missed lethal. */
export function indexReplayKeyEvents(recording: Pick<MatchRecordingDetail, 'timeline'>): ReplayKeyEvent[] {
  const result = new Map<number, ReplayKeyEvent>();
  let turn: number | null = null;
  for (const event of [...recording.timeline].sort((a, b) => a.sourceEventIndex - b.sourceEventIndex)) {
    if (!Number.isSafeInteger(event.sourceEventIndex) || event.sourceEventIndex < 0) continue;
    if (event.kind === 'turn-start') turn = event.turnNumber;
    const entry = result.get(event.sourceEventIndex) ?? { sourceEventIndex: event.sourceEventIndex, turn, kinds: [] };
    entry.turn = turn;
    if (!entry.kinds.includes(event.kind)) entry.kinds.push(event.kind);
    result.set(entry.sourceEventIndex, entry);
  }
  return [...result.values()];
}

/** Reconstruct only facts seen by this point. Never seed from final entities or future reveals. */
export function reconstructReplayFrame(recording: MatchRecordingDetail, requestedIndex: number): ReplayFrame {
  const end = Number.isSafeInteger(requestedIndex) ? Math.max(-1, Math.min(requestedIndex, recording.rawEvents.length - 1)) : -1;
  const friendlyControllerId = recording.initialState.startingHand[0]?.controllerId
    ?? recording.initialState.postMulliganHand[0]?.controllerId ?? null;
  const cards = new Map<number, ReplayCard>();
  const identities = new Map<number, string>();
  let turn: number | null = null;
  let incomplete = end < 0 || requestedIndex > end;
  let sawCreate = false;
  for (let i = 0; i <= end; i++) {
    const event = object(recording.rawEvents[i]);
    if (!event || typeof event.type !== 'string') { incomplete = true; continue; }
    if (event.type === 'create-game') { cards.clear(); identities.clear(); turn = null; sawCreate = true; continue; }
    if (event.type === 'tag-change' && event.entity === 'GameEntity' && event.tag === 'TURN') turn = number(event.value);
    if (!['full-entity', 'show-entity', 'change-entity', 'hide-entity', 'tag-change'].includes(event.type)) continue;
    const id = entityId(event.type === 'full-entity' ? event.entityId : event.entity);
    if (id === null) continue;
    const tags = event.type === 'tag-change' && typeof event.tag === 'string'
      ? { [event.tag]: event.value } : object(event.tags) ?? {};
    const card = cards.get(id) ?? { entityId: id, controllerId: null, zone: 'UNKNOWN', position: null,
      cardId: null, attack: null, health: null, damage: null, armor: null, cardType: null };
    const previousZone = card.zone;
    card.controllerId = number(tags.CONTROLLER) ?? number(tags.PLAYER_ID) ?? card.controllerId;
    if (tags.ZONE !== undefined) card.zone = zones[Number(tags.ZONE)] ?? String(tags.ZONE).toUpperCase();
    if (tags.ZONE_POSITION !== undefined) card.position = number(tags.ZONE_POSITION);
    for (const [tag, field] of [['ATK', 'attack'], ['HEALTH', 'health'], ['DAMAGE', 'damage'], ['ARMOR', 'armor']] as const) {
      if (tags[tag] !== undefined) card[field] = number(tags[tag]);
    }
    if (tags.CARDTYPE !== undefined) card.cardType = String(tags.CARDTYPE);
    if (event.type === 'change-entity' || event.type === 'hide-entity'
      || (card.zone === 'DECK' && previousZone !== 'DECK')) {
      identities.delete(id); card.cardId = null;
    }
    const publicZone = card.zone === 'PLAY' || card.zone === 'GRAVEYARD';
    const friendlyHand = friendlyControllerId !== null && card.controllerId === friendlyControllerId && card.zone === 'HAND';
    // A full hidden opponent entity can carry a card id in imported logs. Ignore it.
    if (typeof event.cardId === 'string' && event.cardId && event.type !== 'hide-entity'
      && (publicZone || friendlyHand || event.type === 'show-entity')) identities.set(id, event.cardId);
    card.cardId = card.zone === 'DECK' || card.zone === 'SECRET' ? null : identities.get(id) ?? null;
    cards.set(id, card);
  }
  const sorted = [...cards.values()].sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.entityId - b.entityId);
  return { sourceEventIndex: end, turn, friendlyControllerId,
    board: sorted.filter(card => card.zone === 'PLAY'),
    friendlyHand: sorted.filter(card => card.zone === 'HAND' && friendlyControllerId !== null && card.controllerId === friendlyControllerId),
    opponentHand: sorted.filter(card => card.zone === 'HAND' && (friendlyControllerId === null || card.controllerId !== friendlyControllerId))
      .map(card => ({ ...card, attack: null, health: null, damage: null, armor: null, cardType: null })),
    incomplete: incomplete || !sawCreate || friendlyControllerId === null };
}

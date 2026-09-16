import { describe, expect, it } from 'vitest';
import type { PowerEvent } from '@hdt/hearthwatcher';
import { OpponentHandTimeline } from './opponent-hand-timeline';

const tag = (entity: number | string, name: string, value: string | number): PowerEvent =>
  ({ type: 'tag-change', entity, tag: name, value, raw: '', content: '' });
const full = (id: number, zone: string, cardId = ''): PowerEvent =>
  ({ type: 'full-entity', entityId: id, cardId, tags: { CONTROLLER: 2, ZONE: zone, ZONE_POSITION: id }, raw: '', content: '' });

describe('OpponentHandTimeline', () => {
  it('keeps acquisition facts stable while hand positions shift', () => {
    const state = new OpponentHandTimeline();
    state.handle(tag('GameEntity', 'TURN', 3));
    state.handle(full(10, 'DECK')); state.handle(full(11, 'DECK'));
    state.handle(tag(10, 'ZONE', 'HAND')); state.handle(tag(11, 'ZONE', 'HAND'));
    state.handle(tag(10, 'ZONE_POSITION', 1)); state.handle(tag(11, 'ZONE_POSITION', 2));
    const before = state.snapshot(2);
    state.handle(tag('GameEntity', 'TURN', 5));
    state.handle(tag(10, 'ZONE', 'PLAY')); state.handle(tag(11, 'ZONE_POSITION', 1));
    const after = state.snapshot(2);
    expect(after).toHaveLength(1);
    expect(after[0]?.acquiredTurn).toBe(before[1]?.acquiredTurn);
    expect(after[0]).toMatchObject({ entityId: 11, position: 1, acquiredTurn: 3, origin: 'drawn' });
  });
  it('does not infer identities from hidden hand full entities or manufacture late history', () => {
    const state = new OpponentHandTimeline();
    state.handle(tag('GameEntity', 'TURN', 8));
    state.handle(full(20, 'HAND', 'PRIVATE_CARD'));
    expect(state.snapshot(2)[0]).toMatchObject({ cardId: null, acquiredTurn: null, origin: 'unknown', keptFromMulligan: null });
    expect(JSON.stringify(state.snapshot(2))).not.toContain('PRIVATE_CARD');
  });
  it('tracks actual starting-hand retention and replacement draws separately', () => {
    const state = new OpponentHandTimeline();
    state.handle(full(1, 'HAND')); state.handle(full(2, 'HAND'));
    state.handle(tag('GameEntity', 'STEP', 'BEGIN_MULLIGAN'));
    state.handle(tag(1, 'ZONE', 'DECK'));
    state.handle(full(3, 'DECK')); state.handle(tag(3, 'ZONE', 'HAND'));
    state.handle(tag('GameEntity', 'STEP', 'MAIN_BEGIN'));
    expect(state.snapshot(2).find(card => card.entityId === 2)?.keptFromMulligan).toBe(true);
    expect(state.snapshot(2).find(card => card.entityId === 3)?.keptFromMulligan).toBe(false);
  });
  it('attributes generated cards only to publicly observed sources and resets', () => {
    const state = new OpponentHandTimeline();
    state.handle(tag('GameEntity', 'TURN', 4));
    state.handle(full(10, 'PLAY', 'PUBLIC_SOURCE'));
    state.handle(full(20, 'SETASIDE', 'HIDDEN_RESULT'));
    state.handle(tag(20, 'CREATOR', 10)); state.handle(tag(20, 'ZONE', 'HAND'));
    expect(state.snapshot(2)[0]).toMatchObject({ cardId: null, acquiredTurn: 4, origin: 'generated', sourceCardId: 'PUBLIC_SOURCE' });
    state.handle({ type: 'create-game', raw: '', content: '' });
    expect(state.snapshot(2)).toEqual([]);
  });
  it('forgets a bounced known identity after a hidden transform', () => {
    const state = new OpponentHandTimeline();
    state.handle(tag('GameEntity', 'TURN', 4));
    state.handle(full(10, 'PLAY', 'PUBLIC_MINION'));
    state.handle(tag(10, 'ZONE', 'HAND'));
    expect(state.snapshot(2)[0]).toMatchObject({ cardId: 'PUBLIC_MINION', origin: 'returned' });
    state.handle({ type: 'change-entity', entity: 10, cardId: '', tags: {}, raw: '', content: '' });
    expect(state.snapshot(2)[0]?.cardId).toBeNull();
  });
});

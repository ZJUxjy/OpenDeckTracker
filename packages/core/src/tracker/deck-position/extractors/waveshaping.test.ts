import { describe, it, expect } from 'vitest';
import type { PowerEvent } from '@hdt/hearthwatcher';
import type { CardPlayedEvent, ExtractCtx } from '../../../global-effects/types';
import {
  makeWaveshapingExtractor,
  waveshapingExtractor,
} from './waveshaping';

const BASE: Pick<PowerEvent, 'raw' | 'content'> = { raw: '', content: '' };

function blockStart(entity: number, cardId: string): PowerEvent {
  return {
    ...BASE,
    type: 'block-start',
    blockType: 'POWER',
    entity,
    effectCardId: cardId,
    target: null,
    subOption: null,
  };
}

function fullEntity(entityId: number, cardId: string): PowerEvent {
  return {
    ...BASE,
    type: 'full-entity',
    entityId,
    cardId,
    tags: {},
  };
}

function tagChange(entity: number, tag: string, value: string | number): PowerEvent {
  return {
    ...BASE,
    type: 'tag-change',
    entity,
    tag,
    value,
  };
}

function blockEnd(): PowerEvent {
  return { ...BASE, type: 'block-end' };
}

/**
 * Helper: emit the standard tag chain that HS writes for one Discover
 * candidate copy entity — CONTROLLER, CREATOR (the cast), COPIED_FROM,
 * and ZONE=SETASIDE. Mirrors what shows up in real Power.log.
 */
function discoverCandidate(
  copyId: number,
  cardId: string,
  originalId: number,
  castEntityId: number,
  controllerId = 1,
): PowerEvent[] {
  return [
    fullEntity(copyId, cardId),
    tagChange(copyId, 'CONTROLLER', controllerId),
    tagChange(copyId, 'CREATOR', castEntityId),
    tagChange(copyId, 'COPIED_FROM_ENTITY_ID', originalId),
    tagChange(copyId, 'ZONE', 'SETASIDE'),
  ];
}

function makeCtx(events: PowerEvent[]): ExtractCtx {
  return {
    recentEvents: events,
    waitForMoreEvents: async () => events,
  };
}

const fastExtractor = makeWaveshapingExtractor({ waitMs: 150, pollStepMs: 30 });

describe('waveshapingExtractor', () => {
  const CAST_ENTITY_ID = 7;
  const castEvent: CardPlayedEvent = {
    cardId: 'TIME_701',
    controllerId: 1,
    entityId: CAST_ENTITY_ID,
    timestamp: 0,
    isManualPlay: true,
  };

  it('returns the two unchosen cardIds when the chosen ORIGINAL moves to HAND', async () => {
    // 3 candidate copies (109/110/111) backed by originals (12/27/26).
    // User picks the FIRST one — original 12 (CARD_A) moves DECK → HAND.
    // CARD_B and CARD_C should be returned as bottom placements.
    const events: PowerEvent[] = [
      blockStart(CAST_ENTITY_ID, 'TIME_701'),
      ...discoverCandidate(109, 'CARD_A', 12, CAST_ENTITY_ID),
      ...discoverCandidate(110, 'CARD_B', 27, CAST_ENTITY_ID),
      ...discoverCandidate(111, 'CARD_C', 26, CAST_ENTITY_ID),
      blockEnd(),
      // User picks CARD_A — its ORIGINAL entity (12) moves to HAND
      tagChange(12, 'ZONE', 'HAND'),
    ];
    const result = await waveshapingExtractor.extract(castEvent, makeCtx(events));
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    const cardIds = (result as { cardId: string }[]).map((p) => p.cardId).sort();
    expect(cardIds).toEqual(['CARD_B', 'CARD_C']);
    for (const p of result!) {
      expect(p.placement).toBe('bottom');
      expect(p.controllerId).toBe(1);
      expect(p.sourceCardId).toBe('TIME_701');
    }
  });

  it('also works when the CHOSEN COPY (not original) is the one moving to HAND', async () => {
    const events: PowerEvent[] = [
      blockStart(CAST_ENTITY_ID, 'TIME_701'),
      ...discoverCandidate(109, 'CARD_A', 12, CAST_ENTITY_ID),
      ...discoverCandidate(110, 'CARD_B', 27, CAST_ENTITY_ID),
      ...discoverCandidate(111, 'CARD_C', 26, CAST_ENTITY_ID),
      blockEnd(),
      // HS variant: the COPY entity itself moves SETASIDE → HAND
      tagChange(110, 'ZONE', 'HAND'),
    ];
    const result = await waveshapingExtractor.extract(castEvent, makeCtx(events));
    expect((result as { cardId: string }[]).map((p) => p.cardId).sort()).toEqual([
      'CARD_A',
      'CARD_C',
    ]);
  });

  it('handles numeric ZONE values (raw enum) as well as string', async () => {
    const events: PowerEvent[] = [
      blockStart(CAST_ENTITY_ID, 'TIME_701'),
      ...discoverCandidate(109, 'CARD_A', 12, CAST_ENTITY_ID),
      ...discoverCandidate(110, 'CARD_B', 27, CAST_ENTITY_ID),
      ...discoverCandidate(111, 'CARD_C', 26, CAST_ENTITY_ID),
      blockEnd(),
      tagChange(12, 'ZONE', 3), // 3 = HAND
    ];
    const result = await waveshapingExtractor.extract(castEvent, makeCtx(events));
    expect((result as { cardId: string }[]).map((p) => p.cardId).sort()).toEqual([
      'CARD_B',
      'CARD_C',
    ]);
  });

  it('ignores ZONE→HAND events on entities NOT created by the cast', async () => {
    // An unrelated entity moves to HAND (a card we drew). It is NOT
    // a Discover candidate (no CREATOR=cast tag). Extractor must wait.
    const events: PowerEvent[] = [
      blockStart(CAST_ENTITY_ID, 'TIME_701'),
      ...discoverCandidate(109, 'CARD_A', 12, CAST_ENTITY_ID),
      ...discoverCandidate(110, 'CARD_B', 27, CAST_ENTITY_ID),
      ...discoverCandidate(111, 'CARD_C', 26, CAST_ENTITY_ID),
      blockEnd(),
      tagChange(999, 'ZONE', 'HAND'), // unrelated entity
    ];
    const result = await fastExtractor.extract(castEvent, makeCtx(events));
    expect(result).toBeNull();
  });

  it('returns null when only 2 candidates are present (rare HS bug / cut buffer)', async () => {
    const events: PowerEvent[] = [
      blockStart(CAST_ENTITY_ID, 'TIME_701'),
      ...discoverCandidate(109, 'CARD_A', 12, CAST_ENTITY_ID),
      ...discoverCandidate(110, 'CARD_B', 27, CAST_ENTITY_ID),
      blockEnd(),
      tagChange(12, 'ZONE', 'HAND'),
    ];
    const result = await fastExtractor.extract(castEvent, makeCtx(events));
    expect(result).toBeNull();
  });

  it('handles a Discover prompt that resolves AFTER block-end (real-game timing)', async () => {
    // The user takes time on the prompt — block-end fires before
    // they pick. The extractor must continue past block-end.
    const events: PowerEvent[] = [
      blockStart(CAST_ENTITY_ID, 'TIME_701'),
      ...discoverCandidate(109, 'CARD_A', 12, CAST_ENTITY_ID),
      ...discoverCandidate(110, 'CARD_B', 27, CAST_ENTITY_ID),
      ...discoverCandidate(111, 'CARD_C', 26, CAST_ENTITY_ID),
      blockEnd(),
      // ... game continues, irrelevant events arrive ...
      tagChange(999, 'COST', 1),
      blockStart(500, 'SOME_OTHER_CARD'),
      blockEnd(),
      // ... finally the user picks ...
      tagChange(27, 'ZONE', 'HAND'),
    ];
    const result = await waveshapingExtractor.extract(castEvent, makeCtx(events));
    expect((result as { cardId: string }[]).map((p) => p.cardId).sort()).toEqual([
      'CARD_A',
      'CARD_C',
    ]);
  });

  it('matches the cast by entityId, not cardId (handles multiple Waveshapings)', async () => {
    const events: PowerEvent[] = [
      // First Waveshaping (entityId=50) — already resolved, irrelevant
      blockStart(50, 'TIME_701'),
      ...discoverCandidate(80, 'OLD_A', 4, 50),
      ...discoverCandidate(81, 'OLD_B', 5, 50),
      ...discoverCandidate(82, 'OLD_C', 6, 50),
      blockEnd(),
      tagChange(4, 'ZONE', 'HAND'),
      // Second Waveshaping (the one we're tracking) — entity 7
      blockStart(CAST_ENTITY_ID, 'TIME_701'),
      ...discoverCandidate(109, 'CARD_A', 12, CAST_ENTITY_ID),
      ...discoverCandidate(110, 'CARD_B', 27, CAST_ENTITY_ID),
      ...discoverCandidate(111, 'CARD_C', 26, CAST_ENTITY_ID),
      blockEnd(),
      tagChange(12, 'ZONE', 'HAND'),
    ];
    const result = await waveshapingExtractor.extract(castEvent, makeCtx(events));
    expect((result as { cardId: string }[]).map((p) => p.cardId).sort()).toEqual([
      'CARD_B',
      'CARD_C',
    ]);
  });
});

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

function showEntity(entity: number, cardId: string): PowerEvent {
  return {
    ...BASE,
    type: 'show-entity',
    entity,
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

/** Ctx that resolves waitForMoreEvents synchronously with the same events. */
function makeCtx(events: PowerEvent[]): ExtractCtx {
  return {
    recentEvents: events,
    waitForMoreEvents: async () => events,
  };
}

/**
 * Test-only extractor — same logic, but trims the wait budget so the
 * "extractor times out" cases finish in ~200ms instead of 5s.
 */
const fastExtractor = makeWaveshapingExtractor({ waitMs: 150, pollStepMs: 30 });

describe('waveshapingExtractor', () => {
  const castEvent: CardPlayedEvent = {
    cardId: 'TIME_701',
    controllerId: 1,
    entityId: 99,
    timestamp: 0,
    isManualPlay: true,
  };

  it('returns 2 bottom placements for the unchosen Discover candidates', async () => {
    const events: PowerEvent[] = [
      blockStart(99, 'TIME_701'),
      showEntity(101, 'CARD_A'),
      showEntity(102, 'CARD_B'),
      showEntity(103, 'CARD_C'),
      tagChange(101, 'ZONE', 'HAND'),
      tagChange(102, 'ZONE', 'DECK'),
      tagChange(103, 'ZONE', 'DECK'),
      blockEnd(),
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

  it('handles numeric ZONE values (raw enum) as well as string', async () => {
    const events: PowerEvent[] = [
      blockStart(99, 'TIME_701'),
      showEntity(101, 'CARD_A'),
      showEntity(102, 'CARD_B'),
      showEntity(103, 'CARD_C'),
      tagChange(101, 'ZONE', 3), // HAND
      tagChange(102, 'ZONE', 2), // DECK
      tagChange(103, 'ZONE', 2), // DECK
      blockEnd(),
    ];
    const result = await waveshapingExtractor.extract(castEvent, makeCtx(events));
    expect(result).not.toBeNull();
    expect((result as { cardId: string }[]).map((p) => p.cardId).sort()).toEqual([
      'CARD_B',
      'CARD_C',
    ]);
  });

  it('returns null when fewer than 2 cards land in DECK', async () => {
    const events: PowerEvent[] = [
      blockStart(99, 'TIME_701'),
      showEntity(101, 'CARD_A'),
      showEntity(102, 'CARD_B'),
      showEntity(103, 'CARD_C'),
      tagChange(101, 'ZONE', 'HAND'),
      tagChange(102, 'ZONE', 'DECK'),
      // Third ZONE→DECK event missing
      blockEnd(),
    ];
    const result = await fastExtractor.extract(castEvent, makeCtx(events));
    expect(result).toBeNull();
  });

  it('stops at block-end and does not consume events from a later block', async () => {
    const events: PowerEvent[] = [
      blockStart(99, 'TIME_701'),
      showEntity(101, 'CARD_A'),
      showEntity(102, 'CARD_B'),
      showEntity(103, 'CARD_C'),
      tagChange(101, 'ZONE', 'HAND'),
      tagChange(102, 'ZONE', 'DECK'),
      blockEnd(),
      // Unrelated subsequent block adds another ZONE→DECK — must NOT
      // be picked up.
      blockStart(200, 'OTHER_CARD'),
      showEntity(201, 'CARD_X'),
      tagChange(201, 'ZONE', 'DECK'),
      blockEnd(),
    ];
    const result = await fastExtractor.extract(castEvent, makeCtx(events));
    expect(result).toBeNull();
  });

  it('resolves cardIds carried by full-entity events too', async () => {
    const events: PowerEvent[] = [
      blockStart(99, 'TIME_701'),
      {
        ...BASE,
        type: 'full-entity',
        entityId: 101,
        cardId: 'CARD_A',
        tags: {},
      },
      {
        ...BASE,
        type: 'full-entity',
        entityId: 102,
        cardId: 'CARD_B',
        tags: {},
      },
      {
        ...BASE,
        type: 'full-entity',
        entityId: 103,
        cardId: 'CARD_C',
        tags: {},
      },
      tagChange(101, 'ZONE', 'HAND'),
      tagChange(102, 'ZONE', 'DECK'),
      tagChange(103, 'ZONE', 'DECK'),
      blockEnd(),
    ];
    const result = await waveshapingExtractor.extract(castEvent, makeCtx(events));
    expect(result).toHaveLength(2);
  });

  it('matches the cast by entityId, not cardId (handles multiple Waveshapings)', async () => {
    // First Waveshaping cast happened earlier; only the SECOND cast
    // (entityId 99) should be matched for this CardPlayedEvent.
    const events: PowerEvent[] = [
      blockStart(50, 'TIME_701'),
      showEntity(51, 'CARD_X'),
      showEntity(52, 'CARD_Y'),
      showEntity(53, 'CARD_Z'),
      tagChange(51, 'ZONE', 'HAND'),
      tagChange(52, 'ZONE', 'DECK'),
      tagChange(53, 'ZONE', 'DECK'),
      blockEnd(),
      blockStart(99, 'TIME_701'),
      showEntity(101, 'CARD_A'),
      showEntity(102, 'CARD_B'),
      showEntity(103, 'CARD_C'),
      tagChange(101, 'ZONE', 'HAND'),
      tagChange(102, 'ZONE', 'DECK'),
      tagChange(103, 'ZONE', 'DECK'),
      blockEnd(),
    ];
    const result = await waveshapingExtractor.extract(castEvent, makeCtx(events));
    expect((result as { cardId: string }[]).map((p) => p.cardId).sort()).toEqual([
      'CARD_B',
      'CARD_C',
    ]);
  });
});

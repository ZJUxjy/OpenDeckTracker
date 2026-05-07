import { describe, expect, it } from 'vitest';
import type { PowerEvent } from '@hdt/hearthwatcher';
import tamePet, { type TamePetParams } from './tame-pet';
import {
  tamePetSuccess,
  tamePetTruncated,
} from '../__fixtures__/tame-pet-fixtures';
import type { CardPlayedEvent, ExtractCtx } from '../types';

const cast: CardPlayedEvent = {
  cardId: 'MEND_300',
  controllerId: 1,
  timestamp: 1000,
};

function makeCtx(events: readonly PowerEvent[]): ExtractCtx {
  return {
    recentEvents: events,
    waitForMoreEvents: () => Promise.resolve([]),
  };
}

describe('tame-pet effect', () => {
  it('shape: id, sourceCardId, declared extractor', () => {
    expect(tamePet.id).toBe('tame-pet');
    expect(tamePet.sourceCardId).toBe('MEND_300');
    expect(tamePet.parameterExtractor).toBeDefined();
  });

  it('extractor resolves to pool of 3 cardIds in spawn order', async () => {
    const params = await tamePet.parameterExtractor!(cast, makeCtx(tamePetSuccess));
    const pool = (params as TamePetParams | null)?.pool;
    expect(pool).toEqual(['CS3_022', 'CS3_023', 'CS3_024']);
  });

  it('extractor returns null when post-cast events are missing', async () => {
    const params = await tamePet.parameterExtractor!(cast, makeCtx(tamePetTruncated));
    expect(params).toBeNull();
  });

  it('extractor returns null when cast itself is missing from the stream', async () => {
    const params = await tamePet.parameterExtractor!(cast, makeCtx([]));
    expect(params).toBeNull();
  });
});

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
  entityId: 50, // matches the BLOCK_START entity in tamePetSuccess fixture
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

  it('extractor picks the LATEST cast when the same card was played twice', async () => {
    const e = { raw: '', content: '' } as const;
    const fullEntity = (id: number, cardId: string): PowerEvent => ({
      type: 'full-entity',
      entityId: id,
      cardId,
      tags: { ZONE: 'SETASIDE', PLAYER_ID: 1 },
      ...e,
    });
    const stream: PowerEvent[] = [
      // First cast — early in the match. 6 spawns (3 old + 3 new).
      { type: 'block-start', blockType: 'PLAY', entity: 30, effectCardId: '', target: null, subOption: null, ...e },
      fullEntity(31, 'NEW1_032'), // old pool (originals)
      fullEntity(32, 'NEW1_033'),
      fullEntity(33, 'NEW1_034'),
      fullEntity(34, 'OLD_POOL_1'), // first cast's "new" pool
      fullEntity(35, 'OLD_POOL_2'),
      fullEntity(36, 'OLD_POOL_3'),
      { type: 'block-end', ...e },
      // Second cast — later. Old-pool slot is the previous cast's
      // chosen pool, then the second cast's brand-new pool.
      { type: 'block-start', blockType: 'PLAY', entity: 50, effectCardId: '', target: null, subOption: null, ...e },
      fullEntity(51, 'OLD_POOL_1'), // skipped: the just-replaced pool
      fullEntity(52, 'OLD_POOL_2'),
      fullEntity(53, 'OLD_POOL_3'),
      fullEntity(54, 'NEW_001'), // returned: second cast's actual new pool
      fullEntity(55, 'NEW_002'),
      fullEntity(56, 'NEW_003'),
      { type: 'block-end', ...e },
    ];
    const params = await tamePet.parameterExtractor!(
      { cardId: 'MEND_300', controllerId: 1, entityId: 50, timestamp: 5000 },
      makeCtx(stream),
    );
    expect((params as { pool: string[] } | null)?.pool).toEqual([
      'NEW_001',
      'NEW_002',
      'NEW_003',
    ]);
  });
});

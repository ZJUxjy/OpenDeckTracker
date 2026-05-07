import type { PowerEvent } from '@hdt/hearthwatcher';

/**
 * Hand-crafted PowerEvent fixtures for the Tame Pet extractor tests.
 *
 * These match the shape produced by `parsePowerLine` against real
 * Hearthstone Power.log output — the fields each event carries are
 * the same the parser emits, so the extractor can run against either
 * a real log replay or these synthetic events without branching.
 */

const empty = { raw: '', content: '' } as const;

/**
 * Successful cast: BLOCK_START tagged with the Tame Pet effectCardId,
 * followed by 3 distinct beast SHOW_ENTITY events for the casting
 * controller, then BLOCK_END.
 */
export const tamePetSuccess: PowerEvent[] = [
  {
    type: 'block-start',
    blockType: 'PLAY',
    entity: 50,
    effectCardId: 'MEND_300',
    target: null,
    subOption: null,
    ...empty,
  },
  {
    type: 'show-entity',
    entity: 60,
    cardId: 'CS3_022', // hypothetical beast cardId
    tags: { ZONE: 'SETASIDE', CONTROLLER: 1 },
    ...empty,
  },
  {
    type: 'show-entity',
    entity: 61,
    cardId: 'CS3_023',
    tags: { ZONE: 'SETASIDE', CONTROLLER: 1 },
    ...empty,
  },
  {
    type: 'show-entity',
    entity: 62,
    cardId: 'CS3_024',
    tags: { ZONE: 'SETASIDE', CONTROLLER: 1 },
    ...empty,
  },
  { type: 'block-end', ...empty },
];

/**
 * Truncated cast: BLOCK_START present, no follow-up SHOW_ENTITY.
 * Models a Power.log that got cut off (game crash, rotation, etc.).
 */
export const tamePetTruncated: PowerEvent[] = [
  {
    type: 'block-start',
    blockType: 'PLAY',
    entity: 50,
    effectCardId: 'MEND_300',
    target: null,
    subOption: null,
    ...empty,
  },
];

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
 * Successful cast: BLOCK_START with entity=50 (the Tame Pet card),
 * followed by 6 distinct beast spawns. HS always emits the CURRENT
 * pool (the 3 that get replaced) FIRST, then the NEW pool — the
 * extractor skips the first 3 and returns spawns[3..5].
 *
 * For the very first replacement of the match HS uses Misha/Leokk/
 * Huffer (NEW1_032/033/034) as the "current pool"; for subsequent
 * casts it's whatever the previous replacement set up. The fixture
 * uses generic `OLD_*` cardIds to stay agnostic.
 *
 * The BLOCK_START's `effectCardId` is intentionally empty — that
 * mirrors the real Hearthstone log shape where effectCardId carries a
 * serialized List object reference, not a cardId. The extractor
 * matches the cast block by `entity === entityId` (the parser strips
 * cardId from bracket entity refs).
 */
export const tamePetSuccess: PowerEvent[] = [
  {
    type: 'block-start',
    blockType: 'PLAY',
    entity: 50,
    effectCardId: '',
    target: null,
    subOption: null,
    ...empty,
  },
  // Old pool — to be skipped
  {
    type: 'full-entity',
    entityId: 60,
    cardId: 'OLD_001',
    tags: { ZONE: 'SETASIDE', PLAYER_ID: 1 },
    ...empty,
  },
  {
    type: 'full-entity',
    entityId: 61,
    cardId: 'OLD_002',
    tags: { ZONE: 'SETASIDE', PLAYER_ID: 1 },
    ...empty,
  },
  {
    type: 'full-entity',
    entityId: 62,
    cardId: 'OLD_003',
    tags: { ZONE: 'SETASIDE', PLAYER_ID: 1 },
    ...empty,
  },
  // New pool — what the extractor should return
  {
    type: 'full-entity',
    entityId: 63,
    cardId: 'CS3_022',
    tags: { ZONE: 'SETASIDE', PLAYER_ID: 1 },
    ...empty,
  },
  {
    type: 'full-entity',
    entityId: 64,
    cardId: 'CS3_023',
    tags: { ZONE: 'SETASIDE', PLAYER_ID: 1 },
    ...empty,
  },
  {
    type: 'full-entity',
    entityId: 65,
    cardId: 'CS3_024',
    tags: { ZONE: 'SETASIDE', PLAYER_ID: 1 },
    ...empty,
  },
  { type: 'block-end', ...empty },
];

/**
 * Truncated cast: BLOCK_START present, no follow-up spawns. Models a
 * Power.log that got cut off (game crash, rotation, etc.).
 */
export const tamePetTruncated: PowerEvent[] = [
  {
    type: 'block-start',
    blockType: 'PLAY',
    entity: 50,
    effectCardId: '',
    target: null,
    subOption: null,
    ...empty,
  },
];

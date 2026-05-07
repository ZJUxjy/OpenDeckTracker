import { describe, expect, it, vi } from 'vitest';
import type { PowerEvent } from '@hdt/hearthwatcher';
import { CardPlayedDetector } from './card-played-detector';

const empty = { raw: '', content: '' } as const;

function fullEntity(
  entityId: number,
  cardId: string,
  controllerId: number,
): PowerEvent {
  return {
    type: 'full-entity',
    entityId,
    cardId,
    tags: { CONTROLLER: controllerId, ZONE: 'HAND' },
    ...empty,
  };
}

function tagChange(
  entity: number,
  tag: string,
  value: string | number,
): PowerEvent {
  return { type: 'tag-change', entity, tag, value, ...empty };
}

function blockStart(entity: number, blockType: string): PowerEvent {
  return {
    type: 'block-start',
    blockType,
    entity,
    effectCardId: '',
    target: null,
    subOption: null,
    ...empty,
  };
}

describe('CardPlayedDetector', () => {
  it('emits a cardPlayed when an entity with known cardId moves to PLAY', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit, clock: () => 9000 });
    det.handle(fullEntity(64, 'CATA_216', 1));
    det.handle(tagChange(64, 'ZONE', 'PLAY'));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({
      cardId: 'CATA_216',
      controllerId: 1,
      entityId: 64,
      timestamp: 9000,
    });
  });

  it('does not emit for unknown entities', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle(tagChange(99, 'ZONE', 'PLAY'));
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not emit when ZONE moves to non-PLAY', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle(fullEntity(64, 'CATA_216', 1));
    det.handle(tagChange(64, 'ZONE', 'GRAVEYARD'));
    det.handle(tagChange(64, 'ZONE', 'HAND'));
    expect(emit).not.toHaveBeenCalled();
  });

  it('reset clears the entity table', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle(fullEntity(64, 'CATA_216', 1));
    det.reset();
    det.handle(tagChange(64, 'ZONE', 'PLAY'));
    expect(emit).not.toHaveBeenCalled();
  });

  it('SHOW_ENTITY updates a known entity with a revealed cardId', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle({
      type: 'full-entity',
      entityId: 64,
      cardId: '',
      tags: { CONTROLLER: 1 },
      ...empty,
    });
    det.handle({
      type: 'show-entity',
      entity: 64,
      cardId: 'CATA_216',
      tags: { CONTROLLER: 1 },
      ...empty,
    });
    det.handle(tagChange(64, 'ZONE', 'PLAY'));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toMatchObject({ cardId: 'CATA_216' });
  });

  it('does not double-fire on PLAY→PLAY tag refreshes', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle(fullEntity(64, 'CATA_216', 1));
    det.handle(tagChange(64, 'ZONE', 'PLAY'));
    det.handle(tagChange(64, 'ZONE', 'PLAY')); // redundant
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('emits twice when an entity is bounced and replayed (PLAY→HAND→PLAY)', () => {
    const emit = vi.fn();
    let now = 1000;
    const det = new CardPlayedDetector({ emit, clock: () => now });
    det.handle(fullEntity(64, 'CATA_216', 1));
    det.handle(tagChange(64, 'ZONE', 'PLAY'));
    det.handle(tagChange(64, 'ZONE', 'HAND'));
    // Real bounce-and-replay is seconds apart, well beyond the dual-
    // stream replay suppression window. Advance the clock to clear it.
    now += 5000;
    det.handle(tagChange(64, 'ZONE', 'PLAY'));
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('suppresses dual-stream re-emit (GameState + PowerTaskList same play)', () => {
    // HS dumps every play through both the GameState and PowerTaskList
    // streams 1-2s apart. The detector MUST collapse those into one
    // emit; otherwise stacking effects (Free Spirit, Lightshow, etc.)
    // get their triggerCount artificially doubled.
    const emit = vi.fn();
    let now = 1000;
    const det = new CardPlayedDetector({ emit, clock: () => now });
    det.handle(fullEntity(64, 'MEND_300', 1));
    det.handle(blockStart(64, 'PLAY'));
    // ZONE → GRAVEYARD between the two BLOCK_STARTs (HS spells go to
    // graveyard immediately after PLAY).
    det.handle(tagChange(64, 'ZONE', 'GRAVEYARD'));
    now += 1500; // PowerTaskList replay ~1.5s later
    det.handle(blockStart(64, 'PLAY'));
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('emits on BLOCK_START blockType=PLAY (spell-cast signal)', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle(fullEntity(64, 'MEND_300', 1));
    det.handle(blockStart(64, 'PLAY'));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toMatchObject({
      cardId: 'MEND_300',
      controllerId: 1,
    });
  });

  it('does not double-fire when BLOCK_START is followed by TAG_CHANGE ZONE=PLAY', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle(fullEntity(64, 'MEND_300', 1));
    det.handle(blockStart(64, 'PLAY'));
    det.handle(tagChange(64, 'ZONE', 'PLAY'));
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('does not fire on non-PLAY blocks (e.g. TRIGGER, ATTACK)', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle(fullEntity(64, 'MEND_300', 1));
    det.handle(blockStart(64, 'TRIGGER'));
    det.handle(blockStart(64, 'ATTACK'));
    expect(emit).not.toHaveBeenCalled();
  });

  it('reads controllerId from PLAYER_ID tag (real HS Power.log shape)', () => {
    // Hearthstone never emits tag=CONTROLLER for the entity-creation
    // line; the controller is `player=N` inside the entity ref, which
    // HearthWatcher's parser surfaces under tag key PLAYER_ID. The
    // detector MUST honour this or it will silently drop every play.
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle({
      type: 'show-entity',
      entity: '[entityName=驯服宠物 id=28 zone=DECK zonePos=0 cardId= player=1]',
      cardId: 'MEND_300',
      tags: { ZONE: 'DECK', PLAYER_ID: 1 },
      ...empty,
    });
    det.handle(blockStart(28, 'PLAY'));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toMatchObject({
      cardId: 'MEND_300',
      controllerId: 1,
    });
  });

  it('backfills cardId + controllerId from a stringy entity ref when never announced', () => {
    // Some opponent / created entities arrive directly in a TAG_CHANGE
    // before any FULL_ENTITY or SHOW_ENTITY. The bracket ref carries
    // the cardId/player info; we extract it as a backstop.
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle({
      type: 'block-start',
      blockType: 'PLAY',
      entity: '[entityName=Cleansing Cleric id=42 zone=HAND zonePos=2 cardId=CATA_216 player=2]',
      effectCardId: '',
      target: null,
      subOption: null,
      ...empty,
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toMatchObject({
      cardId: 'CATA_216',
      controllerId: 2,
    });
  });

  it('entityIdOf prefers a word-boundary `id=` over substring `playerid=`', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    // FULL_ENTITY first to register entity 64
    det.handle(fullEntity(64, 'CATA_216', 1));
    // Use a string ref that contains both `playerid=` (decoy) and `id=64`.
    det.handle({
      type: 'tag-change',
      entity: '[playerid=2 id=64 cardId=CATA_216]',
      tag: 'ZONE',
      value: 'PLAY',
      ...empty,
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toMatchObject({ cardId: 'CATA_216' });
  });
});

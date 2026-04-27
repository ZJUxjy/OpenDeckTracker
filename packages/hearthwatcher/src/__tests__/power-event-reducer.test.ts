import { describe, expect, it } from 'vitest';
import { HearthWatcherGameState, parsePowerLine, reducePowerEvent } from '..';

const apply = (state: HearthWatcherGameState, raw: string): void => {
  const event = parsePowerLine(raw);
  if (event === null) throw new Error(`no event for ${raw}`);
  reducePowerEvent(state, event);
};

describe('reducePowerEvent', () => {
  it('creates an entity from FULL_ENTITY', () => {
    const state = new HearthWatcherGameState({ localControllerId: 1 });
    apply(state, 'D 00:00:00.0000000 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=64 CardID=CS2_029 CONTROLLER=1 ZONE=DECK');

    expect(state.entities.get(64)).toMatchObject({
      entityId: 64,
      cardId: 'CS2_029',
      controllerId: 1,
      zone: 'DECK',
    });
  });

  it('reveals hidden entities through SHOW_ENTITY and CHANGE_ENTITY', () => {
    const state = new HearthWatcherGameState({ localControllerId: 1 });
    apply(state, 'D 00:00:00.0000000 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=65 CONTROLLER=2 ZONE=HAND');
    expect(state.entities.get(65)?.info.hidden).toBe(true);

    apply(state, 'D 00:00:01.0000000 GameState.DebugPrintPower() - SHOW_ENTITY - Updating Entity=65 CardID=CS2_032');
    expect(state.entities.get(65)).toMatchObject({ cardId: 'CS2_032', info: { hidden: false } });

    apply(state, 'D 00:00:02.0000000 GameState.DebugPrintPower() - CHANGE_ENTITY - Updating Entity=65 CardID=CS2_029');
    expect(state.entities.get(65)).toMatchObject({ cardId: 'CS2_029', info: { hidden: false } });
  });

  it('applies zone and controller TAG_CHANGE updates', () => {
    const state = new HearthWatcherGameState({ localControllerId: 1 });
    apply(state, 'D 00:00:00.0000000 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=64 CardID=CS2_029 CONTROLLER=1 ZONE=DECK');
    apply(state, 'D 00:00:01.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=64 tag=ZONE value=HAND');
    apply(state, 'D 00:00:02.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=64 tag=CONTROLLER value=2');

    expect(state.entities.get(64)).toMatchObject({ zone: 'HAND', controllerId: 2 });
  });

  it('marks hidden opponent hand entities', () => {
    const state = new HearthWatcherGameState({ localControllerId: 1 });
    apply(state, 'D 00:00:00.0000000 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=101 CONTROLLER=2 ZONE=HAND');

    expect(state.entities.get(101)).toMatchObject({
      cardId: '',
      info: { hidden: true },
    });
  });

  it('assigns initial original entities and marks later same-card copies created', () => {
    const state = new HearthWatcherGameState({
      localControllerId: 1,
      originalDeck: [{ cardId: 'CS2_029', count: 2 }],
    });
    apply(state, 'D 00:00:00.0000000 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=1 CardID=CS2_029 CONTROLLER=1 ZONE=HAND');
    apply(state, 'D 00:00:01.0000000 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=2 CardID=CS2_029 CONTROLLER=1 ZONE=HAND');
    state.markInitialAssignmentComplete();
    apply(state, 'D 00:00:02.0000000 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=3 CardID=CS2_029 CONTROLLER=1 ZONE=HAND');

    expect(state.entities.get(1)?.info).toMatchObject({
      originalController: 1,
      originalZone: 'HAND',
    });
    expect(state.entities.get(2)?.info.created).not.toBe(true);
    expect(state.entities.get(3)?.info.created).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { Game } from './game';

describe('Game.applyLogDerivedEntityUpdate', () => {
  it('preserves created entity metadata', () => {
    const game = new Game();
    game.applyLogDerivedEntityUpdate({
      entityId: 42,
      cardId: 'Fireball',
      zone: 'HAND',
      controllerId: 1,
      info: { created: true, originalController: 1, originalZone: 'DECK' },
    });

    expect(game.entities.get(42)).toMatchObject({
      entityId: 42,
      cardId: 'Fireball',
      zone: 'HAND',
      controllerId: 1,
      info: {
        created: true,
        originalController: 1,
        originalZone: 'DECK',
      },
    });
  });

  it('retains hidden opponent entities without card IDs', () => {
    const game = new Game();
    game.applyLogDerivedEntityUpdate({
      entityId: 101,
      cardId: '',
      zone: 'HAND',
      controllerId: 2,
      info: { hidden: true },
    });

    expect(game.entities.get(101)).toMatchObject({
      entityId: 101,
      cardId: '',
      zone: 'HAND',
      controllerId: 2,
      info: { hidden: true },
    });
  });

  it('merges later log updates without deleting existing metadata', () => {
    const game = new Game();
    game.applyLogDerivedEntityUpdate({
      entityId: 42,
      cardId: '',
      zone: 'HAND',
      controllerId: 2,
      info: { hidden: true },
    });
    game.applyLogDerivedEntityUpdate({
      entityId: 42,
      cardId: 'CS2_029',
      info: { hidden: false },
    });

    expect(game.entities.get(42)).toMatchObject({
      cardId: 'CS2_029',
      zone: 'HAND',
      controllerId: 2,
      info: { hidden: false },
    });
  });

  it('classifies hidden deck entities as original deck candidates', () => {
    const game = new Game();
    game.applyLogDerivedEntityUpdate({
      entityId: 7,
      cardId: '',
      zone: 'DECK',
      controllerId: 1,
    });

    expect(game.entities.get(7)?.info).toEqual({
      originalController: 1,
      originalZone: 'DECK',
    });
  });

  it('preserves original deck metadata when the same entity is later revealed', () => {
    const game = new Game();
    game.applyLogDerivedEntityUpdate({
      entityId: 7,
      cardId: '',
      zone: 'DECK',
      controllerId: 1,
    });
    game.applyLogDerivedEntityUpdate({
      entityId: 7,
      cardId: 'CS2_029',
      zone: 'HAND',
    });

    expect(game.entities.get(7)).toMatchObject({
      cardId: 'CS2_029',
      zone: 'HAND',
      info: {
        originalController: 1,
        originalZone: 'DECK',
      },
    });
    expect(game.entities.get(7)?.info.created).toBeUndefined();
  });

  it('classifies newly visible deck entities as created shuffle candidates', () => {
    const game = new Game();
    game.applyLogDerivedEntityUpdate({
      entityId: 99,
      cardId: 'CS2_029',
      zone: 'DECK',
      controllerId: 1,
    });

    expect(game.entities.get(99)?.info).toMatchObject({ created: true });
  });

  it('marks first-observed hand cards as original deck cards', () => {
    const game = new Game();
    game.applyLogDerivedEntityUpdate({
      entityId: 42,
      cardId: 'CS2_029',
      zone: 'HAND',
      controllerId: 1,
    });

    expect(game.entities.get(42)?.info).toEqual({
      originalController: 1,
      originalZone: 'HAND',
    });
  });

  it('does not mark mulligan cards returning to deck as created', () => {
    const game = new Game();
    game.applyLogDerivedEntityUpdate({
      entityId: 63,
      cardId: 'EDR_846',
      zone: 'HAND',
      controllerId: 2,
    });
    game.applyLogDerivedEntityUpdate({
      entityId: 63,
      zone: 'DECK',
    });

    const info = game.entities.get(63)?.info;
    expect(info?.created).toBeUndefined();
    expect(info?.originalController).toBe(2);
  });

  it('still classifies newly visible deck entities without hand history as created', () => {
    const game = new Game();
    game.applyLogDerivedEntityUpdate({
      entityId: 99,
      cardId: 'CS2_029',
      zone: 'DECK',
      controllerId: 1,
    });

    expect(game.entities.get(99)?.info).toMatchObject({
      created: true,
      originalZone: 'DECK',
    });
  });
});

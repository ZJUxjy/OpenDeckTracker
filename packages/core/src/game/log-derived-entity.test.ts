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
});

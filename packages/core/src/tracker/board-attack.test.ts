import { describe, expect, it } from 'vitest';
import type { BoardEntity, BoardState } from '@hdt/hearthmirror';
import {
  computeBoardAttack,
  type MinionTags,
  type WeaponState,
} from './board-attack';

const entity = (overrides: Partial<BoardEntity>): BoardEntity => ({
  entityId: overrides.entityId ?? 1,
  cardId: overrides.cardId ?? 'CS2_231',
  zonePosition: overrides.zonePosition ?? 1,
  attack: overrides.attack ?? 0,
  health: overrides.health ?? 1,
  damage: overrides.damage ?? 0,
});

describe('computeBoardAttack — base behavior (no overlay)', () => {
  it('sums friendly and opposing attack separately', () => {
    const board: BoardState = {
      friendly: [entity({ attack: 2 }), entity({ entityId: 2, attack: 5 })],
      opposing: [entity({ entityId: 3, attack: 3 }), entity({ entityId: 4, attack: 4 })],
    };
    expect(computeBoardAttack(board)).toEqual({ friendly: 7, opposing: 7 });
  });

  it('ignores invalid attacks and hero entities', () => {
    const board: BoardState = {
      friendly: [
        entity({ attack: -1 }),
        entity({ entityId: 2, attack: Number.NaN }),
        entity({ entityId: 3, cardId: 'HERO_07', attack: 5 }),
        entity({ entityId: 4, attack: 3 }),
      ],
      opposing: [],
    };
    expect(computeBoardAttack(board)).toEqual({ friendly: 3, opposing: 0 });
  });

  it('returns zero totals when board state is missing', () => {
    expect(computeBoardAttack(null)).toEqual({ friendly: 0, opposing: 0 });
    expect(computeBoardAttack(undefined)).toEqual({ friendly: 0, opposing: 0 });
  });
});

describe('computeBoardAttack — minion tag overlay', () => {
  function build(tagsEntries: Array<[number, MinionTags]>): {
    boardState: BoardState;
    tagsByEntityId: Map<number, MinionTags>;
  } {
    return {
      boardState: {
        friendly: [
          entity({ entityId: 1, attack: 4 }),
          entity({ entityId: 2, attack: 3 }),
        ],
        opposing: [entity({ entityId: 3, attack: 5 })],
      },
      tagsByEntityId: new Map(tagsEntries),
    };
  }

  it('frozen friendly minion contributes 0', () => {
    const { boardState, tagsByEntityId } = build([[1, { frozen: true, numTurnsInPlay: 1 }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 3, opposing: 5 });
  });

  it('cant-attack minion contributes 0', () => {
    const { boardState, tagsByEntityId } = build([[1, { cantAttack: true, numTurnsInPlay: 1 }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 3, opposing: 5 });
  });

  it('sleeping minion (just summoned, no charge/rush) contributes 0', () => {
    const { boardState, tagsByEntityId } = build([[1, { numTurnsInPlay: 0 }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 3, opposing: 5 });
  });

  it('charge overrides sleeping', () => {
    const { boardState, tagsByEntityId } = build([[1, { numTurnsInPlay: 0, charge: true }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 7, opposing: 5 });
  });

  it('rush overrides sleeping', () => {
    const { boardState, tagsByEntityId } = build([[1, { numTurnsInPlay: 0, rush: true }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 7, opposing: 5 });
  });

  it('windfury that has not swung yet doubles the contribution', () => {
    const { boardState, tagsByEntityId } = build([[1, { windfury: true, numTurnsInPlay: 1 }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 11, opposing: 5 });
  });

  it('windfury that already swung once falls back to ×1', () => {
    const { boardState, tagsByEntityId } = build([
      [1, { windfury: true, numTurnsInPlay: 1, numAttacksThisTurn: 1 }],
    ]);
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 7, opposing: 5 });
  });

  it('exhausted minion (used all swings) contributes 0', () => {
    const { boardState, tagsByEntityId } = build([
      [1, { numTurnsInPlay: 1, numAttacksThisTurn: 1 }],
    ]);
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 3, opposing: 5 });
  });

  it('mega-windfury (×4) supersedes regular windfury', () => {
    const { boardState, tagsByEntityId } = build([
      [1, { megaWindfury: true, numTurnsInPlay: 1 }],
    ]);
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 19, opposing: 5 });
  });

  it('extra attacks this turn add to the swing budget', () => {
    const { boardState, tagsByEntityId } = build([
      [1, { extraAttacksThisTurn: 1, numTurnsInPlay: 1 }],
    ]);
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 11, opposing: 5 });
  });

  it('missing tag entries fall back to plain ATK sum', () => {
    const { boardState, tagsByEntityId } = build([[1, { frozen: true, numTurnsInPlay: 1 }]]);
    // entity 2 and 3 have no overlay — they contribute their raw attack.
    expect(computeBoardAttack(boardState, { tagsByEntityId })).toEqual({ friendly: 3, opposing: 5 });
  });
});

describe('computeBoardAttack — weapons', () => {
  const board: BoardState = {
    friendly: [entity({ entityId: 1, attack: 3 })],
    opposing: [entity({ entityId: 2, attack: 2 })],
  };

  function weapon(overrides: Partial<WeaponState>): WeaponState {
    return {
      controllerId: 1,
      attack: 3,
      ...overrides,
    };
  }

  it('adds friendly weapon attack to friendly total', () => {
    const result = computeBoardAttack(board, {
      weapons: [weapon({ controllerId: 1, attack: 4 })],
      localControllerId: 1,
    });
    expect(result).toEqual({ friendly: 7, opposing: 2 });
  });

  it('adds opposing weapon attack to opposing total', () => {
    const result = computeBoardAttack(board, {
      weapons: [weapon({ controllerId: 2, attack: 5 })],
      localControllerId: 1,
    });
    expect(result).toEqual({ friendly: 3, opposing: 7 });
  });

  it('weapon windfury doubles its contribution', () => {
    const result = computeBoardAttack(board, {
      weapons: [weapon({ controllerId: 1, attack: 3, windfury: true })],
      localControllerId: 1,
    });
    expect(result).toEqual({ friendly: 9, opposing: 2 });
  });

  it('weapon already swung this turn contributes only its remaining swings', () => {
    const result = computeBoardAttack(board, {
      weapons: [
        weapon({ controllerId: 1, attack: 3, windfury: true, numAttacksThisTurn: 1 }),
      ],
      localControllerId: 1,
    });
    expect(result).toEqual({ friendly: 6, opposing: 2 });
  });

  it('weapon with zero / negative durability contributes 0', () => {
    const result = computeBoardAttack(board, {
      weapons: [weapon({ controllerId: 1, attack: 4, durability: 0 })],
      localControllerId: 1,
    });
    expect(result).toEqual({ friendly: 3, opposing: 2 });
  });

  it('handles localControllerId default of 1', () => {
    const result = computeBoardAttack(board, {
      weapons: [weapon({ controllerId: 1, attack: 4 })],
    });
    expect(result.friendly).toBe(7);
  });
});

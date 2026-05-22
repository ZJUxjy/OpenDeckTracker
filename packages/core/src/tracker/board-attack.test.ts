import { describe, expect, it } from 'vitest';
import type { BoardEntity, BoardState } from '@hdt/hearthmirror';
import {
  computeBoardAttack,
  computeMaxFaceDamage,
  type HeroAttackState,
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
    expect(computeBoardAttack(board, { localControllerId: 1 })).toEqual({ friendly: 7, opposing: 7 });
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
    expect(computeBoardAttack(board, { localControllerId: 1 })).toEqual({ friendly: 3, opposing: 0 });
  });

  it('returns zero totals when board state is missing', () => {
    expect(computeBoardAttack(null, { localControllerId: 1 })).toEqual({ friendly: 0, opposing: 0 });
    expect(computeBoardAttack(undefined, { localControllerId: 1 })).toEqual({ friendly: 0, opposing: 0 });
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
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 3, opposing: 5 });
  });

  it('cant-attack minion contributes 0', () => {
    const { boardState, tagsByEntityId } = build([[1, { cantAttack: true, numTurnsInPlay: 1 }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 3, opposing: 5 });
  });

  it('sleeping minion (just summoned, no charge/rush) contributes 0', () => {
    const { boardState, tagsByEntityId } = build([[1, { numTurnsInPlay: 0 }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 3, opposing: 5 });
  });

  it('minion with overlay but missing NUM_TURNS_IN_PLAY is treated as just summoned', () => {
    const { boardState, tagsByEntityId } = build([[1, {}]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 3, opposing: 5 });
  });

  it('charge overrides sleeping', () => {
    const { boardState, tagsByEntityId } = build([[1, { numTurnsInPlay: 0, charge: true }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 7, opposing: 5 });
  });

  it('rush overrides sleeping', () => {
    const { boardState, tagsByEntityId } = build([[1, { numTurnsInPlay: 0, rush: true }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 7, opposing: 5 });
  });

  it('windfury that has not swung yet doubles the contribution', () => {
    const { boardState, tagsByEntityId } = build([[1, { windfury: true, numTurnsInPlay: 1 }]]);
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 11, opposing: 5 });
  });

  it('windfury that already swung once falls back to ×1', () => {
    const { boardState, tagsByEntityId } = build([
      [1, { windfury: true, numTurnsInPlay: 1, numAttacksThisTurn: 1 }],
    ]);
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 7, opposing: 5 });
  });

  it('minion that used all swings this turn contributes 0', () => {
    const { boardState, tagsByEntityId } = build([
      [1, { numTurnsInPlay: 1, numAttacksThisTurn: 1 }],
    ]);
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 3, opposing: 5 });
  });

  it('mega-windfury (×4) supersedes regular windfury', () => {
    const { boardState, tagsByEntityId } = build([
      [1, { megaWindfury: true, numTurnsInPlay: 1 }],
    ]);
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 19, opposing: 5 });
  });

  it('extra attacks this turn add to the swing budget', () => {
    const { boardState, tagsByEntityId } = build([
      [1, { extraAttacksThisTurn: 1, numTurnsInPlay: 1 }],
    ]);
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 11, opposing: 5 });
  });

  it('missing tag entries fall back to plain ATK sum', () => {
    const { boardState, tagsByEntityId } = build([[1, { frozen: true, numTurnsInPlay: 1 }]]);
    // entity 2 and 3 have no overlay — they contribute their raw attack.
    expect(computeBoardAttack(boardState, { tagsByEntityId, localControllerId: 1 })).toEqual({ friendly: 3, opposing: 5 });
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

});

describe('computeBoardAttack — hero attack state', () => {
  const board: BoardState = {
    friendly: [entity({ entityId: 1, attack: 3 })],
    opposing: [entity({ entityId: 2, attack: 2 })],
  };

  function hero(overrides: Partial<HeroAttackState>): HeroAttackState {
    return {
      controllerId: 1,
      attack: 4,
      ...overrides,
    };
  }

  it('adds available friendly and opposing hero attack', () => {
    const result = computeBoardAttack(board, {
      heroAttacks: [
        hero({ controllerId: 1, attack: 4 }),
        hero({ controllerId: 2, attack: 5 }),
      ],
      localControllerId: 1,
    });
    expect(result).toEqual({ friendly: 7, opposing: 7 });
  });

  it('does not count a hero that already spent all attacks this turn', () => {
    const result = computeBoardAttack(board, {
      heroAttacks: [hero({ controllerId: 1, attack: 4, numAttacksThisTurn: 1 })],
      localControllerId: 1,
    });
    expect(result).toEqual({ friendly: 3, opposing: 2 });
  });

  it('uses hero attack state instead of weapon state when both are present', () => {
    const result = computeBoardAttack(board, {
      heroAttacks: [hero({ controllerId: 1, attack: 4, numAttacksThisTurn: 1 })],
      weapons: [{ controllerId: 1, attack: 9 }],
      localControllerId: 1,
    });
    expect(result).toEqual({ friendly: 3, opposing: 2 });
  });
});

describe('computeMaxFaceDamage', () => {
  const ready: MinionTags = { numTurnsInPlay: 1 };

  it('returns zero when board state is missing', () => {
    expect(computeMaxFaceDamage(null, { localControllerId: 1 })).toEqual({ friendly: 0, opposing: 0 });
    expect(computeMaxFaceDamage(undefined, { localControllerId: 1 })).toEqual({ friendly: 0, opposing: 0 });
  });

  it('without taunts on either side, equals computeBoardAttack', () => {
    const board: BoardState = {
      friendly: [entity({ entityId: 1, attack: 4, health: 5 })],
      opposing: [entity({ entityId: 2, attack: 3, health: 4 })],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, ready],
      [2, ready],
    ]);
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 })).toEqual({
      friendly: 4,
      opposing: 3,
    });
  });

  it('matches no-overlay path when tags are absent (no taunt info ⇒ none)', () => {
    const board: BoardState = {
      friendly: [entity({ entityId: 1, attack: 4 })],
      opposing: [entity({ entityId: 2, attack: 3 })],
    };
    expect(computeMaxFaceDamage(board, { localControllerId: 1 })).toEqual({ friendly: 4, opposing: 3 });
  });

  it('opposing taunt is killed and remaining swings reach face', () => {
    const board: BoardState = {
      friendly: [
        entity({ entityId: 1, attack: 4, health: 5 }),
        entity({ entityId: 2, attack: 3, health: 4 }),
      ],
      opposing: [entity({ entityId: 3, attack: 2, health: 3 })],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, ready],
      [2, ready],
      [3, { ...ready, taunt: true }],
    ]);
    // Friendly should kill the 3-HP taunt with the 3/4 minion (cost 3),
    // sending the 4/5 to face → 4 face damage.
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(4);
  });

  it('returns 0 when the only attacker cannot break a divine-shield taunt alone', () => {
    const board: BoardState = {
      friendly: [entity({ entityId: 1, attack: 6, health: 5 })],
      opposing: [entity({ entityId: 2, attack: 1, health: 1 })],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, ready],
      [2, { ...ready, taunt: true, divineShield: true }],
    ]);
    // Single swing only breaks the shield (deals 0 damage). Taunt
    // survives ⇒ no face damage possible.
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(0);
  });

  it('two small attackers cooperate on a divine-shield taunt — big hitter goes face', () => {
    const board: BoardState = {
      friendly: [
        entity({ entityId: 1, attack: 6, health: 5 }),
        entity({ entityId: 2, attack: 1, health: 1 }),
        entity({ entityId: 3, attack: 1, health: 1 }),
      ],
      opposing: [entity({ entityId: 4, attack: 1, health: 1 })],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, ready],
      [2, ready],
      [3, ready],
      [4, { ...ready, taunt: true, divineShield: true }],
    ]);
    // Optimal: assign the two 1-attack minions to the shielded taunt
    // (one absorbs, one finishes), and the 6-attack swings face → 6.
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(6);
  });

  it('returns 0 when the taunt is unkillable with available attack', () => {
    const board: BoardState = {
      friendly: [entity({ entityId: 1, attack: 2, health: 3 })],
      opposing: [entity({ entityId: 2, attack: 0, health: 10 })],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, ready],
      [2, { ...ready, taunt: true }],
    ]);
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(0);
  });

  it('uses minion damage so a wounded taunt is easier to clear', () => {
    const board: BoardState = {
      friendly: [
        entity({ entityId: 1, attack: 5, health: 5 }),
        entity({ entityId: 2, attack: 1, health: 1 }),
      ],
      // 6 HP taunt with 5 damage already on it → 1 effective HP.
      opposing: [entity({ entityId: 3, attack: 0, health: 6, damage: 5 })],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, ready],
      [2, ready],
      [3, { ...ready, taunt: true }],
    ]);
    // 1-attack swing kills the wounded taunt; 5-attack hits face.
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(5);
  });

  it('handles two opposing taunts with optimal partitioning', () => {
    const board: BoardState = {
      friendly: [
        entity({ entityId: 1, attack: 5 }),
        entity({ entityId: 2, attack: 4 }),
        entity({ entityId: 3, attack: 3 }),
        entity({ entityId: 4, attack: 7 }),
      ],
      opposing: [
        entity({ entityId: 10, attack: 0, health: 4 }),
        entity({ entityId: 11, attack: 0, health: 5 }),
      ],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, ready],
      [2, ready],
      [3, ready],
      [4, ready],
      [10, { ...ready, taunt: true }],
      [11, { ...ready, taunt: true }],
    ]);
    // Use 4 on the 4-HP taunt and 5 on the 5-HP taunt (cost 9). Send
    // 3 + 7 = 10 face.
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(10);
  });

  it('a rush minion on its first turn can clear a taunt but not go face', () => {
    const board: BoardState = {
      friendly: [
        // 5/5 with rush, fresh — can attack the taunt, not the hero.
        entity({ entityId: 1, attack: 5, health: 5 }),
        // Ready 4/4 — can hit anything.
        entity({ entityId: 2, attack: 4, health: 4 }),
      ],
      opposing: [entity({ entityId: 3, attack: 0, health: 4 })],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, { rush: true, numTurnsInPlay: 0 }],
      [2, ready],
      [3, { ...ready, taunt: true }],
    ]);
    // Optimal: rush 5/5 clears the 4-HP taunt (its swing has faceValue
    // 0 anyway), 4/4 swings at the face → 4 face damage.
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(4);
  });

  it('rush-only board with no taunt sees 0 face damage', () => {
    const board: BoardState = {
      friendly: [entity({ entityId: 1, attack: 5 })],
      opposing: [],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, { rush: true, numTurnsInPlay: 0 }],
    ]);
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(0);
  });

  it('windfury minion contributes two independent swings', () => {
    const board: BoardState = {
      friendly: [entity({ entityId: 1, attack: 3 })],
      opposing: [entity({ entityId: 2, attack: 0, health: 3 })],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, { ...ready, windfury: true }],
      [2, { ...ready, taunt: true }],
    ]);
    // First 3 kills the taunt; second 3 hits face.
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(3);
  });

  it('hero attack via heroAttacks contributes to face damage', () => {
    const board: BoardState = {
      friendly: [entity({ entityId: 1, attack: 2 })],
      opposing: [entity({ entityId: 2, attack: 0, health: 2 })],
    };
    const heroAttacks: HeroAttackState[] = [
      { controllerId: 1, attack: 4 },
    ];
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, ready],
      [2, { ...ready, taunt: true }],
    ]);
    expect(
      computeMaxFaceDamage(board, {
        tagsByEntityId,
        heroAttacks,
        localControllerId: 1,
      }).friendly,
    ).toBe(4);
  });

  it('opposing direction uses friendly taunts as blockers', () => {
    const board: BoardState = {
      friendly: [entity({ entityId: 1, attack: 0, health: 3 })],
      opposing: [
        entity({ entityId: 2, attack: 5 }),
        entity({ entityId: 3, attack: 4 }),
      ],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [1, { ...ready, taunt: true }],
      [2, ready],
      [3, ready],
    ]);
    // Opposing must clear the friendly 3-HP taunt. Optimal: spend the
    // 4 on it (cost 4), send 5 face → opposing face = 5.
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).opposing).toBe(5);
  });

  it('fallback path (>16 swings) clears taunts instead of bailing to 0', () => {
    // 9 minions × windfury = 18 swings. The bitmask DP cap is 16, so
    // this exercises the knapsack fallback. Taunt has 3 HP — easy kill.
    const friendly: BoardEntity[] = [];
    const tagsByEntityId = new Map<number, MinionTags>();
    for (let i = 1; i <= 9; i++) {
      friendly.push(entity({ entityId: i, attack: 4 }));
      tagsByEntityId.set(i, { ...ready, windfury: true });
    }
    const board: BoardState = {
      friendly,
      opposing: [entity({ entityId: 100, attack: 0, health: 3 })],
    };
    tagsByEntityId.set(100, { ...ready, taunt: true });
    // Spend one 4-attack swing on the 3-HP taunt (cost 4). Remaining
    // 17 swings × 4 = 68 face damage.
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(68);
  });

  it('fallback path returns 0 when the taunt is unkillable even in bulk', () => {
    const friendly: BoardEntity[] = [];
    const tagsByEntityId = new Map<number, MinionTags>();
    for (let i = 1; i <= 9; i++) {
      friendly.push(entity({ entityId: i, attack: 1 }));
      tagsByEntityId.set(i, { ...ready, windfury: true });
    }
    const board: BoardState = {
      friendly,
      // 99-HP taunt — way out of reach.
      opposing: [entity({ entityId: 100, attack: 0, health: 99 })],
    };
    tagsByEntityId.set(100, { ...ready, taunt: true });
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(0);
  });

  it('fallback path handles divine shield with two-attacker breaker', () => {
    const friendly: BoardEntity[] = [];
    const tagsByEntityId = new Map<number, MinionTags>();
    for (let i = 1; i <= 9; i++) {
      // 9 windfury 5/5s = 18 swings of value 5.
      friendly.push(entity({ entityId: i, attack: 5 }));
      tagsByEntityId.set(i, { ...ready, windfury: true });
    }
    const board: BoardState = {
      friendly,
      opposing: [entity({ entityId: 100, attack: 0, health: 1 })],
    };
    tagsByEntityId.set(100, { ...ready, taunt: true, divineShield: true });
    // Two swings used (one shield-breaker + one finisher), cost = 10.
    // Remaining 16 × 5 = 80 face damage.
    expect(computeMaxFaceDamage(board, { tagsByEntityId, localControllerId: 1 }).friendly).toBe(80);
  });

  it('weapon swings count toward face damage when no heroAttacks present', () => {
    const board: BoardState = {
      friendly: [],
      opposing: [entity({ entityId: 2, attack: 0, health: 2 })],
    };
    const tagsByEntityId = new Map<number, MinionTags>([
      [2, { ...ready, taunt: true }],
    ]);
    const weapons: WeaponState[] = [
      { controllerId: 1, attack: 3, windfury: true },
    ];
    // Two 3-attack swings; one breaks the 2-HP taunt, the other hits
    // face → 3 face damage.
    expect(
      computeMaxFaceDamage(board, {
        tagsByEntityId,
        weapons,
        localControllerId: 1,
      }).friendly,
    ).toBe(3);
  });
});

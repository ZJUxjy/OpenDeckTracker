import type { BoardEntity, BoardState } from '@hdt/hearthmirror';

export interface BoardAttackTotals {
  friendly: number;
  opposing: number;
}

export interface HeroVitals {
  health: number;
  armor: number;
  effectiveHealth: number;
}

/**
 * Per-entity power-tag overlay. The host fills this from its
 * HearthWatcher state when available; missing entries fall back to
 * a plain "sum positive attack" pass so a fresh dev session (with no
 * Power.log history yet) still produces a useful number.
 *
 * Filters applied when an entry IS present:
 *   - frozen / exhausted / cantAttack → contributes 0
 *   - sleeping (numTurnsInPlay missing or 0) without charge / rush → 0
 *   - swing budget = (megaWindfury ? 4 : windfury ? 2 : 1) + extraAttacksThisTurn
 *   - remaining = max(0, swingBudget - numAttacksThisTurn)
 *   - contribution = attack × remaining
 */
export interface MinionTags {
  frozen?: boolean;
  exhausted?: boolean;
  cantAttack?: boolean;
  /** missing or 0 = freshly summoned this turn (sleeping unless charge/rush). */
  numTurnsInPlay?: number;
  charge?: boolean;
  rush?: boolean;
  windfury?: boolean;
  /** Mega-windfury (4 attacks). Supersedes regular windfury. */
  megaWindfury?: boolean;
  numAttacksThisTurn?: number;
  extraAttacksThisTurn?: number;
}

/**
 * Equipped weapon contribution. Hero attack from an equipped weapon
 * is counted here (not via mirror.boardState — that's minions only).
 * The host derives this from its HearthWatcher state.
 */
export interface WeaponState {
  controllerId: number;
  attack: number;
  windfury?: boolean;
  megaWindfury?: boolean;
  numAttacksThisTurn?: number;
  /** When defined and ≤ 0, the weapon contributes 0. */
  durability?: number;
}

/**
 * Hero attack contribution from the hero entity itself. This is more
 * authoritative than weapon-only state because the hero entity carries
 * temporary attack buffs and NUM_ATTACKS_THIS_TURN.
 */
export interface HeroAttackState {
  controllerId: number;
  attack: number;
  frozen?: boolean;
  cantAttack?: boolean;
  windfury?: boolean;
  megaWindfury?: boolean;
  numAttacksThisTurn?: number;
  extraAttacksThisTurn?: number;
}

export interface ComputeBoardAttackOptions {
  /** Maps entityId → power tags. Missing entry = "use defaults". */
  tagsByEntityId?: ReadonlyMap<number, MinionTags>;
  /** Equipped weapons across both sides. Routed by `controllerId`. */
  weapons?: readonly WeaponState[];
  /**
   * Hero attack states across both sides. When present, this supersedes
   * weapon contribution because hero tags include attack buffs and
   * whether the hero already spent their attacks this turn.
   */
  heroAttacks?: readonly HeroAttackState[];
  /**
   * Local controller id (1 or 2). Used to bucket weapons. Defaults
   * to 1 — the deck-tracker normalizes unresolved match IDs to 1
   * regardless, so this is the right fallback.
   */
  localControllerId?: number;
  /**
   * Opposing hero's current health/armor from the Power.log tag state.
   * Board attack uses this only for UI context; combat math remains
   * in `computeBoardAttack`.
   */
  opposingHero?: HeroVitals | null;
  /** Friendly hero's current health/armor from the Power.log tag state. */
  friendlyHero?: HeroVitals | null;
}

const ZERO_BOARD_ATTACK: BoardAttackTotals = Object.freeze({ friendly: 0, opposing: 0 });

export function computeBoardAttack(
  boardState: BoardState | null | undefined,
  opts: ComputeBoardAttackOptions = {},
): BoardAttackTotals {
  if (boardState === null || boardState === undefined) {
    return { ...ZERO_BOARD_ATTACK };
  }

  const tagsByEntityId = opts.tagsByEntityId;
  const friendlyMinions = sumBoardAttack(boardState.friendly, tagsByEntityId);
  const opposingMinions = sumBoardAttack(boardState.opposing, tagsByEntityId);

  let friendlyWeapon = 0;
  let opposingWeapon = 0;
  const localId = opts.localControllerId ?? 1;
  if (opts.heroAttacks !== undefined && opts.heroAttacks.length > 0) {
    for (const h of opts.heroAttacks) {
      const contrib = heroContribution(h);
      if (contrib === 0) continue;
      if (h.controllerId === localId) friendlyWeapon += contrib;
      else opposingWeapon += contrib;
    }
  } else if (opts.weapons !== undefined && opts.weapons.length > 0) {
    for (const w of opts.weapons) {
      const contrib = weaponContribution(w);
      if (contrib === 0) continue;
      if (w.controllerId === localId) friendlyWeapon += contrib;
      else opposingWeapon += contrib;
    }
  }

  return {
    friendly: friendlyMinions + friendlyWeapon,
    opposing: opposingMinions + opposingWeapon,
  };
}

function sumBoardAttack(
  entities: readonly BoardEntity[],
  tagsByEntityId: ReadonlyMap<number, MinionTags> | undefined,
): number {
  let total = 0;
  for (const entity of entities) {
    if (!isCardLikeEntity(entity.cardId)) continue;
    if (!Number.isFinite(entity.attack) || entity.attack <= 0) continue;
    const tags = tagsByEntityId?.get(entity.entityId);
    total += minionContribution(entity.attack, tags);
  }
  return total;
}

function minionContribution(attack: number, tags: MinionTags | undefined): number {
  // No watcher data → trust the reflector's attack value as-is. This
  // matches a freshly-restarted dev session where the watcher hasn't
  // observed any tag-change events yet.
  if (tags === undefined) return attack;

  if (tags.frozen === true) return 0;
  if (tags.exhausted === true) return 0;
  if (tags.cantAttack === true) return 0;
  if ((tags.numTurnsInPlay ?? 0) === 0 && tags.charge !== true && tags.rush !== true) return 0;

  const baseSwings = tags.megaWindfury === true ? 4 : tags.windfury === true ? 2 : 1;
  const totalSwings = baseSwings + (tags.extraAttacksThisTurn ?? 0);
  const remaining = Math.max(0, totalSwings - (tags.numAttacksThisTurn ?? 0));
  return attack * remaining;
}

function weaponContribution(w: WeaponState): number {
  if (!Number.isFinite(w.attack) || w.attack <= 0) return 0;
  if (w.durability !== undefined && w.durability <= 0) return 0;
  const baseSwings = w.megaWindfury === true ? 4 : w.windfury === true ? 2 : 1;
  const remaining = Math.max(0, baseSwings - (w.numAttacksThisTurn ?? 0));
  return w.attack * remaining;
}

function heroContribution(h: HeroAttackState): number {
  if (!Number.isFinite(h.attack) || h.attack <= 0) return 0;
  if (h.frozen === true) return 0;
  if (h.cantAttack === true) return 0;
  const baseSwings = h.megaWindfury === true ? 4 : h.windfury === true ? 2 : 1;
  const totalSwings = baseSwings + (h.extraAttacksThisTurn ?? 0);
  const remaining = Math.max(0, totalSwings - (h.numAttacksThisTurn ?? 0));
  return h.attack * remaining;
}

/** Skip non-card / hero-card entries that occasionally surface in the reflector. */
function isCardLikeEntity(cardId: string): boolean {
  if (cardId === '') return false;
  if (cardId.startsWith('HERO_')) return false;
  if (cardId.startsWith('GAME_')) return false;
  return true;
}

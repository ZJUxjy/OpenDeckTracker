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
 *   - frozen / cantAttack → contributes 0
 *   - sleeping (numTurnsInPlay missing or 0) without charge / rush → 0
 *   - swing budget = (megaWindfury ? 4 : windfury ? 2 : 1) + extraAttacksThisTurn
 *   - remaining = max(0, swingBudget - numAttacksThisTurn)
 *   - contribution = attack × remaining
 *
 * EXHAUSTED is intentionally NOT a hard filter: the engine sets it
 * on summon (covered by the sleep check) and after an attack
 * (covered by numAttacksThisTurn vs swing budget), and the reset to
 * 0 at the controller's next turn-start is unreliable in our event
 * stream. Trusting it caused opposing minions on board for several
 * turns to be reported as 0-attack when their EXHAUSTED bit was
 * never observed reset.
 */
export interface MinionTags {
  frozen?: boolean;
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
  /** Taunt — attackers must clear it before reaching face. */
  taunt?: boolean;
  /** Divine shield — first incoming hit deals 0 damage and consumes the shield. */
  divineShield?: boolean;
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
   * Local controller id (1 or 2). Used to bucket weapons / hero
   * attacks onto the right side of the readout. REQUIRED — there
   * is no safe default: a missed pass on this field silently swaps
   * the friendly / opposing weapon-and-hero-attack contributions
   * whenever the user is the second player (real TAG_CONTROLLER=2).
   * Pair this with `applyMatchInfo`'s skip-on-null discipline so
   * the value is always the authoritative one resolved from
   * HearthMirror, never a hard-coded fallback.
   */
  localControllerId: number;
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
  opts: ComputeBoardAttackOptions,
): BoardAttackTotals {
  if (boardState === null || boardState === undefined) {
    return { ...ZERO_BOARD_ATTACK };
  }

  const tagsByEntityId = opts.tagsByEntityId;
  const friendlyMinions = sumBoardAttack(boardState.friendly, tagsByEntityId);
  const opposingMinions = sumBoardAttack(boardState.opposing, tagsByEntityId);

  let friendlyWeapon = 0;
  let opposingWeapon = 0;
  const localId = opts.localControllerId;
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

// ── Enhanced board attack: max damage that can reach the enemy hero ──
//
// Same swing-budget filters as `computeBoardAttack`, plus opposing taunts
// (must be cleared first) and divine shield (the first hit absorbed deals
// 0 damage). Rush minions on their first turn count as available swings
// but are NOT face-capable: they can be assigned to taunts but never
// directly to the hero.
//
// We model each side's available swings as a multiset and run a small
// bitmask DP over the opposing taunts: for every legal partition of
// swings into kill-sets (one per taunt), find the assignment that uses
// the smallest total face-capable attack value, then the answer is
// (sum of face-capable swings) minus (face-capable damage spent on
// taunts). If any taunt is unkillable with the available swings the
// answer is 0 — the spec requires "if any taunt cannot be cleared, face
// damage is 0".

interface Swing {
  /** Raw attack value of this swing (used to compute taunt damage). */
  value: number;
  /** Contribution to face damage when this swing is left over. 0 for rush-this-turn. */
  faceValue: number;
}

interface Taunt {
  /** Effective HP = health - damage, clamped at 0. */
  hp: number;
  divineShield: boolean;
}

export function computeMaxFaceDamage(
  boardState: BoardState | null | undefined,
  opts: ComputeBoardAttackOptions,
): BoardAttackTotals {
  if (boardState === null || boardState === undefined) {
    return { ...ZERO_BOARD_ATTACK };
  }

  const tagsByEntityId = opts.tagsByEntityId;
  const localId = opts.localControllerId;

  const friendlySwings = collectMinionSwings(boardState.friendly, tagsByEntityId);
  const opposingSwings = collectMinionSwings(boardState.opposing, tagsByEntityId);

  // Hero / weapon swings (heroes are always face-capable when they have
  // a remaining swing — same precedence rule as `computeBoardAttack`).
  if (opts.heroAttacks !== undefined && opts.heroAttacks.length > 0) {
    for (const h of opts.heroAttacks) {
      const count = heroSwingCount(h);
      const value = h.attack;
      if (!Number.isFinite(value) || value <= 0 || count === 0) continue;
      const target = h.controllerId === localId ? friendlySwings : opposingSwings;
      for (let i = 0; i < count; i++) target.push({ value, faceValue: value });
    }
  } else if (opts.weapons !== undefined && opts.weapons.length > 0) {
    for (const w of opts.weapons) {
      const count = weaponSwingCount(w);
      const value = w.attack;
      if (!Number.isFinite(value) || value <= 0 || count === 0) continue;
      const target = w.controllerId === localId ? friendlySwings : opposingSwings;
      for (let i = 0; i < count; i++) target.push({ value, faceValue: value });
    }
  }

  const friendlyTaunts = collectTaunts(boardState.friendly, tagsByEntityId);
  const opposingTaunts = collectTaunts(boardState.opposing, tagsByEntityId);

  return {
    friendly: solveMaxFace(friendlySwings, opposingTaunts),
    opposing: solveMaxFace(opposingSwings, friendlyTaunts),
  };
}

function collectMinionSwings(
  entities: readonly BoardEntity[],
  tagsByEntityId: ReadonlyMap<number, MinionTags> | undefined,
): Swing[] {
  const out: Swing[] = [];
  for (const entity of entities) {
    if (!isCardLikeEntity(entity.cardId)) continue;
    if (!Number.isFinite(entity.attack) || entity.attack <= 0) continue;
    const tags = tagsByEntityId?.get(entity.entityId);
    const swings = minionSwingCount(tags);
    if (swings === 0) continue;
    const faceCapable = minionFaceCapable(tags);
    const faceValue = faceCapable ? entity.attack : 0;
    for (let i = 0; i < swings; i++) {
      out.push({ value: entity.attack, faceValue });
    }
  }
  return out;
}

function collectTaunts(
  entities: readonly BoardEntity[],
  tagsByEntityId: ReadonlyMap<number, MinionTags> | undefined,
): Taunt[] {
  const out: Taunt[] = [];
  for (const entity of entities) {
    if (!isCardLikeEntity(entity.cardId)) continue;
    const tags = tagsByEntityId?.get(entity.entityId);
    // Without a tag overlay we have no way to know what's a taunt,
    // so we conservatively treat the side as taunt-free. This matches
    // the calculator's existing "no overlay = trust raw values" stance.
    if (tags?.taunt !== true) continue;
    const hp = Math.max(0, (entity.health ?? 0) - (entity.damage ?? 0));
    if (hp <= 0) continue;
    out.push({ hp, divineShield: tags.divineShield === true });
  }
  return out;
}

function minionSwingCount(tags: MinionTags | undefined): number {
  if (tags === undefined) return 1;
  if (tags.frozen === true) return 0;
  if (tags.cantAttack === true) return 0;
  if ((tags.numTurnsInPlay ?? 0) === 0 && tags.charge !== true && tags.rush !== true) {
    return 0;
  }
  const baseSwings = tags.megaWindfury === true ? 4 : tags.windfury === true ? 2 : 1;
  const totalSwings = baseSwings + (tags.extraAttacksThisTurn ?? 0);
  return Math.max(0, totalSwings - (tags.numAttacksThisTurn ?? 0));
}

function minionFaceCapable(tags: MinionTags | undefined): boolean {
  if (tags === undefined) return true;
  if ((tags.numTurnsInPlay ?? 0) > 0) return true;
  // numTurnsInPlay === 0 ⇒ freshly summoned. Charge can go face,
  // rush cannot (only minions). minionSwingCount has already filtered
  // out the "no charge / no rush" case to 0 swings, so anything
  // reaching here with numTurnsInPlay=0 has either charge or rush.
  return tags.charge === true;
}

function heroSwingCount(h: HeroAttackState): number {
  if (!Number.isFinite(h.attack) || h.attack <= 0) return 0;
  if (h.frozen === true) return 0;
  if (h.cantAttack === true) return 0;
  const baseSwings = h.megaWindfury === true ? 4 : h.windfury === true ? 2 : 1;
  const totalSwings = baseSwings + (h.extraAttacksThisTurn ?? 0);
  return Math.max(0, totalSwings - (h.numAttacksThisTurn ?? 0));
}

function weaponSwingCount(w: WeaponState): number {
  if (!Number.isFinite(w.attack) || w.attack <= 0) return 0;
  if (w.durability !== undefined && w.durability <= 0) return 0;
  const baseSwings = w.megaWindfury === true ? 4 : w.windfury === true ? 2 : 1;
  return Math.max(0, baseSwings - (w.numAttacksThisTurn ?? 0));
}

/**
 * Bitmask-DP cap. With N swings we enumerate up to 2^N kill-subsets
 * per taunt — well under a millisecond for N ≤ 16 (~65k masks). Above
 * this size we drop to `solveMaxFaceFallback`, which is a per-taunt
 * min-cost subset-sum knapsack searched over all taunt orderings. The
 * fallback is not provably joint-optimal but is dramatically better
 * than bailing to 0, and the regimes where it triggers (≥9 windfury
 * minions etc.) are vanishingly rare in real games.
 */
const MAX_FACE_DP_SWINGS = 16;
/**
 * Fallback can enumerate every ordering of taunts as long as k! is
 * cheap. 7! = 5040 — safe; Hearthstone's per-side board cap is 7 so
 * this covers every real taunt count. Beyond that we sort once and run.
 */
const MAX_FALLBACK_PERMUTATION_TAUNTS = 7;

function solveMaxFace(swings: readonly Swing[], taunts: readonly Taunt[]): number {
  let totalFace = 0;
  for (const s of swings) totalFace += s.faceValue;
  if (taunts.length === 0) return totalFace;
  const N = swings.length;
  if (N === 0) return 0;
  if (N <= MAX_FACE_DP_SWINGS) {
    return solveMaxFaceBitmask(swings, taunts, totalFace);
  }
  return solveMaxFaceFallback(swings, taunts, totalFace);
}

function solveMaxFaceBitmask(
  swings: readonly Swing[],
  taunts: readonly Taunt[],
  totalFace: number,
): number {
  const N = swings.length;
  // Per-taunt list of swing-bitmasks that kill it.
  const killMasksPerTaunt: number[][] = [];
  for (const t of taunts) {
    const masks: number[] = [];
    for (let mask = 1; mask < 1 << N; mask++) {
      let sum = 0;
      let minVal = Infinity;
      let count = 0;
      for (let i = 0; i < N; i++) {
        if ((mask & (1 << i)) === 0) continue;
        const v = swings[i]!.value;
        sum += v;
        if (v < minVal) minVal = v;
        count++;
      }
      let damage: number;
      if (t.divineShield) {
        // The shield absorbs one swing fully. Optimal pick is the
        // smallest-attack swing in the set so the survivors hit hardest.
        if (count < 2) continue;
        damage = sum - minVal;
      } else {
        damage = sum;
      }
      if (damage >= t.hp) masks.push(mask);
    }
    if (masks.length === 0) return 0;
    killMasksPerTaunt.push(masks);
  }

  // Per-mask face-cost lookup table.
  const faceCostByMask = new Int32Array(1 << N);
  for (let mask = 1; mask < 1 << N; mask++) {
    const lsb = mask & -mask;
    const idx = 31 - Math.clz32(lsb);
    faceCostByMask[mask] = faceCostByMask[mask ^ lsb]! + swings[idx]!.faceValue;
  }

  // DP: usedMask → min face-cost spent so far. After all taunts processed,
  // the minimum cost across remaining states is the optimum.
  let best = new Map<number, number>();
  best.set(0, 0);
  for (const masks of killMasksPerTaunt) {
    const next = new Map<number, number>();
    for (const [usedMask, faceCost] of best) {
      for (const km of masks) {
        if ((usedMask & km) !== 0) continue;
        const newMask = usedMask | km;
        const newCost = faceCost + faceCostByMask[km]!;
        const existing = next.get(newMask);
        if (existing === undefined || newCost < existing) {
          next.set(newMask, newCost);
        }
      }
    }
    best = next;
    if (best.size === 0) return 0;
  }
  let minCost = Infinity;
  for (const cost of best.values()) {
    if (cost < minCost) minCost = cost;
  }
  if (!Number.isFinite(minCost)) return 0;
  return Math.max(0, totalFace - minCost);
}

function solveMaxFaceFallback(
  swings: readonly Swing[],
  taunts: readonly Taunt[],
  totalFace: number,
): number {
  const k = taunts.length;
  const indexes: number[] = [];
  for (let i = 0; i < k; i++) indexes.push(i);
  const orders: number[][] =
    k <= MAX_FALLBACK_PERMUTATION_TAUNTS
      ? permutations(indexes)
      : [indexes.slice().sort((a, b) => taunts[b]!.hp - taunts[a]!.hp)];

  let best = -1;
  const used = new Uint8Array(swings.length);
  for (const order of orders) {
    used.fill(0);
    let feasible = true;
    let costSpent = 0;
    for (const ti of order) {
      const subset = pickMinCostKillSubset(swings, used, taunts[ti]!);
      if (subset === null) {
        feasible = false;
        break;
      }
      for (const idx of subset) {
        used[idx] = 1;
        costSpent += swings[idx]!.faceValue;
      }
    }
    if (!feasible) continue;
    const face = totalFace - costSpent;
    if (face > best) best = face;
  }
  return best === -1 ? 0 : Math.max(0, best);
}

function permutations(arr: readonly number[]): number[][] {
  if (arr.length <= 1) return [arr.slice()];
  const out: number[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const head = arr[i]!;
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const tail of permutations(rest)) {
      out.push([head, ...tail]);
    }
  }
  return out;
}

function pickMinCostKillSubset(
  swings: readonly Swing[],
  used: Uint8Array,
  taunt: Taunt,
): number[] | null {
  const available: number[] = [];
  for (let i = 0; i < swings.length; i++) {
    if (used[i] === 0) available.push(i);
  }
  if (available.length === 0) return null;
  if (taunt.hp <= 0) return [];
  if (!taunt.divineShield) {
    return minCostSubsetForDamage(swings, available, taunt.hp);
  }
  // Shielded: enumerate every available swing as the shield-breaker.
  // The breaker is the smallest swing in the chosen set; "others" must
  // therefore have value ≥ breaker.value, and their summed attack must
  // ≥ HP (the breaker contributes 0 dealt damage).
  let bestSubset: number[] | null = null;
  let bestCost = Infinity;
  for (const breakerIdx of available) {
    const breaker = swings[breakerIdx]!;
    const others = available.filter(
      (i) => i !== breakerIdx && swings[i]!.value >= breaker.value,
    );
    const subset = minCostSubsetForDamage(swings, others, taunt.hp);
    if (subset === null) continue;
    let cost = breaker.faceValue;
    for (const i of subset) cost += swings[i]!.faceValue;
    if (cost < bestCost) {
      bestCost = cost;
      bestSubset = [breakerIdx, ...subset];
    }
  }
  return bestSubset;
}

interface KnapsackCell {
  cost: number;
  /** Damage state we came from — capped at `damageNeeded`. */
  from: number;
  /** Index of the swing added to reach this cell. */
  via: number;
}

/**
 * Finds the minimum-faceCost subset of `candidates` whose summed
 * `value` reaches at least `damageNeeded`. Standard 0/1 knapsack with
 * the damage axis clamped at the required value (any extra is wasted).
 * Returns the chosen swing indices, or `null` if no subset reaches it.
 */
function minCostSubsetForDamage(
  swings: readonly Swing[],
  candidates: readonly number[],
  damageNeeded: number,
): number[] | null {
  if (damageNeeded <= 0) return [];
  const cap = damageNeeded;
  const dp: Array<KnapsackCell | null> = Array.from({ length: cap + 1 }, () => null);
  dp[0] = { cost: 0, from: -1, via: -1 };
  for (const idx of candidates) {
    const swing = swings[idx]!;
    // Reverse iteration prevents using the same swing twice in this round.
    for (let d = cap; d >= 0; d--) {
      const cur = dp[d];
      if (cur === null || cur === undefined) continue;
      const newD = Math.min(cap, d + swing.value);
      const newCost = cur.cost + swing.faceValue;
      const existing = dp[newD];
      if (existing === null || existing === undefined || newCost < existing.cost) {
        dp[newD] = { cost: newCost, from: d, via: idx };
      }
    }
  }
  if (dp[cap] === null) return null;
  const subset: number[] = [];
  let d = cap;
  // Walk back through the chain. Stops at the seed cell (via = -1).
  while (d > 0 && dp[d] !== null && dp[d]!.via !== -1) {
    subset.push(dp[d]!.via);
    d = dp[d]!.from;
  }
  return subset;
}

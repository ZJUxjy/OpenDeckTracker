/**
 * Cross-runtime UUID v4. Uses Web Crypto's `crypto.randomUUID()` (available in
 * modern Electron renderer + Node 20+ main + browsers). Falls back to
 * `Math.random()` for ancient runtimes — UUID uniqueness is per-deck, not a
 * security boundary, so the fallback is acceptable.
 */
function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `dk-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export type HeroClass =
  | 'DEATHKNIGHT'
  | 'DEMONHUNTER'
  | 'DRUID'
  | 'HUNTER'
  | 'MAGE'
  | 'PALADIN'
  | 'PRIEST'
  | 'ROGUE'
  | 'SHAMAN'
  | 'WARLOCK'
  | 'WARRIOR'
  | 'NEUTRAL';

export type Format = 'Standard' | 'Wild' | 'Classic' | 'Twist';

export type PopularDeckArchetype =
  | 'Aggro'
  | 'Midrange'
  | 'Control'
  | 'Combo'
  | 'Tempo'
  | 'Ramp';

export interface PopularDeck {
  id: string;
  name: string;
  class: HeroClass;
  format: Format;
  archetype: PopularDeckArchetype;
  deckstring: string;
  winratePercent: number;
  gamesCount: number;
  author: string;
  updatedAt: string;
}

export interface PopularDeckKeyCard {
  /**
   * Stable card identifier (e.g. `EX1_277`). The renderer uses this to
   * re-resolve `name`, `cost`, `rarity` against the active locale's
   * CardDb so it can match Hearthstone's in-game language. The IPC-side
   * `name` and `cost` here are baked from the default-locale CardDb and
   * are kept as a fallback when the renderer-side lookup hasn't
   * resolved yet.
   */
  cardId: string;
  name: string;
  count: number;
  cost: number;
}

export interface PopularDeckEnriched extends PopularDeck {
  manaCurve: readonly number[];
  keyCards: readonly PopularDeckKeyCard[];
  /**
   * All distinct card names in the deck, used for renderer-side
   * `includesCardName` / `excludesCardName` filtering. Separate from
   * `keyCards` (which is capped at 12 for UI display).
   */
  cardNames: readonly string[];
  /**
   * Full per-card list (uncapped) sorted by cost asc then name asc.
   * Used by the opponent-deck-prediction popup to render the deck's
   * contents with played/unplayed coloring. `cardId` is the stable
   * card identifier so the renderer can match against opponent plays;
   * `count` is the per-deck copy count (1 or 2 for collectibles).
   */
  deckCardList: readonly PopularDeckCardEntry[];
  /**
   * Crafting cost in dust, computed at IPC time from the deckstring's
   * card rarities against the current CardDb. Not baked into the seed
   * because it's deterministic from the deckstring.
   */
  dustCost: number;
}

export interface PopularDeckCardEntry {
  cardId: string;
  name: string;
  cost: number;
  count: number;
}

export interface DeckCard {
  cardId: string;
  count: number;
}

/**
 * How this deck record was created.
 * - `manual`: user-created or imported by the user. Always wins on conflict.
 * - `hearthstone-live`: app-managed copy of an in-game Hearthstone deck,
 *   synced via `deck-sync-service`. Mutated on later live reads.
 */
export type DeckSource = 'manual' | 'hearthstone-live';

export interface Deck {
  id: string;
  name: string;
  class: HeroClass;
  format: Format;
  cards: DeckCard[];
  version: number;
  notes: string;
  tags: string[];
  coverCardId?: string;
  sortIndex?: number;
  createdAt: number;
  updatedAt: number;
  /** Defaults to `'manual'` when absent on legacy rows. */
  source?: DeckSource;
  /** Hearthstone numeric deck id; only present when `source === 'hearthstone-live'`. */
  liveDeckId?: number | null;
}

export interface DeckSummary {
  id: string;
  name: string;
  class: HeroClass;
  format: Format;
  version: number;
  cardCount: number;
  coverCardId?: string;
  sortIndex?: number;
  updatedAt: number;
  source?: DeckSource;
  liveDeckId?: number | null;
}

export type DeckDetail = Deck;

export interface DeckVersion {
  deckId: string;
  version: number;
  cards: DeckCard[];
  cardListHash: string;
  createdAt: number;
}

export interface CreateDeckInput {
  name: string;
  class: HeroClass;
  format: Format;
  cards?: DeckCard[];
  notes?: string;
  tags?: string[];
  coverCardId?: string;
}

export interface UpdateDeckPatch {
  name?: string;
  class?: HeroClass;
  format?: Format;
  cards?: DeckCard[];
  notes?: string;
  tags?: string[];
  coverCardId?: string;
  sortIndex?: number;
}

export type ValidityIssueKind =
  | 'under-card-limit'
  | 'over-card-limit'
  | 'over-copy-limit'
  | 'legendary-over-limit'
  | 'off-class-card'
  | 'hero-in-main-deck';

export type ValidityIssue =
  | { kind: 'under-card-limit'; required: 30; actual: number }
  | { kind: 'over-card-limit'; required: 30; actual: number }
  | { kind: 'over-copy-limit'; cardId: string; count: number }
  | { kind: 'legendary-over-limit'; cardId: string; count: number }
  | { kind: 'off-class-card'; cardId: string; cardClass: HeroClass; deckClass: HeroClass }
  | { kind: 'hero-in-main-deck'; cardId: string };

export interface CreateDeckArgs extends CreateDeckInput {
  /** Optional caller-provided id; defaults to a fresh UUID. */
  id?: string;
  /** Optional caller-provided wall-clock; defaults to `Date.now()`. */
  now?: number;
}

export function createDeck(args: CreateDeckArgs): Deck {
  const now = args.now ?? Date.now();
  return {
    id: args.id ?? uuid(),
    name: args.name,
    class: args.class,
    format: args.format,
    cards: args.cards ? args.cards.map((c) => ({ ...c })) : [],
    version: 1,
    notes: args.notes ?? '',
    tags: args.tags ? [...args.tags] : [],
    ...(args.coverCardId !== undefined ? { coverCardId: args.coverCardId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

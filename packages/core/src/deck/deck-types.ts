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
  dustCost: number;
  author: string;
  updatedAt: string;
}

export interface PopularDeckKeyCard {
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
}

export interface DeckCard {
  cardId: string;
  count: number;
}

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
}

export interface DeckDetail extends Deck {}

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

import { randomUUID } from 'node:crypto';

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
    id: args.id ?? randomUUID(),
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

export {
  createDeck,
  type CreateDeckArgs,
  type CreateDeckInput,
  type Deck,
  type DeckCard,
  type DeckDetail,
  type DeckSource,
  type DeckSummary,
  type DeckVersion,
  type Format,
  type HeroClass,
  type MatchupHeroClass,
  type PopularDeck,
  type PopularDeckArchetype,
  type PopularDeckClassMatchup,
  type PopularDeckCardEntry,
  type PopularDeckEnriched,
  type PopularDeckKeyCard,
  type UpdateDeckPatch,
  type ValidityIssue,
  type ValidityIssueKind,
} from './deck-types';

export {
  aggregateCardCount,
  type CardLegalityInfo,
  type CardLookup,
  validateDeck,
} from './validity';

export { areCardListsEqual, canonicalCardListHash } from './deck-diff';

export { POPULAR_DECKS_SEED } from './popular-decks-seed';

export {
  filterPopularDecks,
  sortPopularDecks,
  type PopularDeckFilterCriteria,
  type PopularDeckSort,
} from './popular-deck-search';

// NOTE: deckstring/JSON import-export functions live in
// `apps/desktop/src/main/deck-codec.ts` (not in @hdt/core), because they
// depend on `@hdt/hearthdb`'s `Buffer.from(...)`-using encoder/decoder
// which is Node-only. Hoisting them out of @hdt/core keeps the barrel
// renderer-safe under Vite. The renderer never needs these directly —
// main-process IPC handlers wrap them.

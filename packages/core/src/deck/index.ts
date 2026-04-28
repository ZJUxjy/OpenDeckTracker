export {
  createDeck,
  type CreateDeckArgs,
  type CreateDeckInput,
  type Deck,
  type DeckCard,
  type DeckDetail,
  type DeckSummary,
  type DeckVersion,
  type Format,
  type HeroClass,
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

// NOTE: deckstring/JSON import-export functions are exposed via the
// `@hdt/core/deck/codec` subpath, NOT the main barrel. They depend on
// `@hdt/hearthdb`'s `Buffer.from(...)`-using deckstring encoder/decoder,
// which is Node-only and would fail to bundle in the renderer (Vite). The
// renderer never needs these directly — main-process IPC handlers wrap
// them. Type-only re-exports are still safe at the barrel.
export type {
  DeckCodecLookup,
  DeckJsonEnvelope,
} from './import-export';

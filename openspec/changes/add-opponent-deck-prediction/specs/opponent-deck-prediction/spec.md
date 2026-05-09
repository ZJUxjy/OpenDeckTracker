## ADDED Requirements

### Requirement: Pure deck-prediction function

`packages/core/src/tracker/opponent-deck-prediction.ts` SHALL export a pure
function `predictOpponentDecks(input)` with the signature:

```ts
interface PredictionInput {
  observedCards: ReadonlyArray<{ cardId: string; created: boolean }>;
  opponentClass: HeroClass | null;
  format: Format | null;
  candidates: ReadonlyArray<PopularDeckEnriched>;
  deckCardLookup: (deckstring: string) => ReadonlyMap<string, number> | null;
  topN?: number; // default 5
}

interface OpponentDeckPrediction {
  deck: PopularDeckEnriched;
  score: number;          // 0..1, observed-coverage IoU variant
  matchedCount: number;   // sum of min(observed[c], deck[c])
  observedOriginalCount: number; // total non-created observed cards
  confidence: 'low' | 'medium' | 'high';
}

function predictOpponentDecks(input: PredictionInput): OpponentDeckPrediction[];
```

The function MUST be pure — no I/O, no console output, deterministic on
input. It MUST NOT decode deckstrings internally; the caller passes
`deckCardLookup` so the function stays runtime-neutral (the desktop main
process passes a CardDb-backed implementation).

Behavior:

- If `observedCards` filtered down to non-created cards is empty, the
  function MUST return `[]` (no prediction without evidence).
- If `opponentClass` is non-null, only candidates whose `class` equals
  `opponentClass` MAY appear in the result.
- If `format` is non-null, only candidates whose `format` equals
  `format` MAY appear in the result.
- For each surviving candidate, score = `Σ min(observed[c], deckCount[c])
  / max(1, Σ observed[c])` where `observed` is the multiset of observed
  non-created card cardIds (capped at the deck's per-card count when summing
  the numerator) and `deckCount` is the candidate deck's per-card multiset
  (from `deckCardLookup(candidate.deckstring)`).
- Candidates whose `deckCardLookup` returns `null` (deckstring fails to
  decode) MUST be silently dropped.
- Tiebreaker: `gamesCount` descending (popularity prior).
- Truncated to `topN` (default 5).
- `confidence`:
  - `'low'`   when `observedOriginalCount < 5`
  - `'medium'` when `5 ≤ observedOriginalCount < 10`
  - `'high'`  when `observedOriginalCount ≥ 10`

#### Scenario: Empty observation returns no prediction

- **GIVEN** `observedCards = []`
- **WHEN** `predictOpponentDecks` is called
- **THEN** the result is `[]`

#### Scenario: All-created observation returns no prediction

- **GIVEN** `observedCards` containing only entries with `created: true`
- **WHEN** `predictOpponentDecks` is called
- **THEN** the result is `[]`

#### Scenario: Class filter narrows candidates

- **GIVEN** `opponentClass = 'MAGE'` and a candidate list containing
  decks of multiple classes
- **WHEN** `predictOpponentDecks` is called
- **THEN** every entry in the result has `deck.class === 'MAGE'`

#### Scenario: Format filter narrows candidates

- **GIVEN** `format = 'Standard'` and candidates of mixed formats
- **WHEN** `predictOpponentDecks` is called
- **THEN** every entry in the result has `deck.format === 'Standard'`

#### Scenario: Created cards are excluded from observed multiset

- **GIVEN** observed = `[{cardId: 'A', created: false}, {cardId: 'B', created: true}]`
  and a candidate deck containing only card B (3 copies)
- **WHEN** `predictOpponentDecks` is called
- **THEN** that candidate's `score` is 0 (B is excluded as a created card)
- **AND** `matchedCount` is 0 and `observedOriginalCount` is 1

#### Scenario: Score equals exact-match coverage when observed ⊆ deck

- **GIVEN** observed = `[{cardId: 'A', created: false}, {cardId: 'A', created: false}]`
  and a candidate deck containing 2 copies of A and 28 other cards
- **WHEN** `predictOpponentDecks` is called
- **THEN** that candidate's `score` is `1.0` (2/2 covered)

#### Scenario: Tiebreaker uses gamesCount

- **GIVEN** two candidate decks scoring identically
- **WHEN** `predictOpponentDecks` is called
- **THEN** the deck with higher `gamesCount` appears first

#### Scenario: Confidence escalates with observation count

- **WHEN** the non-created observed count is 3 / 7 / 12
- **THEN** the corresponding `confidence` values are `'low'` / `'medium'` / `'high'`

#### Scenario: Result truncated to topN

- **GIVEN** 20 surviving candidates and `topN = 5`
- **WHEN** `predictOpponentDecks` is called
- **THEN** the result has length 5

#### Scenario: Candidates with un-decodable deckstrings are dropped

- **GIVEN** a candidate whose `deckCardLookup(candidate.deckstring)` returns `null`
- **WHEN** `predictOpponentDecks` is called
- **THEN** that candidate does not appear in the result
- **AND** the function does not throw

### Requirement: Prediction IPC channel

The desktop main process SHALL register an IPC handler for the channel
`opponent-deck-prediction:get` that returns the latest prediction result
based on the current `DeckTrackerSnapshot` and the active popular-decks
cache (synced or seed). The handler MUST:

- Read the live `DeckTrackerSnapshot` (same source the deck-tracker IPC
  serves), extract `opponent.revealed` + `opponentClass` + match format
- Read the live popular-decks list (same source `popular-decks:list` uses)
- Decode each candidate deckstring against the live CardDb
- Call `predictOpponentDecks` and return `OpponentDeckPrediction[]`

When deck-tracker pushes a new snapshot, the prediction MUST be
re-computed and broadcast to all renderers via
`webContents.send('opponent-deck-prediction:update', predictions)`.

The handler MUST be idempotent: invoking it twice with the same snapshot
+ cache MUST return identical result arrays.

If the popular-decks cache is empty (no synced data and seed unavailable
— defensive case), or if the snapshot has no opponent observations,
the handler MUST return `[]` rather than rejecting.

#### Scenario: Channel returns predictions for current state

- **GIVEN** the deck-tracker has a non-empty `opponent.revealed`
- **WHEN** the renderer invokes `opponent-deck-prediction:get`
- **THEN** the result is an `OpponentDeckPrediction[]` with at most 5
  entries
- **AND** every entry's `deck.class` matches `opponentClass` when set

#### Scenario: Channel returns empty array when no observations

- **GIVEN** `opponent.revealed` is empty
- **WHEN** the renderer invokes `opponent-deck-prediction:get`
- **THEN** the result is `[]`

#### Scenario: Push event on snapshot update

- **GIVEN** a renderer subscribed to `opponent-deck-prediction:update`
- **WHEN** the deck-tracker pushes a new snapshot with at least one
  non-created opponent card
- **THEN** the renderer receives an event with the updated predictions
- **AND** the event payload is structurally equal to the result of
  invoking `opponent-deck-prediction:get` immediately after

### Requirement: Preload exposes window.hdt.opponentDeckPrediction

The desktop preload SHALL expose, alongside existing namespaces:

- `window.hdt.opponentDeckPrediction.get(): Promise<OpponentDeckPrediction[]>`
- `window.hdt.opponentDeckPrediction.onUpdate(cb): () => void` — registers
  a listener for `opponent-deck-prediction:update` events and returns an
  unsubscribe function

The new namespace MUST NOT overlap with `decks` or `popularDecks`.

#### Scenario: Renderer-visible API shape

- **WHEN** the renderer imports `HdtApi` from the preload module
- **THEN** the type contains `opponentDeckPrediction.get` and
  `opponentDeckPrediction.onUpdate`
- **AND** existing `popularDecks` and `decks` namespaces remain unchanged

### Requirement: OpponentCardsPanel prediction section

`OpponentCardsPanel.tsx` SHALL render a "Predicted deck" section above
the revealed-cards list when at least one prediction is available. The
section MUST contain:

- The top-1 deck name + class chip + winrate% + match score (rendered
  as a percent with 1 decimal)
- A confidence badge (`low` / `medium` / `high`) reflecting the top-1
  prediction's `confidence`
- An expand/collapse control revealing predictions 2–5 when available
- A note "已剔除 N 张创造卡" / "Excluded N created cards" when ≥ 1
  card in `opponent.revealed` has `created: true`

The section MUST be hidden entirely (not just empty) when:

- `predictions.length === 0` AND there are no observed non-created
  opponent cards (initial state — no UI clutter pre-game)

When `predictions.length === 0` BUT non-created opponent cards exist
(e.g., synced cache absent and class doesn't match seed), the section
MUST display a single line "No matching popular decks" using the i18n
key `decks.opponentPrediction.noMatch`.

#### Scenario: Section is hidden before any opponent plays

- **GIVEN** `opponent.revealed` is empty and predictions is empty
- **WHEN** the panel renders
- **THEN** the prediction section is not in the DOM

#### Scenario: Section shows top deck after opponent plays

- **GIVEN** predictions has at least 1 entry
- **WHEN** the panel renders
- **THEN** the top-1 deck name, class, winrate, match score, and
  confidence badge are visible

#### Scenario: Excluded-cards count surfaces

- **GIVEN** `opponent.revealed` contains 2 cards with `created: true`
- **WHEN** the panel renders
- **THEN** the text "已剔除 2 张创造卡" (or English equivalent) is
  visible in the prediction section header

#### Scenario: Expand reveals alternatives

- **GIVEN** predictions has 5 entries
- **WHEN** the user activates the expand control
- **THEN** entries 2–5 are visible

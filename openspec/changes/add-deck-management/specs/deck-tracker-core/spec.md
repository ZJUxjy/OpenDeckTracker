## MODIFIED Requirements

### Requirement: DeckTracker orchestrator

`@hdt/core` SHALL expose a `DeckTracker` class that runs an adaptive
polling loop against `@hdt/hearthmirror` and emits typed events.

`DeckTracker` MUST:

- Accept a `HearthMirror` instance and an optional `IDeckIdentifier`
  in its constructor.
- Expose `start()` / `stop()` methods controlling the loop lifecycle.
- Expose an `on(event: 'state-change' | 'match-started' |
  'match-ended', handler)` event subscription API.
- Adapt poll rate per phase (per design D6):
  - IDLE: 2000ms
  - PRE_MATCH: 500ms
  - IN_MATCH: 500ms baseline, 100ms one-shot after detecting hand-size
    change
  - POST_MATCH: one-shot finalization
- NEVER call `getCollection` from the poll loop (per design D6).
- Surface poll errors via the event stream (`{ type: 'error',
  reflector: 'getMatchInfo', message }`) instead of throwing.
- Emit `match-ended` with a completed-match summary when the tracker can
  classify the finished game as a real constructed match.
- Accept a saved-deck attribution payload via the deck-selection IPC
  flow so the orchestrator can record `savedDeckId` and
  `savedDeckVersion` alongside the live `deckId` when the user has
  picked a saved deck for the current match.

The `IDeckIdentifier` interface MUST allow injecting either the
in-game memory-field reader (default M2 implementation) or a
user-provided callback (for the dialog-fallback flow):

```ts
interface IDeckIdentifier {
  identify(
    snapshot: { decks: Deck[], matchInfo: MatchInfo },
  ): Promise<{ deckId: number; cards: { cardId: string, count: number }[] } | null>;
}
```

The completed-match summary MUST include:

- `fingerprint`: a stable idempotency key for the completed game.
- `startedAt` and `endedAt`: wall-clock timestamps.
- `result`: `win`, `loss`, or `unknown`.
- `playOrder`: `first`, `coin`, or `unknown`.
- `deckId` and `deckName` when the live deck was identified.
- `savedDeckId` and `savedDeckVersion` when the user has picked a
  saved deck for the current match. These fields are optional: if
  the user picked a live deck or no deck attribution was possible,
  they are absent.
- `opponentName` and `opponentClass` when known.
- `gameType` and `formatType` from match metadata.

The tracker MUST NOT emit a completed-match summary for unsupported or
unclassified modes unless the mode is explicitly recognized as
constructed.

The tracker MUST NOT couple itself to the deck store: it accepts
saved-deck attribution as opaque values (`savedDeckId: string`,
`savedDeckVersion: number`) injected via `selectDeckById` /
`selectSavedDeck` and forwards them into the summary unchanged. The
attribution-to-store link is owned by the IPC host, not the tracker.

#### Scenario: Idle polling rate

- **GIVEN** Hearthstone is closed (`isAlive` returns false)
- **WHEN** `DeckTracker.start()` is called and runs for 5 seconds
- **THEN** the poll count is approximately 2-3 (one every 2000ms),
  NOT every 250ms

#### Scenario: Match-started event emission

- **GIVEN** the tracker is in IDLE and the next poll detects
  `getMatchInfo` returns a non-null result
- **WHEN** the next poll runs
- **THEN** a `match-started` event is emitted with
  `{ matchInfo, originalDeck }` payload, where `originalDeck` is
  resolved via the `IDeckIdentifier`

#### Scenario: Phase machine transitions through full match

- **GIVEN** the tracker is in IDLE
- **WHEN** the user enters a match, plays mulligan, plays cards, and
  the match ends
- **THEN** the tracker emits the sequence: `match-started` →
  N × `state-change` → `match-ended`, with phase strictly
  monotonic IDLE → PRE_MATCH → IN_MATCH → POST_MATCH → IDLE

#### Scenario: Completed constructed match carries stats summary

- **GIVEN** the tracker has observed a constructed match with an
  identified live deck, opponent metadata, start time, and end time
- **WHEN** the match ends
- **THEN** the `match-ended` event includes a completed-match summary
  with `fingerprint`, timestamps, deck identity, opponent metadata,
  result, play order, `gameType`, and `formatType`

#### Scenario: Saved-deck attribution flows into summary

- **GIVEN** the tracker observed a constructed match and the user
  picked a saved deck via `DeckSelectDialog` before play
- **WHEN** the match ends
- **THEN** the `match-ended` summary includes both `savedDeckId`
  (string) and `savedDeckVersion` (number) AND the legacy `deckId`
  field (live `i64`) is also populated

#### Scenario: Live-only attribution omits saved-deck fields

- **GIVEN** the tracker observed a constructed match and the user
  picked a live deck (or no deck) via `DeckSelectDialog`
- **WHEN** the match ends
- **THEN** the `match-ended` summary's `savedDeckId` and
  `savedDeckVersion` fields are absent

#### Scenario: Unsupported mode omits stats summary

- **GIVEN** the tracker observes a match whose `gameType` / `formatType`
  is not recognized as constructed
- **WHEN** the match ends
- **THEN** the `match-ended` event does not include a completed-match
  summary for stats recording

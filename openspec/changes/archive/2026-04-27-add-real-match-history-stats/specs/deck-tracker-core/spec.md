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
- `deckId` and `deckName` when the local deck was identified.
- `opponentName` and `opponentClass` when known.
- `gameType` and `formatType` from match metadata.

The tracker MUST NOT emit a completed-match summary for unsupported or
unclassified modes unless the mode is explicitly recognized as
constructed.

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
  identified local deck, opponent metadata, start time, and end time
- **WHEN** the match ends
- **THEN** the `match-ended` event includes a completed-match summary
  with `fingerprint`, timestamps, deck identity, opponent metadata,
  result, play order, `gameType`, and `formatType`

#### Scenario: Unsupported mode omits stats summary

- **GIVEN** the tracker observes a match whose `gameType` / `formatType`
  is not recognized as constructed
- **WHEN** the match ends
- **THEN** the `match-ended` event does not include a completed-match
  summary for stats recording

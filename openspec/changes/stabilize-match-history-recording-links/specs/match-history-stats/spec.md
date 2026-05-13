## ADDED Requirements

### Requirement: Stable completed-match identity across recorder paths

The system SHALL assign a stable fingerprint to each live constructed game before completion-specific enrichment is known. The fingerprint used for durable match-history idempotency MUST NOT depend on `result`, `playOrder`, `opponentClass`, `deckName`, saved-deck attribution, or completion-time `endedAt` drift between recorder paths.

When both the DeckTracker match-ended path and the Power.log completion path record the same live game, they MUST write the same `fingerprint` so the match-history store enriches a single row.

#### Scenario: Power result enriches DeckTracker unknown row

- **GIVEN** a live constructed game has fingerprint `match-v2-1000-1`
- **AND** the DeckTracker match-ended path records that fingerprint with `result: unknown` and null `opponentClass`
- **WHEN** the Power.log completion path records the same fingerprint with `result: win` and `opponentClass: MAGE`
- **THEN** the match-history store contains exactly one row for `match-v2-1000-1`
- **AND** that row has `result: win`
- **AND** that row has `opponentClass: MAGE`

#### Scenario: Later unknown completion does not downgrade Power result

- **GIVEN** a live constructed game has fingerprint `match-v2-2000-1`
- **AND** the Power.log completion path records that fingerprint with `result: loss` and `opponentClass: PRIEST`
- **WHEN** the DeckTracker match-ended path later records the same fingerprint with `result: unknown` and null `opponentClass`
- **THEN** the match-history store still contains exactly one row for `match-v2-2000-1`
- **AND** that row still has `result: loss`
- **AND** that row still has `opponentClass: PRIEST`

#### Scenario: Missing live identity falls back without blocking persistence

- **GIVEN** no current live match identity is available
- **WHEN** a constructed completion summary is recorded
- **THEN** the system persists the completion using the existing normalized fingerprint fallback
- **AND** the absence of a live identity does not throw or drop the match solely for identity reasons

### Requirement: Stats recording drill-in uses fingerprint-exact correlation

The Stats page SHALL correlate recent match rows to completed match recordings by `MatchHistoryRecord.fingerprint` only. It MUST NOT enable or open a recording by matching `endedAt`, deck name, opponent name, or any other non-unique field.

The page MAY use `recordings:list` to determine whether a row's fingerprint has a recording, but the viewer MUST be opened with the match row's own `fingerprint`.

#### Scenario: Matching fingerprint enables recording action

- **GIVEN** the Stats page renders a recent match row with `fingerprint: match-v2-1000-1`
- **AND** `recordings:list` returns a completed recording summary with `matchFingerprint: match-v2-1000-1`
- **WHEN** the row is rendered
- **THEN** the row's `View recording` action is enabled
- **WHEN** the user activates that action
- **THEN** the recording viewer calls `window.hdt.recordings.get('match-v2-1000-1')`

#### Scenario: Matching endedAt without fingerprint does not enable action

- **GIVEN** the Stats page renders a recent match row with `fingerprint: match-v2-1000-1` and `endedAt: 5000`
- **AND** `recordings:list` returns a completed recording summary with `endedAt: 5000` but no `matchFingerprint`
- **WHEN** the row is rendered
- **THEN** the row's `View recording` action is disabled
- **AND** the page does not call `window.hdt.recordings.get` for that row

## ADDED Requirements

### Requirement: Match recording lifecycle

The system SHALL create one match recording for each HearthWatcher-observed game and SHALL finalize it when the Power event stream reports game completion.

#### Scenario: Recording starts on game creation

- **WHEN** the main-process recorder receives a `create-game` Power event
- **THEN** it creates a new in-progress recording with a stable recording ID
- **AND** it records `startedAt` from the recorder clock

#### Scenario: Recording finalizes on game completion

- **GIVEN** an in-progress recording exists
- **WHEN** the recorder receives a game-completion Power event
- **THEN** it marks the recording as completed
- **AND** it records `endedAt` from the recorder clock
- **AND** it persists a completed recording summary

#### Scenario: New game closes previous in-progress recording

- **GIVEN** an in-progress recording exists
- **WHEN** the recorder receives another `create-game` Power event before completion
- **THEN** it closes the previous recording as incomplete
- **AND** it starts a new in-progress recording for the new game

### Requirement: Raw Power event preservation

The system SHALL persist the raw structured `PowerEvent` stream for each recording so future code can re-project the match with improved derivation rules.

#### Scenario: Event is appended to recording

- **GIVEN** an in-progress recording exists
- **WHEN** the recorder receives a supported `PowerEvent`
- **THEN** it appends the event to that recording in receive order
- **AND** the stored event includes its type, parsed fields, raw line, content, and timestamp when present

#### Scenario: Loaded recording includes raw event references

- **GIVEN** a completed recording was persisted with raw events
- **WHEN** the recording detail is loaded
- **THEN** the returned detail includes the raw event list or a stable representation that preserves event order

### Requirement: Recording metadata and initial state

The system SHALL persist match metadata and initial local-player state when that information is available from HearthWatcher events and the latest deck tracker snapshot.

#### Scenario: Original deck metadata is captured

- **GIVEN** the latest deck tracker snapshot contains an identified deck
- **WHEN** a recording is started or updated
- **THEN** the recording metadata includes the deck ID, deck name, and original deck card counts

#### Scenario: Starting hand is captured

- **GIVEN** local hand entities are known during the opening hand window
- **WHEN** the recorder derives initial state
- **THEN** the recording stores the starting hand as public local card IDs with entity IDs

#### Scenario: Post-mulligan hand is captured

- **GIVEN** local mulligan state changes are observed
- **WHEN** the opening hand window completes
- **THEN** the recording stores a post-mulligan hand separate from the starting hand

### Requirement: Derived match timeline

The system SHALL derive a conservative timeline from Power events and reduced entity state without simulating Hearthstone rules.

#### Scenario: Draw event is recorded

- **GIVEN** a local entity with a public card ID moves from `DECK` to `HAND`
- **WHEN** the recorder processes the zone change
- **THEN** the recording timeline includes a `draw` event with card ID, entity ID, controller ID, and source event index

#### Scenario: Card play event is recorded

- **GIVEN** a local entity with a public card ID is the source of a `BLOCK_START` action that represents playing a card
- **WHEN** the recorder processes the block start
- **THEN** the recording timeline includes a `play-card` event with card ID, entity ID, target entity when available, and source event index

#### Scenario: Opponent reveal event is recorded

- **GIVEN** an opponent entity previously had no public card ID
- **WHEN** a `show-entity` or `change-entity` event reveals its card ID
- **THEN** the recording timeline includes an `opponent-reveal` event with the revealed card ID and entity ID

#### Scenario: Shuffle event is recorded

- **WHEN** the recorder receives a `shuffle-deck` Power event
- **THEN** the recording timeline includes a `shuffle-deck` event with the player ID when available

#### Scenario: Turn boundary is recorded

- **WHEN** a Power event provides a public turn number or current player transition
- **THEN** the recording timeline includes a `turn-start` event with the turn number or controller ID that was available

### Requirement: Hidden opponent information protection

The system SHALL NOT persist or expose identities for unrevealed opponent hand or deck cards.

#### Scenario: Hidden opponent hand card remains anonymous

- **GIVEN** an opponent hand entity has no public card ID
- **WHEN** the recording is persisted
- **THEN** the stored entity state does not contain a card ID for that hidden entity
- **AND** it may contain only entity ID, controller ID, zone, and hidden flag

#### Scenario: Hidden opponent deck card remains anonymous

- **GIVEN** an opponent deck entity has no public card ID
- **WHEN** recording detail is returned through IPC
- **THEN** the returned detail does not expose a card ID for that hidden entity

#### Scenario: Revealed opponent card can be stored

- **GIVEN** an opponent card is revealed by a public Power event
- **WHEN** the recording is persisted
- **THEN** the revealed card ID may be stored and returned as public timeline data

### Requirement: Recording storage

The system SHALL store recordings under an app-owned local directory and SHALL support listing completed recordings and loading a single recording by ID.

#### Scenario: Completed recording is listed

- **GIVEN** a completed recording exists in the recording store
- **WHEN** the store lists completed recordings
- **THEN** it returns a summary containing recording ID, startedAt, endedAt, deck metadata when available, opponent metadata when available, result when available, and timeline event count

#### Scenario: Recording detail is loaded by ID

- **GIVEN** a completed recording exists in the recording store
- **WHEN** the store loads that recording by ID
- **THEN** it returns metadata, initial state, timeline, final summary, and raw events for that recording

#### Scenario: Missing recording returns null

- **WHEN** the store loads a recording ID that does not exist
- **THEN** it returns `null` without throwing

### Requirement: Recording IPC

The Electron main process SHALL expose read-only recording APIs through the existing preload boundary and SHALL keep filesystem access out of the renderer.

#### Scenario: Renderer lists recordings

- **WHEN** the renderer calls the recordings list API
- **THEN** the main process returns completed recording summaries as serializable plain objects

#### Scenario: Renderer loads recording detail

- **WHEN** the renderer calls the recording detail API with a recording ID
- **THEN** the main process returns the matching recording detail or `null`

#### Scenario: Renderer cannot write recording files directly

- **WHEN** the renderer uses the recording APIs
- **THEN** it receives no filesystem path, database handle, file handle, or write API for recording storage

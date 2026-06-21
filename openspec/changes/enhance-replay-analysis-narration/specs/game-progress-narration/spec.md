## ADDED Requirements

### Requirement: Structured public game-progress analysis events

The system SHALL derive ordered `GameProgressAnalysisEvent` records from public live or replayed match progress without simulating Hearthstone rules.

Each analysis event MUST include:

- `sequence`: a monotonically increasing integer within the match.
- `kind`: one of `game-started`, `starting-hand`, `post-mulligan-hand`, `turn-start`, `card-drawn`, `card-played`, `opponent-card-revealed`, `deck-shuffled`, or `game-completed`.
- `actor`: one of `local`, `opponent`, `game`, or `unknown`.
- `sourceEventIndex`: the raw Power event index that caused the event.
- Public card/entity fields when applicable: `cardId`, `entityId`, `controllerId`, and `targetEntityId`.

The projector MUST ignore events that cannot be attributed to public match progress and MUST keep deriving later events after an unknown or unsupported raw event.

#### Scenario: Local card play becomes an analysis event

- **GIVEN** a public local card entity with card ID `MEND_300`
- **WHEN** the projector receives a `BLOCK_START` play event for that entity
- **THEN** it emits a `card-played` analysis event with `actor: local`
- **AND** the event includes the card ID, entity ID, controller ID, and source event index

#### Scenario: Opponent public card play becomes an analysis event

- **GIVEN** an opponent card has been revealed publicly with card ID `CORE_EX1_339`
- **WHEN** the projector receives a `BLOCK_START` play event for that entity
- **THEN** it emits a `card-played` analysis event with `actor: opponent`
- **AND** the event includes the revealed card ID

#### Scenario: Unsupported raw event is ignored

- **WHEN** the projector receives a supported Power event that does not change public game progress
- **THEN** it emits no analysis event for that raw event
- **AND** subsequent public events still receive contiguous sequence numbers

### Requirement: Deterministic Chinese narration frames

The system SHALL convert each `GameProgressAnalysisEvent` into a `GameProgressNarrationFrame` suitable for later LLM input.

Each narration frame MUST include:

- `sequence`
- `sourceEventIndex`
- `eventKind`
- `text`
- `facts`: a serializable object containing the structured values used to produce `text`

Narration text MUST be deterministic for the same input event and card-name resolver. The first version MUST produce zh-CN text. Card IDs MUST be rendered with localized card names when a resolver returns a name, and MUST fall back to the card ID when no localized name is available.

#### Scenario: Local play narration uses localized card name

- **GIVEN** a `card-played` event with `actor: local` and card ID `MEND_300`
- **AND** the card-name resolver returns `驯服宠物`
- **WHEN** the narrator converts the event
- **THEN** the narration text says that the player used `驯服宠物`
- **AND** the frame facts retain `cardId: MEND_300`

#### Scenario: Unknown card name falls back to card ID

- **GIVEN** a `card-played` event with card ID `UNKNOWN_CARD`
- **AND** the card-name resolver returns null
- **WHEN** the narrator converts the event
- **THEN** the narration text contains `UNKNOWN_CARD`

### Requirement: Hidden opponent information remains protected

The narration system SHALL NOT expose unrevealed opponent hand or deck card identities.

An opponent card MAY appear in analysis events or narration only when its card ID was revealed by a public Power event or public entity state. Hidden opponent hand/deck entities with no public card ID MUST be described generically or omitted.

#### Scenario: Hidden opponent hand card is not narrated by name

- **GIVEN** an opponent hand entity has no public card ID
- **WHEN** the projector processes zone or hand-count changes for that entity
- **THEN** no narration frame contains a card name or fabricated card ID for that entity

#### Scenario: Revealed opponent card can be narrated

- **GIVEN** an opponent hand entity is later revealed as card ID `CORE_EX1_339`
- **WHEN** the projector receives the reveal event
- **THEN** it may emit an `opponent-card-revealed` frame naming that public card

### Requirement: Live narration feed

The Electron app SHALL expose a read-only live narration feed through the preload boundary.

The feed MUST support:

- subscribing to newly emitted `GameProgressNarrationFrame` values during an active match;
- reading a bounded recent-frame buffer for late subscribers;
- clearing the live buffer when a new game starts.

Renderer consumers MUST NOT be able to write or mutate narration frames through this API.

#### Scenario: Active match emits live narration

- **GIVEN** HearthWatcher is running in live mode
- **WHEN** the local player plays a public card and the recorder derives a narration frame
- **THEN** subscribed renderer consumers receive that frame without polling recording files

#### Scenario: New game clears previous buffer

- **GIVEN** the live buffer contains frames from a previous match
- **WHEN** a new `create-game` event starts a new recording
- **THEN** the live narration feed clears the previous buffer before emitting new-game frames

### Requirement: Replay and live projection consistency

For the same public Power event sequence and initial public context, replay projection SHALL produce the same analysis events and narration frames as live projection.

The replay projector MUST use raw event order and stored source event indexes. Wall-clock receive time MUST NOT affect narration text or event sequence numbers.

#### Scenario: Stored raw events re-project to the same narration

- **GIVEN** a completed recording with raw events and narration frames
- **WHEN** the system re-projects those raw events through the analysis/narration pipeline with the same card-name resolver
- **THEN** the resulting frame sequence, event kinds, source event indexes, facts, and text match the stored frames

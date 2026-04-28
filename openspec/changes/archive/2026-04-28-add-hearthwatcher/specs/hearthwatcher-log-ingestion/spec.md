## ADDED Requirements

### Requirement: HearthWatcher workspace package

The system SHALL provide an `@hdt/hearthwatcher` workspace package that can be built, typechecked, and tested without Electron renderer APIs or HearthMirror native access.

#### Scenario: Package builds in isolation

- **WHEN** `pnpm --filter @hdt/hearthwatcher typecheck` and `pnpm --filter @hdt/hearthwatcher test` are run
- **THEN** both commands pass without requiring a running Hearthstone process

#### Scenario: Package exports stable entry points

- **WHEN** another workspace package imports `@hdt/hearthwatcher`
- **THEN** it can access the log watcher, parser, event types, reducer, and diagnostics types from public exports

### Requirement: Hearthstone log discovery diagnostics

The system SHALL discover Hearthstone log locations on Windows and SHALL expose diagnostics when required log files are missing or unreadable.

#### Scenario: Power log exists in standard location

- **GIVEN** a standard Hearthstone log directory containing `Power.log`
- **WHEN** HearthWatcher starts without an explicit path override
- **THEN** it selects that `Power.log` path and reports a ready status

#### Scenario: Power log is missing

- **GIVEN** no discoverable `Power.log`
- **WHEN** HearthWatcher starts
- **THEN** it reports a non-fatal missing-log diagnostic with the searched paths
- **AND** it continues retrying until the file appears

#### Scenario: Explicit path override is provided

- **GIVEN** a configured log file path for tests or developer builds
- **WHEN** HearthWatcher starts
- **THEN** it uses the configured path instead of standard discovery

### Requirement: Live log tailing

The system SHALL tail Hearthstone log files incrementally with byte-offset tracking, partial-line buffering, truncation detection, and bounded read batches.

#### Scenario: Live mode starts from end of file

- **GIVEN** an existing `Power.log` with prior game lines
- **WHEN** HearthWatcher starts in live mode
- **THEN** it does not emit events for existing lines
- **AND** it emits events only for lines appended after startup

#### Scenario: Replay mode starts from beginning

- **GIVEN** a fixture `Power.log` with existing lines
- **WHEN** HearthWatcher starts in replay mode
- **THEN** it emits events for lines from the beginning of the file

#### Scenario: Partial line is completed later

- **GIVEN** a log append ends without a newline
- **WHEN** the remainder of the line is appended on the next tick
- **THEN** HearthWatcher emits exactly one normalized line for the completed record

#### Scenario: Log file is truncated or rotated

- **GIVEN** the watched file size becomes smaller than the stored offset
- **WHEN** the next poll runs
- **THEN** HearthWatcher resets its offset and continues reading from the new file contents
- **AND** it emits a rotation-or-truncation diagnostic

### Requirement: Power.log parsing

The system SHALL parse supported `Power.log` records into typed `PowerEvent` values and SHALL ignore unknown records without throwing.

Supported records MUST include `CREATE_GAME`, `FULL_ENTITY`, `SHOW_ENTITY`, `HIDE_ENTITY`, `CHANGE_ENTITY`, `TAG_CHANGE`, `BLOCK_START`, `BLOCK_END`, and `SHUFFLE_DECK`.

#### Scenario: Full entity line is parsed

- **WHEN** the parser receives a `FULL_ENTITY` line containing an entity ID, card ID, and tags
- **THEN** it emits a `FullEntity` event with the parsed entity ID, card ID, and normalized tags

#### Scenario: Tag change line is parsed

- **WHEN** the parser receives `TAG_CHANGE Entity=64 tag=ZONE value=HAND`
- **THEN** it emits a `TagChange` event with entity `64`, tag `ZONE`, and value `HAND`

#### Scenario: Unknown line is ignored

- **WHEN** the parser receives a well-formed log line that does not match a supported record
- **THEN** it returns no event
- **AND** it does not increment the parser error count

#### Scenario: Malformed supported line is diagnosed

- **WHEN** the parser receives a malformed line that appears to be a supported record
- **THEN** it returns no event
- **AND** it increments a parser diagnostic counter with the record type

### Requirement: Loading-screen parsing

The system SHALL parse loading-screen log lines needed to identify game entry and exit boundaries for tracker lifecycle decisions.

#### Scenario: Game scene starts

- **WHEN** a loading-screen line indicates transition into a game scene
- **THEN** HearthWatcher emits a loading-screen event that can move the tracker toward active game monitoring

#### Scenario: Game scene ends

- **WHEN** a loading-screen line indicates transition away from a game scene
- **THEN** HearthWatcher emits a loading-screen event that can move the tracker toward post-match or idle state

### Requirement: Power event reducer

The system SHALL reduce parsed power events into a live entity state map keyed by Hearthstone entity ID.

#### Scenario: Entity is created from full entity event

- **WHEN** the reducer consumes a `FullEntity` event with entity ID, card ID, controller, and zone tags
- **THEN** the entity map contains that entity with the same card ID, controller ID, and zone

#### Scenario: Entity card ID changes on reveal

- **GIVEN** an entity exists with no public card ID
- **WHEN** the reducer consumes a `ShowEntity` or `ChangeEntity` event for that entity with a card ID
- **THEN** the entity's card ID is updated to the revealed card ID
- **AND** the entity is no longer marked hidden

#### Scenario: Zone tag updates entity projection

- **GIVEN** an entity currently has zone `DECK`
- **WHEN** the reducer consumes a `TAG_CHANGE` event for `ZONE` with value `HAND`
- **THEN** the entity's zone becomes `HAND`
- **AND** the entity can appear in hand projections derived from the entity map

#### Scenario: Hidden opponent card remains hidden

- **WHEN** the reducer sees an opponent hand or deck entity without a public card ID
- **THEN** the entity remains in state with an empty card ID
- **AND** `entity.info.hidden` is `true`

### Requirement: Entity origin classification

The system SHALL maintain conservative origin metadata that distinguishes original deck entities from generated, discovered, stolen, shuffled, or otherwise additional entities when log history provides enough signal.

#### Scenario: Initial friendly deck entity is marked original

- **GIVEN** the local original deck is known
- **WHEN** a friendly entity appears during the initial setup or mulligan window with a card ID that can be assigned to an available original deck copy
- **THEN** the entity records `originalController` as the local controller
- **AND** the entity records `originalZone` as its first observed zone
- **AND** `entity.info.created` is not `true`

#### Scenario: Later friendly generated entity is marked created

- **GIVEN** initial original deck candidate assignment is complete
- **WHEN** a later friendly entity appears with a public card ID and no original-candidate identity
- **THEN** the entity records `entity.info.created === true`
- **AND** it is excluded from original-deck subtraction by deck-tracker-core

#### Scenario: Same card ID generated copy is distinguished by entity ID

- **GIVEN** the original deck contains two copies of `Fireball`
- **AND** both original `Fireball` entity candidates have already been assigned
- **WHEN** a later entity with card ID `Fireball` appears under the local controller
- **THEN** the later entity is classified separately by entity ID
- **AND** it is not treated as an original deck copy solely because its card ID matches

### Requirement: Desktop watcher integration

The system SHALL allow the Electron main process to run HearthWatcher as the preferred live event source while preserving HearthMirror fallback behavior.

#### Scenario: Watcher starts with desktop app

- **WHEN** the Electron main process initializes tracker services
- **THEN** it starts a HearthWatcher host unless watcher startup is disabled by configuration

#### Scenario: Watcher emits status for renderer diagnostics

- **WHEN** HearthWatcher reports ready, waiting, missing-log, parser-error, or lag status
- **THEN** the main process exposes that status to the renderer through the existing preload/IPC boundary

#### Scenario: HearthMirror fallback remains available

- **GIVEN** HearthWatcher cannot read `Power.log`
- **WHEN** Hearthstone is running and HearthMirror can provide snapshots
- **THEN** the tracker continues using HearthMirror for available match and deck state instead of failing the session

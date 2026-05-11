## ADDED Requirements

### Requirement: Match start triggers live deck sync

The app SHALL trigger `deckSyncHost.syncFromLive()` on every
`IDLE → PRE_MATCH` deck-tracker phase transition. The trigger MUST be
wired in the main process so renderer surfaces never have to know about
the gameplay phase, and the call MUST be fire-and-forget so phase
broadcasts are never delayed by HearthMirror latency or failure.

If `syncFromLive()` rejects or returns `ok: false`, the trigger MUST
swallow the failure and continue subscribing to subsequent phase
transitions.

#### Scenario: Entering pre-match syncs live decks

- **GIVEN** the deck tracker is in phase `IDLE`
- **WHEN** the tracker transitions to phase `PRE_MATCH`
- **THEN** `deckSyncHost.syncFromLive()` is invoked once
- **AND** the broadcast of the new phase to other listeners is not
  blocked on the sync result

#### Scenario: Sync failure does not break the subscription

- **GIVEN** the first `IDLE → PRE_MATCH` transition triggered a sync
  that rejected with an error
- **WHEN** a later `IDLE → PRE_MATCH` transition fires
- **THEN** `deckSyncHost.syncFromLive()` is invoked again

#### Scenario: Non-IDLE precursor does not trigger sync

- **GIVEN** the tracker is currently in phase `IN_MATCH`
- **WHEN** the tracker transitions to `PRE_MATCH` (without first
  returning to `IDLE`)
- **THEN** `deckSyncHost.syncFromLive()` is NOT invoked

### Requirement: Match-start sync trigger debounces repeat fires

The match-start sync trigger SHALL enforce a minimum interval (default
5000 ms) between successive `syncFromLive()` calls so phase oscillation
during match setup does not produce a sync storm. Triggers that fall
inside the debounce window MUST be dropped silently. After the window
elapses, the next eligible `IDLE → PRE_MATCH` transition MUST trigger a
sync.

#### Scenario: Two PRE_MATCH transitions inside debounce window

- **GIVEN** an `IDLE → PRE_MATCH` transition triggered a sync at time `T`
- **WHEN** another `IDLE → PRE_MATCH` transition occurs at `T + 2000 ms`
- **THEN** `deckSyncHost.syncFromLive()` is NOT invoked a second time

#### Scenario: PRE_MATCH transition after debounce window

- **GIVEN** an `IDLE → PRE_MATCH` transition triggered a sync at time `T`
- **WHEN** another `IDLE → PRE_MATCH` transition occurs at
  `T + 6000 ms`
- **THEN** `deckSyncHost.syncFromLive()` is invoked again

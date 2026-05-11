# live-deck-sync Specification

## Purpose
TBD - created by archiving change robust-live-deck-sync. Update Purpose after archive.

## Requirements

### Requirement: Main-process live deck sync host

The desktop main process SHALL provide a live deck sync host that reads Hearthstone Collection decks through HearthMirror and persists them into `DeckStore`.

The host MUST expose `syncFromLive(): Promise<LiveDeckSyncResult>` where `LiveDeckSyncResult` includes:

- `ok: boolean`
- `source: 'live' | 'unavailable' | 'not-ready' | 'error'`
- `synced: number`
- `skippedNonCollectible: number`
- `skippedUnknownClass: number`
- `error?: string`
- `startedAt: number`
- `finishedAt: number`

The host MUST treat `getDecks() === null` as `source: 'unavailable'`, `ok: false`, and MUST NOT delete or modify existing local decks in that case.

#### Scenario: Live decks sync successfully

- **GIVEN** Hearthstone is running and `getDecks()` returns two valid live decks
- **WHEN** `syncFromLive()` is called
- **THEN** the result has `ok: true`, `source: 'live'`, and `synced === 2`
- **AND** both decks are present in `DeckStore.list()`

#### Scenario: Hearthstone unavailable preserves local decks

- **GIVEN** `DeckStore` already contains three local decks
- **AND** HearthMirror `getDecks()` returns `null`
- **WHEN** `syncFromLive()` is called
- **THEN** the result has `ok: false` and `source: 'unavailable'`
- **AND** `DeckStore.list()` still returns the original three decks

#### Scenario: Card database not ready returns not-ready status

- **GIVEN** the app has registered deck IPC before the card database lookup is available
- **WHEN** `syncFromLive()` is called
- **THEN** the result has `ok: false` and `source: 'not-ready'`
- **AND** the call resolves without throwing

### Requirement: Single-flight sync concurrency

The live deck sync host SHALL coalesce concurrent `syncFromLive()` calls so only one HearthMirror read/write cycle runs at a time. Concurrent callers MUST receive the same completed result object or equivalent result values from the shared in-flight operation.

#### Scenario: Concurrent callers share one live read

- **GIVEN** `getDecks()` is slow and two renderer windows call `syncFromLive()` before the first call finishes
- **WHEN** both promises resolve
- **THEN** HearthMirror `getDecks()` has been called exactly once
- **AND** both callers receive a successful result for the same sync run

### Requirement: Partial deck failures are isolated

The sync host SHALL continue syncing other live decks when one live deck cannot be saved because it contains non-collectible cards or has an unknown hero class. Skipped counts MUST be reflected in the result.

Unexpected per-deck errors MUST be logged and MUST NOT abort the whole sync unless no result can be produced.

#### Scenario: Non-collectible deck does not block valid deck

- **GIVEN** HearthMirror returns one valid live deck and one live deck containing a non-collectible card
- **WHEN** `syncFromLive()` is called
- **THEN** the valid deck is persisted
- **AND** the result has `synced === 1` and `skippedNonCollectible === 1`

#### Scenario: Unknown class deck does not block valid deck

- **GIVEN** HearthMirror returns one valid live deck and one live deck whose hero card cannot be mapped to a class
- **WHEN** `syncFromLive()` is called
- **THEN** the valid deck is persisted
- **AND** the result has `synced === 1` and `skippedUnknownClass === 1`

### Requirement: Startup sync remains best effort

After the card database is ready, the app SHALL run one best-effort startup sync using the same live deck sync host. Startup sync failures MUST be logged but MUST NOT block IPC registration or renderer startup.

#### Scenario: Startup sync failure does not block deck IPC

- **GIVEN** HearthMirror throws during the startup sync
- **WHEN** the app finishes main-process IPC registration
- **THEN** `window.hdt.decks.list()` remains callable from the renderer
- **AND** the main window can still render cached local decks

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

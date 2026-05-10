## ADDED Requirements

### Requirement: Non-destructive live deck snapshot cache

The desktop app SHALL cache live Hearthstone deck snapshots into local saved-deck storage so the Decks page can show known decks when Hearthstone is not running.

The sync MUST be non-destructive:

- Manual decks created or edited by the user MUST NOT be overwritten by live sync.
- Live-synced decks MUST be marked with app-managed metadata that ties them to the Hearthstone deck id or stable card-list signature.
- When the same live deck is observed again, the app SHALL update the corresponding live-synced record rather than creating duplicate rows.
- If a live deck contains non-collectible cards, the sync SHALL skip that deck and continue syncing other decks.

#### Scenario: Live Hearthstone decks are cached

- **GIVEN** Hearthstone is running and `hearthmirror.getDecks()` returns two constructed decks
- **WHEN** the deck sync service runs
- **THEN** the local deck store contains live-synced records for those decks
- **AND** the Decks page can list them after Hearthstone closes

#### Scenario: Manual deck is not overwritten

- **GIVEN** a user-created saved deck named `Ramp Druid`
- **AND** HearthMirror returns a live deck also named `Ramp Druid`
- **WHEN** the deck sync service runs
- **THEN** the user-created saved deck remains unchanged
- **AND** any live-synced update applies only to an app-managed live-synced record

#### Scenario: Repeated sync avoids duplicates

- **GIVEN** a live-synced deck already exists for Hearthstone deck id `42`
- **WHEN** HearthMirror returns deck id `42` again with the same card list
- **THEN** the local deck store still contains one live-synced record for that live deck

#### Scenario: Non-collectible live deck is skipped

- **GIVEN** HearthMirror returns a deck containing a generated token card
- **WHEN** the deck sync service runs
- **THEN** that deck is not saved
- **AND** sync continues for other valid decks

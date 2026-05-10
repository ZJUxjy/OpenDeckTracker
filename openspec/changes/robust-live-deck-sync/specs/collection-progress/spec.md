## ADDED Requirements

### Requirement: Collection route triggers live deck sync

When the Collection route mounts, the renderer SHALL attempt
`window.hdt.decks.syncFromLive()` in addition to loading
`window.hdt.collection.getProgress()`. The route MUST NOT block
collection progress rendering indefinitely on deck sync.

If deck sync succeeds, subsequent My Decks or DeckSelectDialog reads
SHALL observe the updated local deck store. If deck sync is unavailable
or fails, Collection MUST still render collection progress using live
or cached collection data as defined by the existing collection-progress
requirements.

#### Scenario: Collection mount triggers deck sync

- **WHEN** the Collection route mounts
- **THEN** it calls `window.hdt.decks.syncFromLive()` once
- **AND** it calls `window.hdt.collection.getProgress()` for collection progress

#### Scenario: Deck sync failure does not hide collection progress

- **GIVEN** `window.hdt.decks.syncFromLive()` resolves with `ok: false`
- **AND** `window.hdt.collection.getProgress()` resolves with Standard
  and Wild progress rows
- **WHEN** the Collection route renders
- **THEN** the progress rows are shown
- **AND** the route does not switch to a deck-sync error screen

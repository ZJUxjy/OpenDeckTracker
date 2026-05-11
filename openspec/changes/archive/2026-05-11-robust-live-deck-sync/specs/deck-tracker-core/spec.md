## ADDED Requirements

### Requirement: Pre-match deck selection uses refreshed saved decks

Before the renderer presents saved deck choices for a match attribution
decision, it SHALL request live deck synchronization through the deck IPC
surface and then refresh the saved deck list. The deck tracker core MUST
continue to receive only the selected saved deck identity
(`savedDeckId`, `savedDeckVersion`) or legacy live deck identity; it MUST
NOT depend directly on `DeckStore` or HearthMirror sync internals.

If synchronization cannot complete because Hearthstone is unavailable,
the selection flow MUST continue with cached saved decks and any live
deck choices already provided by the existing tracker flow.

#### Scenario: Selection refreshes saved decks before attribution

- **GIVEN** the tracker emits `needs-deck-selection`
- **WHEN** the renderer opens the selection dialog
- **THEN** the renderer syncs live decks and refreshes the saved deck list
  before the user confirms a saved deck
- **AND** the tracker receives the selected saved deck id and version

#### Scenario: Sync failure does not block match attribution

- **GIVEN** live deck sync is unavailable
- **AND** a cached saved deck exists locally
- **WHEN** the renderer opens the selection dialog
- **THEN** the cached saved deck can still be selected for attribution
- **AND** the tracker remains decoupled from the sync failure details

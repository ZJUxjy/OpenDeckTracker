## MODIFIED Requirements

### Requirement: Saved-decks list view

The renderer's existing deck list route SHALL render a My Decks list
grouped by hero class. The list MUST hydrate from `window.hdt.decks.list()`
on mount and refresh after every successful mutation triggered by the
editor or import dialogs.

Before the first list render on the My Decks route, the renderer SHALL
attempt `window.hdt.decks.syncFromLive()` once and then call
`window.hdt.decks.list()`. If sync is unavailable, not ready, or fails,
the renderer MUST still render cached local decks from `list()` and MUST
NOT show an empty state unless `list()` itself returns an empty array.

Each row MUST render the deck's name, class icon, format badge,
card count (e.g. "30 / 30" green or "16 / 30" amber), and version.
Rows MUST surface inline actions for `Edit`, `Duplicate`, `Export`,
and `Delete`.

When the list is empty, the renderer MUST show a localized empty
state with a primary "Create deck" CTA and a secondary "Import
deckstring" CTA.

User-facing titles, tabs, and empty-state labels that previously said
"Saved Decks" SHALL say "My Decks" in English and "我的卡组" in Chinese.

#### Scenario: List syncs then hydrates from IPC on mount

- **WHEN** the My Decks list mounts and live sync resolves successfully
- **THEN** `window.hdt.decks.syncFromLive` is called before the final
  `window.hdt.decks.list` hydration
- **AND** the decks returned from `list()` render grouped by `class`

#### Scenario: Sync unavailable still shows cached decks

- **GIVEN** `window.hdt.decks.syncFromLive` resolves with
  `{ ok: false, source: 'unavailable' }`
- **AND** `window.hdt.decks.list` resolves with two cached decks
- **WHEN** the My Decks list renders
- **THEN** both cached decks are shown
- **AND** the empty state is not shown

#### Scenario: Empty state shows create / import CTAs

- **GIVEN** live sync is unavailable
- **AND** `window.hdt.decks.list` resolves with an empty array
- **WHEN** the My Decks list renders
- **THEN** a localized empty state is shown with both "Create deck"
  and "Import deckstring" CTAs

#### Scenario: Delete row triggers refetch

- **GIVEN** a My Decks list rendering two decks
- **WHEN** the user confirms delete on the first row
- **THEN** `window.hdt.decks.delete` is called once with that id
  AND the list re-fetches and renders one deck

#### Scenario: My Decks label is localized

- **GIVEN** the active locale is `zh-CN`
- **WHEN** the deck route renders its saved-deck tab
- **THEN** the tab/title uses "我的卡组" instead of "已保存"

### Requirement: DeckSelectDialog prefers saved decks

The existing `DeckSelectDialog` SHALL render saved decks (from
`window.hdt.decks.list()`) above any unsaved live decks (from the
existing `getDecks` flow). Saved decks MUST be visually distinguished
from live decks (e.g. a "Saved" badge or pin icon) so the user can
tell which list a deck belongs to.

Before rendering saved deck choices, the dialog SHALL attempt
`window.hdt.decks.syncFromLive()` and then refresh the saved deck list.
If sync is unavailable or fails, the dialog MUST keep using cached saved
decks from `list()` and MUST still allow the user to choose a live deck
from the existing live-deck fallback list.

When the user picks a saved deck, the dialog MUST forward the saved
deck's `id` and current `version` to the deck-tracker host so match
attribution can be resolved against the saved deck.

When the user picks a live deck, the existing live-deck attribution
flow MUST continue unchanged.

#### Scenario: Dialog syncs before showing saved decks

- **GIVEN** the tracker emits a deck-selection request
- **WHEN** `DeckSelectDialog` opens
- **THEN** it calls `window.hdt.decks.syncFromLive()` before rendering
  the final saved deck choices
- **AND** the saved deck list reflects the post-sync `list()` response

#### Scenario: Saved deck selected forwards saved-deck identity

- **GIVEN** the user has 2 saved decks and 3 live decks
- **WHEN** the dialog opens and the user clicks a saved deck
- **THEN** the IPC `'deck-tracker:select-deck'` is called with a
  payload that includes both `savedDeckId` and `savedDeckVersion`

#### Scenario: Live deck selected preserves legacy flow

- **GIVEN** the user has 2 saved decks and 3 live decks
- **WHEN** the dialog opens and the user clicks a live deck
- **THEN** the IPC `'deck-tracker:select-deck'` is called with the
  legacy payload that does NOT include `savedDeckId`

#### Scenario: Dialog uses cached saved decks when sync fails

- **GIVEN** `syncFromLive()` resolves with `ok: false`
- **AND** `list()` returns one cached saved deck
- **WHEN** `DeckSelectDialog` renders
- **THEN** the cached saved deck remains selectable

## Requirements

### Requirement: Saved-decks list view

The renderer's existing `Decklist.tsx` route SHALL be repurposed to
render a saved-decks list grouped by hero class. The list MUST hydrate
from `window.hdt.decks.list()` on mount and refresh after every
successful mutation triggered by the editor or import dialogs.

Each row MUST render the deck's name, class icon, format badge,
card count (e.g. "30 / 30" green or "16 / 30" amber), and version.
Rows MUST surface inline actions for `Edit`, `Duplicate`, `Export`,
and `Delete`.

When the list is empty, the renderer MUST show a localized empty
state with a primary "Create deck" CTA and a secondary "Import
deckstring" CTA.

#### Scenario: List hydrates from IPC on mount

- **WHEN** the saved-decks list mounts and `window.hdt.decks.list`
  resolves with two decks
- **THEN** both decks render and are grouped by their `class` field

#### Scenario: Empty state shows create / import CTAs

- **GIVEN** `window.hdt.decks.list` resolves with an empty array
- **WHEN** the saved-decks list renders
- **THEN** a localized empty state is shown with both "Create deck"
  and "Import deckstring" CTAs

#### Scenario: Delete row triggers refetch

- **GIVEN** a saved-decks list rendering two decks
- **WHEN** the user confirms delete on the first row
- **THEN** `window.hdt.decks.delete` is called once with that id
  AND the list re-fetches and renders one deck

### Requirement: Deck editor modal

The renderer SHALL provide a `DeckEditor` modal (Radix Dialog) that
lets the user edit a deck's name, class, format, notes, tags, and
card list. The card list editor MUST include a search input
(reusing `@hdt/hearthdb` search) and click-to-add / click-to-remove
behavior with count badges.

The editor MUST surface a validity panel that reflects
`validateDeck` results live as the user edits — never blocking save,
always visible.

The editor MUST debounce save into `window.hdt.decks.update` calls
no more frequently than once per 400 ms while the dialog is open.

A "Save & Close" primary action MUST flush any pending debounced
update before closing.

#### Scenario: Edit name and save closes dialog

- **GIVEN** the editor is open on an existing deck
- **WHEN** the user changes the name and clicks "Save & Close"
- **THEN** `window.hdt.decks.update(id, { name: '<new>' })` resolves
  AND the dialog closes
  AND the saved-decks list reflects the new name

#### Scenario: Validity panel updates as user edits

- **GIVEN** the editor is open on a 16-card deck
- **WHEN** the user adds 14 more cards bringing the total to 30 valid
  cards
- **THEN** the validity panel re-renders and shows no issues

#### Scenario: Add card via search

- **GIVEN** the editor is open and the search input is focused
- **WHEN** the user types a unique card name and presses Enter
- **THEN** the matching card is appended to the deck with `count: 1`
  AND the search input clears

### Requirement: Import dialog

The renderer SHALL provide a `DeckImportDialog` Radix Dialog that lets
the user paste a deckstring or load from clipboard, OR upload a JSON
file. The dialog MUST preview the decoded deck (name, class, card
count, mana curve summary) before the user confirms.

When the underlying import surfaces a typed error, the dialog MUST
render a localized message keyed on `error.name`:

- `UnknownCardError` → "This deck contains a card not in your card
  database (`{cardId}`). The deckstring may be from a future patch."
- `DeckstringDecodeError` → "We couldn't decode this deckstring."

#### Scenario: Paste deckstring previews the deck

- **WHEN** the user pastes a valid deckstring into the input
- **THEN** the dialog renders a preview with the decoded deck's
  name (or "Untitled" if absent), class, and card count

#### Scenario: Confirm import calls IPC

- **GIVEN** a valid deckstring has been previewed
- **WHEN** the user clicks "Import"
- **THEN** `window.hdt.decks.importDeckstring(text)` is called once
  AND the dialog closes
  AND the saved-decks list re-fetches

#### Scenario: Unknown card error renders localized message

- **GIVEN** the import IPC rejects with
  `error.name === 'UnknownCardError'` and `error.message`
  containing a `cardId`
- **WHEN** the dialog catches the rejection
- **THEN** the dialog renders a localized message that includes the
  `cardId`

### Requirement: Export dialog

The renderer SHALL provide a `DeckExportDialog` Radix Dialog that
shows the deck's deckstring (with a "Copy" button) and JSON envelope
(with a separate "Copy" button). The dialog MUST refuse to render a
deckstring for a deck that fails `validateDeck`, surfacing a localized
explanation instead.

#### Scenario: Legal deck shows deckstring

- **GIVEN** a 30-card legal deck
- **WHEN** the export dialog opens
- **THEN** the deckstring is rendered and the "Copy" button is
  enabled

#### Scenario: Illegal deck blocks deckstring tab

- **GIVEN** a 16-card incomplete deck
- **WHEN** the export dialog opens
- **THEN** the deckstring tab shows a localized "deck not legal"
  message and the "Copy" button for that tab is disabled

#### Scenario: Copy puts content on clipboard

- **WHEN** the user clicks "Copy" on the deckstring tab of a legal
  deck
- **THEN** `navigator.clipboard.writeText` is called with the
  deckstring

### Requirement: DeckSelectDialog prefers saved decks

The existing `DeckSelectDialog` SHALL render saved decks (from
`window.hdt.decks.list()`) above any unsaved live decks (from the
existing `getDecks` flow). Saved decks MUST be visually distinguished
from live decks (e.g. a "Saved" badge or pin icon) so the user can
tell which list a deck belongs to.

When the user picks a saved deck, the dialog MUST forward the saved
deck's `id` and current `version` to the deck-tracker host so match
attribution can be resolved against the saved deck.

When the user picks a live deck, the existing live-deck attribution
flow MUST continue unchanged.

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

### Requirement: Save-from-live affordance on live tracker UI

The renderer's live tracker UI SHALL surface a "Save this deck"
affordance whenever the active live deck is unsaved (i.e. its
identity does not appear in `window.hdt.decks.list()`). Activating
the affordance MUST call `window.hdt.decks.saveFromLive(liveDeckId)`
and refresh the saved-decks list on success.

When `saveFromLive` rejects with
`error.name === 'NonCollectibleSnapshotError'`, the affordance MUST
render a localized explanation rather than a raw error message.

#### Scenario: Save this deck appears for unsaved live deck

- **GIVEN** the live tracker is showing a live deck whose card
  identity is not in the saved list
- **WHEN** the live tracker UI renders
- **THEN** a localized "Save this deck" affordance is visible

#### Scenario: Saving live deck refreshes saved list

- **WHEN** the user activates "Save this deck" and the IPC resolves
- **THEN** the saved-decks list re-fetches and the snapshot of the
  live deck appears in it

### Requirement: i18n coverage of new strings

The deck management UI SHALL render every user-facing string through
the existing `useTranslation()` hook with keys under a `decks.*`
namespace, and SHALL provide entries for every such key in BOTH
`resources/locales/enUS.json` and `resources/locales/zhCN.json`.

Hard-coded strings MUST NOT appear in any new component. Existing
i18n smoke tests MUST be extended to cover at least one string from
each new component (editor, import dialog, export dialog, saved-decks
list, save-from-live affordance).

#### Scenario: Both locales render the editor

- **WHEN** the renderer renders `DeckEditor` under `enUS` and again
  under `zhCN`
- **THEN** the editor's primary heading text is non-empty in both
  locales and not equal to the translation key

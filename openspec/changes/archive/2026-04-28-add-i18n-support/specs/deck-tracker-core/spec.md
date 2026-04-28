## MODIFIED Requirements

### Requirement: Renderer Zustand store + React panel

`apps/desktop/src/renderer/src/stores/deck-tracker-store.ts` SHALL
expose a Zustand store mirroring the IPC-pushed snapshot.

The store MUST:

- Initialize with `{ snapshot: null, phase: 'IDLE', error: null }`.
- Subscribe to `deck-tracker:state` IPC events on the first
  `useDeckTracker` hook mount; unsubscribe on last unmount.
- Provide selectors `useDeckTrackerSnapshot()`, `useDeckTrackerPhase()`,
  `useDeckTrackerError()`.

`apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` SHALL render
the live deck contents during IN_MATCH phase using the active i18n locale
for all user-visible chrome, empty states, counters, badges, and diagnostic
labels.

The component MUST:

- Show the localized equivalent of "waiting for match to start" during
  IDLE / PRE_MATCH.
- Show a vertical list of unique cards in `originalDeck`, one row per
  cardId, ordered by mana cost ascending then alphabetically.
- Each row displays: localized card name (via `@hdt/hearthdb` lookup for
  the active app locale) / mana cost / `remaining / total` count / rarity
  color tint.
- Cards with `remaining === 0` render dimmed.
- The most-recently-drawn card (delta vs previous snapshot) gets a subtle
  1s highlight animation.
- An "extras" badge shows when `snapshot.extras.length > 0`, using the
  active i18n locale and localized plural/count text.
- An empty / disconnected state shows the localized empty-state with a
  localized diagnostic line for "Hearthstone not running" or "match not
  detected".

`apps/desktop/src/renderer/src/components/DeckSelectDialog.tsx` (NEW)
SHALL prompt the user to pick a deck when the orchestrator's identifier
returns null.

The dialog MUST:

- Use Radix Dialog primitives (already in `apps/desktop` deps).
- List all `getDecks()` results filterable by hero class.
- Persist the user's last choice per game-mode in `localStorage` for
  next-match pre-selection.
- Render all user-visible labels, actions, empty states, and diagnostics
  through the active i18n locale.

#### Scenario: Live deck panel shows 30 cards on match start

- **GIVEN** the user enters a match with a 30-card Standard deck
  identified by `InGameDeckIdentifier`
- **WHEN** the renderer mounts and the tracker pushes the initial snapshot
- **THEN** the panel displays N rows summing to 30 cards
  (where N = number of unique cardIds in the deck)

#### Scenario: Drawing a card updates the panel within 500ms

- **GIVEN** an active match and a deck with `Fireball x2 / Frostbolt x2`
- **WHEN** the user draws a Fireball
- **THEN** within 500ms (one polling interval) the Fireball row shows
  `1 / 2` instead of `2 / 2` and is briefly highlighted

#### Scenario: Dialog fallback for unidentified deck

- **GIVEN** the user enters Practice mode (no in-game selection)
- **WHEN** the tracker reaches IN_MATCH phase
- **THEN** `DeckSelectDialog` opens with the user's saved decks listed
- **WHEN** the user picks a deck and confirms
- **THEN** the orchestrator receives the choice via
  `'deck-tracker:select-deck'` and `LiveDeckPanel` populates within
  the next poll

#### Scenario: Live deck empty state follows active locale

- **GIVEN** the active app locale is `zh-CN`
- **WHEN** `LiveDeckPanel` renders without an active match
- **THEN** the waiting empty state, panel header, and diagnostic text render
  in Chinese

#### Scenario: Deck selection dialog follows active locale

- **GIVEN** the active app locale is `en-US`
- **WHEN** the tracker emits `needs-deck-selection`
- **THEN** the dialog title, filter labels, confirm action, cancel action,
  and empty-state text render in English

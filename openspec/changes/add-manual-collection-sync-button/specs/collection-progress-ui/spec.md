## ADDED Requirements

### Requirement: Manual collection sync button

The Collection page header SHALL render a `CollectionSyncButton`
alongside the existing DB-cards stat chip. The button MUST expose a
single primary action that, on click, refreshes the in-page collection
progress AND the per-card owned-count map AND the live deck store in
parallel.

The button SHALL drive its own four-state machine: `idle`, `syncing`,
`success`, `error`. The button MUST be disabled in the `syncing`
state. The `success` and `error` states MUST auto-revert to `idle`
after a short delay (`success` ≤ 2500 ms, `error` ≤ 3500 ms).

Clicking the button while in `success` or `error` MUST immediately
re-enter `syncing` without waiting for the timer.

The three async operations launched by a click MUST run in parallel
via `Promise.allSettled` so a failure on one path does not abort the
others. The button's terminal state is determined by the result of the
`collection.getProgress()` call only: a fulfilled result → `success`,
a rejected result → `error`. Deck-sync failures and HearthMirror
unavailability MUST NOT flip the button to `error`.

When the sync completes (regardless of terminal state), the renderer
state for `progress` and `ownedByDbfId` MUST be updated with whatever
values came back from the fulfilled IPCs. Already-fetched values are
preserved when their IPC rejected.

#### Scenario: Click while idle starts a sync

- **GIVEN** the Collection page is rendered and the sync button is in
  `idle`
- **WHEN** the user clicks the button
- **THEN** the button enters `syncing`
- **AND** `window.hdt.decks.syncFromLive()`,
  `window.hdt.collection.getProgress()`, and
  `window.hdt.hearthmirror.getCollection()` are all invoked once
- **AND** the button is disabled

#### Scenario: All three calls succeed

- **GIVEN** the button is in `syncing`
- **AND** all three IPC calls resolve successfully
- **WHEN** every call settles
- **THEN** the button transitions to `success`
- **AND** the progress tiles re-render with the refreshed data
- **AND** within 2500 ms the button auto-reverts to `idle`

#### Scenario: Progress refresh fails

- **GIVEN** the button is in `syncing`
- **AND** `collection.getProgress()` rejects with an error
- **AND** `decks.syncFromLive()` and `hearthmirror.getCollection()`
  resolve
- **WHEN** every call settles
- **THEN** the button transitions to `error`
- **AND** within 3500 ms the button auto-reverts to `idle`

#### Scenario: Deck sync fails but progress succeeds

- **GIVEN** the button is in `syncing`
- **AND** `decks.syncFromLive()` resolves with `{ ok: false }`
- **AND** `collection.getProgress()` resolves with a valid response
- **WHEN** every call settles
- **THEN** the button transitions to `success`
- **AND** the progress tiles re-render with the refreshed response

#### Scenario: HearthMirror unavailable does not flip button to error

- **GIVEN** the button is in `syncing`
- **AND** `hearthmirror.getCollection()` resolves with `null`
- **AND** `collection.getProgress()` resolves with a valid response
- **WHEN** every call settles
- **THEN** the button transitions to `success`
- **AND** the existing `ownedByDbfId` map is preserved unchanged

#### Scenario: Click during success re-enters syncing immediately

- **GIVEN** the button is in `success`
- **WHEN** the user clicks the button before the auto-revert timer
  fires
- **THEN** the button transitions to `syncing` immediately
- **AND** a fresh round of the three IPC calls is invoked

### Requirement: Manual sync button is fully localized

Every user-visible string on the manual sync button SHALL resolve
through the active i18n locale via `useTranslation()` and MUST appear
in both `resources/locales/en-US.json` and `resources/locales/zh-CN.json`.

The affected strings include the four state labels and the
accessibility label. Required localized keys: `collection.sync.button.idle`,
`collection.sync.button.syncing`, `collection.sync.button.success`,
`collection.sync.button.error`, `collection.sync.button.ariaLabel.idle`,
`collection.sync.button.ariaLabel.syncing`.

No string MUST be hard-coded inline in the rendered JSX.

#### Scenario: English locale renders English button labels

- **GIVEN** the active locale is `en-US`
- **WHEN** the Collection page renders
- **THEN** the sync button reads `Sync` (or the configured English
  label) in the `idle` state

#### Scenario: Chinese locale renders Chinese button labels

- **GIVEN** the active locale is `zh-CN`
- **WHEN** the Collection page renders
- **THEN** the sync button reads `同步` in the `idle` state
- **AND** the syncing-state label reads `正在同步…`

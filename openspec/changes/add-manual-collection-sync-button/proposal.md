## Why

The Collection route currently refreshes its data only on mount and on
the existing automatic retry / sync triggers (`syncFromLive` on mount,
plus the queue-entry trigger added by `adopt-hdt-sync-patterns`). When
a player edits decks or opens packs **after** the Collection page has
loaded, there is no user-facing way to ask the app to "pull the latest
now" — they must navigate away and back, or wait for the next
auto-sync moment, neither of which is discoverable.

Upstream HDT exposes a manual `Refresh` button next to the in-app
collection stats for exactly this reason. We should mirror that
affordance so a user who just changed something in Hearthstone can
trigger an immediate sync without leaving the Collection page.

## What Changes

- Add a `CollectionSyncButton` to the Collection page header (alongside
  the existing DB-cards stat chip). The button has four visual states:
  `idle`, `syncing`, `success`, and `error`. Success and error
  states auto-revert to `idle` after a short delay.
- Clicking the button kicks off three operations **in parallel**:
  1. `window.hdt.decks.syncFromLive()` — pulls the latest live deck
     identities into the local deck store.
  2. `window.hdt.collection.getProgress()` — re-fetches per-set
     progress (and the snapshot store updates server-side).
  3. `window.hdt.hearthmirror.getCollection()` — refreshes the
     per-card owned-count map used by the Set Detail view.
- While any of those three is in flight, the button is disabled and
  shows a spinner with a localized "正在同步…" label.
- When all three complete (regardless of whether HearthMirror was
  available), the visible Collection state (progress tiles, detail
  view if open) is updated and the button briefly shows a
  localized "已同步" or "同步失败" indication before reverting.
- Refactor `Collection.tsx` to extract the `getProgress` and
  `getCollection` fetchers into reusable callbacks (the existing
  mount-time retry logic continues to use them on mount).

## Non-goals

- Do not add background polling. The button is strictly user-driven.
- Do not record sync history, surface a "last synced at" timestamp, or
  add toast notifications outside the button itself.
- Do not change the auto-sync triggers (`syncFromLive` on mount, the
  queue-entry trigger) or the `collection.getProgress` IPC contract.
- Do not propagate the manual sync to other tabs/routes — only the
  Collection route exposes the button.
- Do not let the button replace or hide the existing DB-cards stat
  chip; both coexist in the header.

## Capabilities

### Modified Capabilities

- `collection-progress-ui`: adds a new requirement covering the manual
  sync button, its four visual states, and the refresh semantics for
  the in-page data (progress + per-card owned counts).

## Impact

- Renderer:
  - `apps/desktop/src/renderer/src/components/Collection.tsx` —
    extract `loadProgress` / `loadOwnedByDbfId` into reusable
    callbacks; render the new button in the header; manage button
    state.
  - `apps/desktop/src/renderer/src/components/CollectionSyncButton.tsx`
    — new (controlled button with 4 states + spinner).
- i18n:
  - `resources/locales/en-US.json` / `zh-CN.json` — new keys for the
    button label, syncing label, success label, error label, and an
    `aria-label`.
- Tests:
  - `apps/desktop/src/renderer/tests/CollectionSyncButton.test.tsx` —
    new (state-machine + click + disabled-while-pending).
  - `apps/desktop/src/renderer/tests/Collection.progress.test.tsx`
    extends with a "manual sync refreshes progress + decks" case.
- No IPC contract change; no main-process change.

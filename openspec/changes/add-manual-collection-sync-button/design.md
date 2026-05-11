## Context

The Collection route already has every primitive it needs to do a
manual refresh:

- `window.hdt.collection.getProgress()` returns a fresh
  `CollectionProgressResponse` and, server-side, updates the snapshot
  store via `collection-snapshot-store`.
- `window.hdt.decks.syncFromLive()` re-pulls live decks into the local
  deck store with single-flight coalescing.
- `window.hdt.hearthmirror.getCollection()` returns the raw owned-card
  map used by the Set Detail view's per-card overlays.

What's missing is the user-facing affordance to trigger them on
demand, and the renderer state plumbing to redraw after the calls
complete. Both auto-sync paths in the app today (mount-time `useEffect`
and the match-start trigger added by `adopt-hdt-sync-patterns`) cover
"natural" sync moments; the manual button covers everything in
between.

## Goals / Non-Goals

**Goals:**

- Provide one visible, discoverable affordance on the Collection page
  that pulls the latest data from Hearthstone.
- Surface a clear progress + outcome signal in the button itself —
  enough that a user sees "did it work?" without a separate toast.
- Reuse the existing IPCs and main-process logic. No new IPC handlers.

**Non-Goals:**

- No periodic polling. No toast system. No "last synced at" badge.
- No per-tab sync (only Collection has the button).
- No retry-on-failure for the manual flow (the user clicks again if
  they want).

## Decisions

### Decision 1: Where the button lives

**Options:**

- Inside the new tab bar row (next to `卡牌 / 卡背图案 / …`).
- In the page header, alongside the DB-cards stat chip.

**Choice:** Page header, immediately left of the DB-cards chip.

**Rationale:** The tab bar slot is dense and the button's purpose
("sync this page's data") is global to the route, not specific to a
tab. The header keeps it persistent across the grid and detail views
without re-anchoring as the user drills in.

### Decision 2: How to refresh data without a router

**Choice:** Refactor the existing mount-time `useEffect`s in
`Collection.tsx` into named `useCallback`s
(`loadProgress` / `loadOwnedByDbfId`). The `useEffect`s still call
them once on mount; the button click calls them again. No new state
flow.

### Decision 3: Button state machine

```text
idle ──click──> syncing ──ok──> success ──2s──> idle
                  │
                  └──err──> error ──3s──> idle
```

The button is disabled in `syncing`. Subsequent clicks while in
`success` or `error` immediately transition back to `syncing` (no
debounce — the host's single-flight handles overlap).

The state lives in `Collection.tsx`, not in the button itself, so the
container can also drive the spinner from external trigger sources
later if needed (e.g. wiring the button to fire when the user presses
F5).

### Decision 4: How the three async operations are coordinated

```ts
const [decksResult, progressResult, ownedResult] = await Promise.allSettled([
  window.hdt.decks.syncFromLive(),
  window.hdt.collection.getProgress(),
  window.hdt.hearthmirror.getCollection(),
]);
```

`allSettled` so a HearthMirror failure on one path does not abort the
others. The button enters `success` if `progressResult.status ===
'fulfilled'` (the most user-visible signal). Decks-sync failures and
HearthMirror unavailability are common offline states and should not
flip the button to `error`. The button flips to `error` only when
the progress refresh itself rejects.

### Decision 5: Auto-revert timing

`success` clears after 2000 ms; `error` clears after 3000 ms. Both
timers are cleared if the user clicks again before they fire (we just
re-enter `syncing` immediately).

### Decision 6: Visual treatment

- `idle`: secondary button with `RefreshCw` icon + localized "同步"
  label.
- `syncing`: same button, icon swapped for `Loader2` with `animate-spin`,
  label swapped to "正在同步…", `disabled`.
- `success`: green text + `Check` icon, label "已同步".
- `error`: amber text + `AlertTriangle` icon, label "同步失败".

All three icons are from `lucide-react` (already a project dep).

### Decision 7: Accessibility

The button is a `<button type="button">` with an `aria-label` that
includes the current state ("Sync collection now" / "Syncing…" /
"Sync complete" / "Sync failed"). The state changes are announced
implicitly via the visible text swap; we do not add an `aria-live`
region.

## Risks / Trade-offs

- **Risk:** Three parallel calls could overwhelm a slow HearthMirror
  bridge. **Mitigation:** the host's existing single-flight on
  `decks.syncFromLive` and the synchronous serialization inside the
  HearthMirror native bridge already serialize concurrent reads.
- **Trade-off:** Showing "已同步" even when decks sync silently failed
  (offline) is a slight white-lie. Acceptable: the user's primary
  expectation is collection-progress refresh; if decks were stale,
  the renderer's own deck-sync surfaces (My Decks, DeckSelectDialog)
  carry their own status indicators.

## Migration Plan

Additive only. No persisted state, no schema, no IPC contract change.
The existing mount-time fetch logic is preserved; the refactor just
exposes it as a callable.

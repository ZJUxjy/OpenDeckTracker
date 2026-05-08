## Context

Two overlay BrowserWindows (`/overlay`, `/overlay-opponent`) are positioned by `apps/desktop/src/main/index.ts` based on `HearthstoneWindowTracker` events: each tick computes a panel rect anchored to the HS window left/right edge and calls `OverlayWindowManager.setBounds(rect)`. The renderer side renders `TrackerPanelTabs` whose top tablist row visually looks like a draggable titlebar but has no `app-region: drag`, so OS-level drag never starts. Even if it did, the next tracker tick (~250ms cadence) would call `setBounds` again and snap the overlay back.

The desired behavior:

- User clicks-and-drags the tab row → overlay moves with the cursor (OS native window drag).
- After release, the overlay stays at the dragged position.
- HS window subsequently moves → overlay moves with it, preserving the user's pixel offset relative to the default tracker-derived position.

This is a small but non-trivial split: the renderer has to declare the drag region, and the main process has to compose `tracker bounds + user offset` instead of treating the tracker as authoritative.

## Goals / Non-Goals

**Goals:**

- Top tablist row of `TrackerPanelTabs` becomes the OS drag handle for both overlay windows; tab buttons and effects badge stay clickable.
- `OverlayWindowManager` learns to remember a per-window user offset and apply it on top of subsequent tracker bounds.
- Offset is established entirely from observing the user's drag — no UI input, no settings page.
- Per-side (player / opponent), independent offsets.

**Non-Goals:**

- Persisting offsets across Electron restarts (in-memory only this round).
- Resetting offsets on new match / app reset (offset is sticky until restart).
- Snapping / grid alignment / "reset to default" UI button.
- Dragging the main window or the card-preview window (those are out of scope).
- Resizing via drag.

## Decisions

### Decision 1: drag region scope — only the tablist row, not the whole panel

- **Context**: The tablist `<div role="tablist">` in `TrackerPanelTabs.tsx` is a strip ~32px tall at the top of each overlay. Below it is the deck list / effects panel, which the user already clicks for hover-card previews and tab interactions.
- **Options**:
  1. Whole panel `app-region: drag`, individual interactive children opt out via `no-drag`.
  2. Only the tablist row `app-region: drag`, tab pills + close button opt out.
  3. Add a dedicated invisible drag handle stripe.
- **Choice**: 2.
- **Rationale**: 1 has too many `no-drag` exceptions (every card row, every hover target) and Electron's drag-region hit testing can cause subtle event eating on `no-drag` elements. 3 is more code and design churn. The user's request explicitly names the tablist row as the drag handle.

### Decision 2: where to declare the drag region

- **Context**: `TrackerPanelTabs` is shared by main window dock and overlay routes (the same component renders in both). Drag regions only matter in the overlay BrowserWindows (frame: false).
- **Options**:
  1. Inline `style={{ WebkitAppRegion: 'drag' }}` always — harmless in main window because main window has its own native title bar and drag regions only affect frameless windows.
  2. Conditional based on `data-overlay` body attribute (set by `custom-scrollbar` change).
  3. Compute via prop on `TrackerPanelTabs` from the overlay views.
- **Choice**: 1.
- **Rationale**: Simplest, smallest diff, no cross-change coupling. Drag regions on framed windows are no-ops, so no risk of leaking the behavior into the main window.

### Decision 3: offset composition vs. position override

- **Context**: When tracker emits new bounds, what do we do with user offset?
- **Options**:
  1. **Override**: after first user drag, ignore tracker bounds entirely. User position is absolute and frozen.
  2. **Compose**: store `userOffset = userPos - trackerPos` at drag-end. On every tracker emit, apply `trackerPos + userOffset`.
  3. **Snap to nearest edge**: detect which HS edge the user is closest to and re-anchor accordingly.
- **Choice**: 2.
- **Rationale**: Composing keeps the overlay following HS window movement (the original value of the tracker), while honoring the user's positional preference. Override (1) breaks if user moves HS window. Snap (3) is overkill for v1 and ambiguous near corners.

### Decision 4: distinguishing user moves from programmatic moves

- **Context**: `BrowserWindow` `moved` event fires for both user-initiated drag-ends and programmatic `setBounds` calls. We must not treat our own `setBounds` as a user drag (would create offset drift).
- **Options**:
  1. Set a transient `isApplyingTrackerBounds = true` flag around `BrowserWindow.setBounds(...)`, ignore `moved` events fired during that flag.
  2. Use the `moved` event's `event.preventDefault` semantics (not available — `moved` is not preventable).
  3. Compare bounds-after-event with `lastApplied` and skip if equal.
- **Choice**: 1.
- **Rationale**: Flag-based is dead simple and correct. The `setBounds` call is synchronous; the `moved` event fires in the same tick after it returns. Set the flag, call `setBounds`, clear the flag in a microtask. Any `moved` event arriving with the flag set is "ours, skip it"; any other `moved` is a user drag.

### Decision 5: offset storage location and lifecycle

- **Context**: Where does `userOffset` live?
- **Options**:
  1. Field on `OverlayWindowManager` instance, lost on `dispose()` and on app restart.
  2. Module-level singleton in `overlay-window.ts` keyed by `routeHash`.
  3. Persisted via electron-store / settings DB.
- **Choice**: 1.
- **Rationale**: Per-instance matches the "per-side" scope cleanly; `OverlayWindowManager` is the natural owner. Persistence is explicitly a non-goal (proposal); 3 deferred to a follow-up. 2 has no benefit over 1.

### Decision 6: when to reset the offset

- **Context**: Should the offset reset on disable / new match / app focus / app restart?
- **Choice**: Reset only on `dispose()` (which today fires on `app.before-quit`). No mid-session reset.
- **Rationale**: Sticky offset matches user expectation ("I parked it there, leave it there"). Resetting silently would surprise users.

## Risks / Trade-offs

- [Risk] User drags overlay completely off-screen (e.g., past 0,0 or past display bounds), can't see how to drag back → **Mitigation**: clamp post-compose bounds to current display work-area in `OverlayWindowManager`. Trade off a bit of complexity for unrecoverable state safety.
- [Risk] User offset becomes nonsensical after switching primary monitor or DPI change → Accepted; user re-drags. (Documented in proposal as non-goal.)
- [Risk] `app-region: drag` on a flex row could swallow click events on tab pills if `no-drag` propagation has gaps → **Mitigation**: explicitly mark each pill button + close button + effects badge with `no-drag`; existing close button already does this.
- [Risk] The HMR / React Fast Refresh during `pnpm dev` re-mounts the overlay component, which could clear offset (it lives in main, not renderer) → not an issue, offset is in main process.
- [Trade-off] Composing offset means a tiny "lag" on each tracker tick — overlay re-snaps to `tracker + offset` which is the same place it was, so visually no movement, but a `setBounds` is still called. Suppressed by existing `lastAppliedBounds` equality check, so net cost is zero.

## Affected directory tree (no new files)

```
apps/desktop/src/
├── main/
│   ├── overlay-window.ts        (modified — userOffset, moved event listener, compose)
│   └── overlay-window.test.ts   (modified — new test cases)
└── renderer/src/components/
    └── TrackerPanelTabs.tsx     (modified — app-region: drag/no-drag)
```

## Migration Plan

No data migration. Rollout:

1. Renderer change first (declares drag region): merging alone makes drag start, but tracker still snaps back — visible bug for one commit window if shipped solo.
2. Main change second (offset compose) finishes the feature.

Recommend landing both in the same PR / commit chain. Roll back = revert both commits.

## Open Questions

无。

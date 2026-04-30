## Why

The OpenDeckTracker UI design (Direction A locked, see
`docs/design/opendecktracker/project/v2-artboard.jsx`
"BOTH OVERLAYS PINNED LEFT/RIGHT" and the dedicated
`ConsoleOpponentOverlay` component in `v2-console-extras.jsx`)
calls for **two separate transparent overlay windows** during a
Hearthstone match: a cyan player overlay on the left and a
red-tinted opponent overlay on the right. The just-shipped
`add-opponent-overlay-window` change wired the player side, but
the opponent panel still renders inside the same `/overlay` route
(`OverlayView.tsx:11` mounts `OpponentCardsPanel` next to
`LiveDeckPanel`). That collapses two design surfaces into one
window, blocks per-side positioning/sizing, and prevents the user
from running just-the-opponent during streaming.

This change splits the opponent into its own `OverlayManager`
instance with a separate `#/overlay-opponent` route and a separate
Settings toggle. It deliberately stops at the v1 scope: same data
that already powers `OpponentCardsPanel` today, just hosted in a
second window. The v2 design's "predicted vs revealed" pip-count
treatment with `?` markers and archetype match-score is a follow-up.

## What Changes

- **MODIFIED** `OverlayManager` (`apps/desktop/src/main/overlay-window.ts`)
  gains a `routeHash` constructor option (default `'/overlay'`) so the
  same class can host either route. No other behavior changes.
- **NEW** A second `OverlayManager` instance is created in the main
  process bootstrap (`apps/desktop/src/main/index.ts`) for the
  opponent overlay, wired to the same `hearthmirror.isAlive` poller.
- **NEW** Renderer route `#/overlay-opponent` rendering only
  `OpponentCardsPanel` (positioned right-aligned, with `pointer-events`
  islands matching the existing player overlay treatment).
- **NEW** IPC channel `overlay:set-enabled-opponent` (mirrors the
  existing `overlay:set-enabled`) and preload binding
  `window.hdt.overlay.setEnabledOpponent(boolean)`.
- **MODIFIED** `useAppearanceStore` gains a `gameOverlayOpponent: boolean`
  preference + `setGameOverlayOpponent(next)` setter. Persists in the
  same localStorage namespace; default `false`. `AppearanceApplyEffect`
  re-fires it on boot exactly like `gameOverlay`.
- **MODIFIED** `Settings.tsx` Overlay panel: a second toggle row for
  "Show opponent overlay" sits below the existing player toggle, with
  the same row pattern.
- **NEW** i18n keys under `settings.overlay.*`:
  `enableOpponentTitle`, `enableOpponentDescription` in `en-US.json`
  and `zh-CN.json`.
- **Non-goals (deferred to a future change):**
  - The v2 design's red-accent visual chrome on the opponent panel
    (`rgba(20,11,14,opacity)` / `rgba(248,113,113,0.28)` border) —
    v1 reuses today's `OpponentCardsPanel` styling unchanged.
  - Predicted-cards rows with `?` certain/uncertain markers and the
    "from N ranked games" footer.
  - Archetype match-score header line (`CONTROL · 84% MATCH`).
  - Per-window position / size persistence — both windows full-screen
    primary display, click-through via existing CSS pattern.
  - Class-tinted opponent accent (this depends on the bigger
    Settings → Appearance preset/recipe work, separate change).

## Capabilities

### New Capabilities

None — this extends the already-defined overlay-window behavior;
there is no new domain surface.

### Modified Capabilities

- `overlay-window`: the spec gains a second managed window keyed by
  route hash, plus a second user-facing enable preference. The
  existing show/hide / running-detection / boot re-fire requirements
  apply to both instances independently.

## Impact

- `apps/desktop/src/main/overlay-window.ts` — add `routeHash` option
  (~5 lines).
- `apps/desktop/src/main/index.ts` — instantiate a second manager,
  hook `before-quit` cleanup.
- `apps/desktop/src/main/ipc.ts` — register
  `overlay:set-enabled-opponent`.
- `apps/desktop/src/preload/index.ts` + renderer `window.hdt`
  typings — add `overlay.setEnabledOpponent`.
- `apps/desktop/src/renderer/src/routes.tsx` — register
  `/overlay-opponent`.
- `apps/desktop/src/renderer/src/components/` — new
  `OpponentOverlayView.tsx` (small wrapper around
  `OpponentCardsPanel`).
- `apps/desktop/src/renderer/src/stores/appearance-store.ts` — new
  preference field + setter; legacy payloads without it parse cleanly.
- `apps/desktop/src/renderer/src/components/AppearanceApplyEffect.tsx`
  — second mount-time re-fire.
- `apps/desktop/src/renderer/src/components/Settings.tsx` — second
  toggle row in the Overlay branch.
- `resources/locales/{en-US,zh-CN}.json` — two new keys.
- No DB / IPC schema migrations. No external dependency changes.

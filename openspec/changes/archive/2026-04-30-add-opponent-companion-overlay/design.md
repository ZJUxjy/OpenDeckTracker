## Context

The just-shipped `add-opponent-overlay-window` change introduced an
`OverlayManager` (`apps/desktop/src/main/overlay-window.ts`) that owns
a single transparent always-on-top BrowserWindow loading
`#/overlay`. The renderer's `OverlayView.tsx:11` mounts both the
player's `LiveDeckPanel` and the opponent's `OpponentCardsPanel`
inside that one window.

The OpenDeckTracker UI design (Direction A locked, see chat
`docs/design/opendecktracker/chats/chat1.md` and the v2 components
`docs/design/opendecktracker/project/v2-console-extras.jsx` +
`v2-artboard.jsx`) calls for the opponent panel to live in a
separate window, pinned to the right side of the screen, so the user
can toggle / position it independently. v1 keeps today's panel
visuals; the v2 red-tinted chrome and predicted-card markers are out
of scope here.

## Goals / Non-Goals

**Goals:**
- Reuse the existing `OverlayManager` class for both windows; do not
  fork a near-duplicate `OpponentOverlayManager`.
- Each window has its own user-facing enable preference and its own
  IPC channel; both share the same `hearthmirror.isAlive()` poller
  output via `setRunning`.
- Hash-route split keeps the renderer bundle the same — only the
  initial route changes.
- Boot re-fire treats the two preferences symmetrically: a stored
  `gameOverlayOpponent: true` must survive a relaunch.

**Non-Goals:**
- Per-window position / size persistence. Both windows full-screen
  the primary display work area; click-through is handled the same
  way as today via CSS `pointer-events`.
- The v2 `ConsoleOpponentOverlay` red-accent chrome
  (`rgba(20,11,14,opacity)` background, `rgba(248,113,113,0.28)`
  border), the certain/uncertain `?` markers, the predicted-cards
  rows, and the `from N ranked games` footer.
- Class-tinted opponent overlay accent — depends on the larger
  Settings → Appearance preset/recipe work.
- Repositioning / split-screen layout — both overlays render where
  their parent React component places them inside their own
  full-screen window.

## Decisions

### 1. Reuse `OverlayManager` with a `routeHash` option

**Context:** The class today hard-codes
`#/overlay` in `createWindow()`. Everything else
(transparent / frameless / always-on-top / `setRunning` / boot
re-fire / poll throttle) is route-agnostic.

**Options:**
- A. Add a `routeHash: string` constructor option (default
  `'/overlay'`). Instantiate the class twice in `index.ts`.
- B. Extract a base class and subclass it for the opponent.
- C. Duplicate the class as `OpponentOverlayManager`.

**Choice:** A.

**Rationale:** The two windows differ only in their initial route and
their owning preference. Subclassing buys nothing because there is no
divergent behavior. Duplication invites drift on the throttle /
window options, which are the load-bearing parts of the v1.

### 2. Two IPC channels and two preferences, one poller

**Context:** Both windows want the same "Hearthstone is alive"
signal. Today the player overlay's `OverlayManager` owns its own
`setInterval` polling `hearthmirror.isAlive()`. With two managers,
naively each would spawn its own 3 s poll → wasted work and
redundant log churn.

**Options:**
- A. Each `OverlayManager` keeps its own poller (status quo
  duplicated).
- B. Lift the poller into `index.ts`, fan out the result via
  `manager.setRunning(...)` calls. Keep the poller running while
  *either* manager is enabled.
- C. Share one poller as a singleton inside the
  `overlay-window.ts` module.

**Choice:** B.

**Rationale:** The poller is owned by the bootstrap layer that knows
both managers. The `OverlayManager` class no longer auto-starts a
poller; instead it gets the running signal pushed in. This means the
class becomes a pure "I show / hide a window for this route based on
two booleans" component. Bootstrap-side coordination keeps the API
small. Concretely:

- `OverlayManager` loses its private `pollHandle` /
  `startPolling` / `poll` methods. `enable` / `disable` no longer
  start or stop a timer.
- `index.ts` runs one `setInterval(3000)` polling
  `hearthmirror.isAlive()`. Each tick:
  - Call `playerManager.setRunning(running)` and
    `opponentManager.setRunning(running)`.
  - Each manager's existing 3-strikes-throttle on `setRunning(false)`
    moves into the bootstrap-side state instead.
- Lifecycle: the poller starts when either manager is enabled and
  stops when both are disabled.

This is a small refactor of the just-shipped class. The migration is
covered by the existing `overlay-window.test.ts` (the throttle
scenarios move from the class to the bootstrap test) plus a new
`overlay-bootstrap.test.ts` for the fan-out.

### 3. Renderer route `#/overlay-opponent`

**Context:** The renderer entry needs to differentiate which window
it is rendering for. Today `routes.tsx` registers `'/'` and
`'/overlay'`. The opponent window's BrowserWindow loads the same
`index.html` with a different hash.

**Options:**
- A. New route `/overlay-opponent` rendering only
  `OpponentCardsPanel`.
- B. Single `/overlay` route that reads a `?role=opponent` query
  param.
- C. Pass the role through preload as an injected global.

**Choice:** A.

**Rationale:** The route hash is already what the main process picks
when it opens the window; reusing the existing react-router pattern
keeps the renderer code obvious. No new transport (query / global)
needed.

### 4. Two booleans in `useAppearanceStore`, no nesting

**Context:** Today the store carries `density`, `accent`,
`gameOverlay`. The new field is the symmetric twin of `gameOverlay`.

**Options:**
- A. Flat `gameOverlayOpponent: boolean` next to `gameOverlay`.
- B. Nest under `overlay: { player, opponent }`.

**Choice:** A.

**Rationale:** Symmetry with the existing field; legacy stored
payloads without the new key parse cleanly because every read is
defaulted. Nesting forces a migration of existing localStorage values
for no real ergonomic gain at two fields.

### 5. v1 keeps today's `OpponentCardsPanel` styling unchanged

**Context:** The v2 design wants a red-tinted compact opponent panel
matching `ConsoleOpponentOverlay` from
`v2-console-extras.jsx`. That is a follow-up because it requires
new design tokens (red accent variants), a "predicted vs revealed"
data shape, and an archetype match-score header — all data the
renderer doesn't carry yet.

**Choice:** Render the existing `OpponentCardsPanel` as-is in the
new window. The window border / background remain transparent; the
panel's own surface tokens (text, mute, border) inherit from the
shared theme.

**Rationale:** Keeps v1 surface area to "split into a window" and
nothing else. The visual upgrade has its own change.

## Risks / Trade-offs

- **Risk:** Two transparent always-on-top windows on the primary
  display can each capture click events on the wrong region if the
  CSS `pointer-events: none` root is broken. **Mitigation:** the
  existing `OverlayView` already follows the `pointer-events: none`
  root + `pointer-events: auto` islands pattern; the new
  `OpponentOverlayView` follows the same pattern. No
  `setIgnoreMouseEvents` plumbing is added.
- **Risk:** Shared poller refactor changes the just-shipped behavior
  for the player overlay. **Mitigation:** the existing
  `overlay-window.test.ts` scenarios are ported (the
  3-strikes-throttle scenarios move from class-level mocks to
  bootstrap-level mocks). Manual smoke tests in tasks.md
  re-verify the existing player-overlay throttle behavior.
- **Risk:** A user enables both overlays but the opponent window
  obscures the cyan player window (z-order tie). **Mitigation:**
  irrelevant in v1 because both windows full-screen the work area
  with `pointer-events: none` roots; their panel islands sit on
  opposite sides via existing CSS positioning. If a future change
  introduces draggable repositioning, that change owns the z-order
  policy.
- **Trade-off:** The bootstrap-side throttle slightly couples
  `index.ts` to the show/hide policy. Acceptable because the policy
  is one short helper (`Throttler` with a `setRunning(boolean) →
  effective: boolean` shape) and unit-testable in isolation.

## Migration Plan

This is renderer + main-process only; no DB/IPC schema migration
needed. Stored `localStorage.hdt.appearance` payloads written before
this change still parse — the new field defaults to `false`. The
existing `overlay:set-enabled` IPC keeps its name and behavior.

## Open Questions

None. The "should the opponent overlay default to on when the player
overlay is on?" question was considered and dismissed — defaulting
both to `false` is consistent with how the just-shipped player
overlay defaults; the user opts in deliberately.

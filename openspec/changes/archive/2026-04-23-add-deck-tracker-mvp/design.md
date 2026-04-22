## Context

After R-17 + Phase-7 closed, we have **all 19 NAPI reflectors live in
constructed mode** (`14 OK / 5 null / 0 ERR` mid-match). The remaining
gap before "real deck tracker" is purely TS-side: a state machine,
a polling orchestrator, a UI panel.

Two prior explorations frame this design:

1. **HDT (C# upstream) reverse-engineering** — see
   `docs/explorations/2026-04-22-hdt-deck-tracking-architecture.md`
   (informal, captured in conversation). Key takeaways:
   - HDT is **event-driven** (Power.log → 60+ HandleX events → Player
     state machine → DeckState compute).
   - HDT computes "remaining" as **`originalDeck − revealedCardsThatLeftDeck`**,
     NOT by reading the DECK zone — because in Hearthstone the deck is
     genuinely face-down and most cards there have empty `card_id` even
     in memory.
   - Deck identification: user-pre-selected (HDT UI) → auto-detect by
     reveal-set-overlap on every draw → DeckPicker UI watcher fallback.
2. **Our 4-milestone plan**: M1 (schema fix, prerequisite) → **M2
   (memory-only MVP, this change)** → M3 (log stream) → M4 (overlay +
   opponent). M2 is the smallest unit that ships a usable feature.

The user explicitly scoped this work to constructed only. Battlegrounds
/ Mercenaries / Arena are out of scope here and stay null in the new
panel.

### Stakeholders / consumers

- **End user**: opens Electron app, queues a match, sees their deck
  shrink in real time. The single dashboard panel is the entire UX
  surface for M2.
- **Future M3/M4 changes**: build on the same `Game` / `Player` /
  `Entity` classes designed here. Their event ingestion will mutate
  the same state machine — we MUST design state classes that don't
  presuppose a "polling-only" data source.

## Goals / Non-Goals

**Goals:**

- A user with Hearthstone running and Electron open sees a live
  "30 cards remaining" panel that updates within 500ms of each draw.
- Deck identification works without manual configuration in 80%+ of
  ranked / casual / friendly matches (covers "user picks a saved deck
  in-game" flow).
- The state machine model is **portable to event-driven ingestion**
  later (M3) — same classes, just a different feeder.
- Clear failure modes: when deck identification fails or the live
  bridge isn't connected, the user sees a clear empty-state, not a
  silently-wrong list.

**Non-Goals:**

- Polished overlay. The Dashboard panel is the only deliverable;
  overlay window comes in M4.
- Created/Stolen/Discovered card precision. M2 surfaces a "+N created
  cards" count but doesn't track each one's identity. M3 fixes this.
- Opponent-side anything. Even though we have `getBoardState.opposing`
  and `getOpponentSecrets`, M2 ignores them.
- Per-card historical analytics ("you drew Coin on turn 3"). The
  state machine produces enough data that this is *possible* later,
  but the UI doesn't expose any of it in M2.
- Auto-importing decks from the in-game collection (already covered
  by `getDecks`, but we don't add an "import to my saved decks"
  workflow — out of scope).

## Decisions

### D1 — Polling architecture: main-process owner + IPC push to renderer (not renderer pulls)

**Context.** Three plausible architectures for getting live data into
React:

- (a) Renderer polls IPC directly on `setInterval(250ms)`.
- (b) Main process owns a single polling loop + pushes events over IPC
  via `webContents.send`.
- (c) Renderer subscribes via WebSocket-like channel; main forwards.

**Choice: (b).**

**Rationale.** The reflectors are all main-process-only (NAPI native
addon). With (a), every renderer poll = full IPC round-trip + Mono
read; on every screen mount/unmount we'd duplicate work. With (b), one
loop in main computes the canonical state, pushes only diffs to
renderer; renderer is pure projection. (c) overcomplicates IPC
without benefit.

The polling loop lives in `apps/desktop/src/main/deck-tracker.ts`,
holds a `DeckTracker` instance from `@hdt/core`, and uses
`webContents.send('deck-tracker:event', event)` to push.

The renderer gets a Zustand store
(`apps/desktop/src/renderer/src/stores/deck-tracker-store.ts`) that
listens via the preload-exposed `onDeckTrackerEvent(callback)`
subscription API; the React component subscribes to the slice it
needs.

### D2 — State machine in `@hdt/core`, NOT in main process or renderer

**Context.** `Game` / `Player` / `Entity` classes need a home.

**Options:**

- (a) Live in `apps/desktop/src/main/`.
- (b) Live in `packages/core/` as a workspace package.
- (c) Live in `packages/hearthmirror/` next to the bridge.

**Choice: (b).**

**Rationale.** (a) couples domain to Electron — can't unit-test
without spinning up Electron, can't reuse for a future CLI / log
import tool. (c) couples domain to the memory bridge — when M3
adds log ingestion, that goes into a separate `packages/hearthwatcher`
and feeds into the same `Game` classes; mixing them inside
`hearthmirror` would force a circular dep.

(b) keeps the canonical state machine where multiple consumers
(memory poller, log watcher, future replay viewer) can feed it
events. M2 has only one consumer, but the package boundary is
correct from day one.

### D3 — "Remaining cards" algorithm: `original − seen`, NOT `read DECK zone`

**Context.** Two ways to compute "what's left in the deck":

- (a) On every poll, take `getDeckState.friendly_deck` and report it
  directly — the reflector returns `{ entity_id, card_id }` for each
  remaining entity.
- (b) On match start, snapshot `originalDeck = getDecks[picked]` (a
  multiset of `cardId → count`). On every poll, take
  `seen = getHandState.friendly_hand ∪ getBoardState.friendly ∪
  graveyardEntities`, and compute
  `remaining = originalDeck − seen`.

**Choice: (b).**

**Rationale.** Live experiment confirmed (a) returns mostly empty
`card_id` strings for cards in DECK zone — Hearthstone keeps them
face-down even in memory. So (a) gives accurate **counts** but
useless **identities** for the panel. (b) gives accurate
identities at the cost of needing a starting-state snapshot.

This matches HDT's `Player.GetDeckState()` algorithm
(`Hearthstone Deck Tracker/Hearthstone/Player.cs:105–221`), modulo
the `Created/Stolen/Hidden/OriginalController` flags that require
event-stream context (deferred to M3).

For M2 the simplification is: ignore Created/Stolen entirely.
Cards that appear in `seen` but NOT in `originalDeck` are tagged
`extra` in the snapshot and surfaced as a small badge "+2 generated"
in the panel; they don't subtract from `remaining`.

### D4 — Match-phase detection: state-machine over polled snapshots, not log events

**Context.** We need to know:
- match started → snapshot originalDeck
- match ended → reset state, persist run

**Options:**

- (a) Watch `getMatchInfo` going from `null` → `not-null` to detect
  start; `isGameOver` going `false → true` to detect end.
- (b) Watch a more reliable signal like
  `getServerInfo` becoming non-null (PvP only) or `getBoardState`
  becoming non-null.

**Choice: (a).**

**Rationale.** `getMatchInfo` is the most reliable signal across
modes (PvP / Practice / Adventure / Brawl). `getServerInfo` is null
in Practice. `getBoardState` becoming non-null is correlated but
slightly noisier (mulligan hand is technically pre-board).

The phase machine is:

```
       IDLE
        │  getMatchInfo non-null ⇒
        ▼
     PRE_MATCH
        │  getDeckState non-null ⇒  (snapshot originalDeck here)
        ▼
     IN_MATCH
        │  isMulligan transitions true→false ⇒  (note "mulligan done")
        │
        │  isGameOver==true OR getMatchInfo→null ⇒
        ▼
     POST_MATCH ── (publish summary, return to IDLE)
```

Edge case: spectator mode is detected via `isSpectating==true`;
M2 stays IDLE (renderer panel shows "spectating, deck tracker
disabled").

### D5 — Deck identification: in-game memory field FIRST, fallback dialog SECOND, no auto-overlap-match in M2

**Context.** Three ways to know which saved deck the user picked:

- (a) Read an in-game Mono field for "currently selected for play" —
  `CollectionManager.m_lastSelectedDeck` or similar (need to probe).
- (b) HDT-style overlap-match against `getDecks` after observing some
  draws.
- (c) Pop a Radix dialog after match-start, list `getDecks`, user
  picks.

**Choice for M2: (a) → (c) fallback. Skip (b) entirely until M3.**

**Rationale.** (b) requires the same per-draw event-stream that M3
introduces. Without log events, we'd be polling and diffing snapshots
to derive "this is what was drawn this turn" — error-prone and
duplicates work M3 will replace.

(a) is reliable when the user picks a saved deck via the in-game
deck-picker UI (Standard / Wild / Classic / Twist / Casual / Ranked /
Friendly). The deck-picker writes to a `CollectionManager` field
that we just need one Mono probe to find.

(c) covers the gap: Practice mode, Tavern Brawl with custom decks,
or any case where (a) returns `null` / a new-since-last-poll deck
that doesn't exist in `getDecks`.

A small Spike phase in tasks Section 2 finds the exact field name.
If the spike fails (no usable field exists), we fall back to (c)-only
for M2 and pencil in (b) for M3 — same final UX, more friction.

### D6 — Polling rate: adaptive 2s/250ms, NOT 60Hz

**Context.** HDT polls at 16ms. We can't.

**Constraints:**

- Each reflector call is ~50-100ms IPC + Mono read.
- We need ~5 reflectors per in-match poll (`getMatchInfo`,
  `isGameOver`, `isMulligan`, `getDeckState`, `getHandState`).
- That's 250-500ms/poll worst case.

**Choice.**

| State | Rate | Reflectors per poll |
|---|---|---|
| IDLE (Hearthstone closed or main menu) | 2000ms | `isAlive` + `getMatchInfo` |
| PRE_MATCH | 500ms | + `getDecks` once on entering |
| IN_MATCH | 250-500ms (adaptive) | `getMatchInfo`, `isGameOver`, `isMulligan`, `getDeckState`, `getHandState`, `getBoardState` |
| POST_MATCH | one-shot | finalise + back to IDLE |

`getCollection` is **never** polled (>5s). It's called once per
session if the renderer needs it for collection display.

Adaptive rate: in-match starts at 500ms; if a poll detects a hand-size
change, immediately schedule the next poll 100ms later (catch the
just-drawn card faster). Caps at 250ms minimum to bound IPC load.

### D7 — `Entity` model: ID-keyed, ZONE-tagged, but minimal `Info` flags in M2

**Context.** HDT's `Entity` carries ~30 `Info` flags
(`Created`, `Stolen`, `Hidden`, `OriginalController`, `OriginalZone`,
`Discarded`, `Mulliganed`, `CreatedInDeck`, `Returned`, ...) populated
during log parsing. Without log events we can't fill most of them.

**Choice.** M2 `Entity` carries only `{ entityId, cardId, zone,
controller }` — the fields the memory reflectors return. Other flags
exist as `Info` placeholders typed `unknown`-or-undefined, ready for
M3 to populate.

**Rationale.** Defining the shape now (with most fields defaulting
to `undefined`) means M3 doesn't refactor consumers, just fills in
the blanks. Consumers (the algorithm, the panel) treat
`info.created === true` as the only-discriminator-that-matters; in
M2 it's always `undefined` so the algorithm conservatively includes
those cards in `extra`.

### D8 — IPC event protocol: tagged-union "delta" stream

**Context.** The renderer needs to react to: match start, match end,
deck identified, remaining count changed, mulligan finished.

**Options:**

- (a) Push the entire `DeckSnapshot` JSON on every poll.
- (b) Push tagged `MatchEvent` objects describing what changed.
- (c) Mixed: state on subscribe + deltas thereafter.

**Choice: (a) for M2, evolve to (c) in M3.**

**Rationale.** (a) is dead simple: `webContents.send('deck-tracker:state',
fullSnapshot)` on every poll. The snapshot is small (<5KB JSON
typical, dominated by 30 card entries). The renderer just replaces
its store; React handles diffing.

(b) would let us animate "drew card X" but requires the diffing
logic that M3 will add naturally (logs already give us per-event
deltas). Doing (b) now in M2 means duplicating the diff inside the
poller.

(c) is the right shape for M3+ but premature in M2.

The IPC channel name `deck-tracker:state` is intentional — it's
the "current state" channel. M3 will add a sibling `deck-tracker:event`
for actual event-stream consumption.

### D9 — Renderer state: Zustand store, not React Context, not Jotai

**Context.** We need a global state shared between `Dashboard`,
`LiveDeckPanel`, and `DeckSelectDialog`.

**Choice.** Zustand (already in `apps/desktop` deps).

**Rationale.** Already imported. The store is a single object with
selectors; we don't need atom-level granularity (Jotai) because
`LiveDeckPanel` re-renders on every snapshot anyway and there are no
fine-grained subscribers. Context would force prop-drilling and
provider boilerplate.

### D10 — Card-name resolution: lazy via `@hdt/hearthdb` IPC, NOT batched on snapshot

**Context.** The panel needs `cardName` / `cost` / `rarity` for each
of the ~15 unique cards in the deck list. `@hdt/hearthdb` exposes
`cards.findById(cardId)` over IPC.

**Choice.** Renderer side: a small `useCardDef(cardId)` hook with a
local `Map<string, CardDef>` cache. First render kicks off an IPC
call per card; the result is cached for the rest of the match. NOT
batched into the deck-tracker IPC payload (keep concerns separated:
deck-tracker carries deck state, hearthdb carries card definitions).

**Rationale.** Card defs are static data; once cached, no further
IPC. The panel re-renders cheaply. Mixing them into the deck-tracker
payload would couple the two pipelines and bloat the IPC message.

## Risks / Trade-offs

- **R1 — "Remaining = original − seen" undercounts when cards are stolen
  by opponent or discarded by random effects** → M2 known limitation.
  Tagged in the panel as "(approx)" when the algorithm detects an
  inconsistency (sum of seen+remaining > original). M3 fixes via log
  events.
- **R2 — Deck-identification spike may fail (no usable Mono field)** →
  Mitigation: fallback to dialog-only flow. UX downgrade but feature
  still works.
- **R3 — Polling at 250ms misses fast-played cards** → Hearthstone
  animations make most card transitions visible >500ms anyway.
  Adaptive rate catches the common case; rare misses get corrected on
  the next tick (state is idempotent).
- **R4 — Stale `originalDeck` snapshot if user re-edits deck mid-game** →
  Hearthstone doesn't allow this in constructed (deck is locked at
  match start). Not a real risk for our scope.
- **R5 — IPC spam** → Tagged-union event stream (D8) ships full
  snapshot every poll. At 250ms × 5KB = 20 KB/s, well below any
  Electron IPC budget. Profile to confirm; backpressure unnecessary
  for M2.
- **R6 — Mulligan replace not detected** → When the user mulligans a
  card, it goes back to deck and gets replaced. Our `seen` set would
  briefly have the mulliganed card in HAND, then it disappears (back
  to DECK). The algorithm correctly excludes mulliganed cards
  (because they leave HAND back to DECK). Verified mentally; needs
  live test.
- **R7 — DeckSelectDialog UX friction in Practice mode** → Every
  Practice game requires dialog interaction. Mitigate: remember the
  last-selected deck per game-mode in localStorage; pre-select on
  open.

## Migration Plan

No migration needed — additions only. The main code change is in
`packages/hearthmirror/src/hearthmirror.ts` (TS facade schema sync),
which **is** breaking, but the only consumer is
`apps/desktop/src/main/ipc.ts` (also being updated in this change)
and `apps/desktop/src/renderer/tests/dashboard.test.tsx` (uses old
shape via mocks; updated in this change).

Rollback: revert the change. Reverts to today's "live bridge works,
no UI" state. `getDecks` etc. remain callable but renderer goes
back to mockDecks.

The new `@hdt/core` workspace package is purely additive; no other
package depends on it before this change.

## Open Questions

- **OQ1 — Exact Mono field name for "currently selected play deck"**.
  Spike in Section 2 of tasks. If `CollectionManager.m_lastSelectedDeck`
  doesn't exist, alternatives include
  `DeckPickerTrayDisplay.m_displayedDeck` (UI-side) or
  `Hearthstone.Network.PracticePickerScene.m_selectedDeck`.
- **OQ2 — Should Practice / Adventure modes show a tracker at all?**
  Their decks are pre-defined by Blizzard and not user-saved. Initial
  decision: show, but rely on dialog fallback (user picks "Practice"
  or "skip tracker"). Could refine in user testing.
- **OQ3 — Persist match history?** The state machine produces complete
  per-match data (which deck, who won, mulligan choices). M2 deliberately
  does NOT persist — that's a stats-engine concern out of scope.
  `packages/core` exposes the data; downstream changes can write to
  better-sqlite3 later.

(All flagged as "decide during implementation" or "defer to follow-up
change"; non-blocking for proposal acceptance.)

## Post-implementation refinements (Section 7 live validation)

Three architectural changes landed during the live PvE validation
(spike-0003 Run 12). All are documented here for future maintainers
who would otherwise expect the proposal/design as the source of
truth.

### D11 — DeckTracker poll caches `lastKnownSelectedDeckId` during IDLE / PRE_MATCH

`DeckPickerTrayDisplay.s_instance` (the source of `getSelectedDeckId`)
unloads as soon as the in-game scene transitions from Play menu to
gameplay. By the time the tracker enters PRE_MATCH or IN_MATCH —
which is the original D5 trigger point for `identifier.identify()` —
the reflector is already returning null.

**Fix.** Every IDLE / PRE_MATCH tick now also calls
`mirror.getSelectedDeckId()` and remembers the most recent non-null
`deckId` in a private `lastKnownSelectedDeckId: bigint | null` field.
At the IN_MATCH transition, `identifyDeck` first tries the cached id
against `getDecks()`; only falls through to the live identifier
(now also returning null) and the dialog if no match.

The cache resets on POST_MATCH → IDLE so a new match starts fresh.

### D12 — Drop `CallbackDeckIdentifier` from the orchestrator chain

The proposal D5 / spec wired the dialog flow as a "blocking
identifier": `ChainedDeckIdentifier(InGameDeckIdentifier,
CallbackDeckIdentifier)` where `CallbackDeckIdentifier` returned a
Promise that resolved when the user picked. This deadlocked: the
dialog couldn't show until the identifier returned (because
`needs-deck-selection` was emitted only AFTER `identifier.identify`
completed), but the identifier couldn't return until the user
clicked through the dialog.

**Fix.** Replaced with a non-blocking pattern:

1. `identifyDeck` only calls `InGameDeckIdentifier` (instant; null
   when the deck-picker scene is gone).
2. On null, immediately emits `needs-deck-selection` + caches the
   decks list in `tracker.cachedDecks`.
3. Dialog appears (driven by Zustand `pendingSelection` slice).
4. User picks → IPC `deck-tracker:select-deck` → main calls
   `tracker.selectDeckById(deckId)` (NEW public method) → looks up
   the deck in `cachedDecks` → falls through to a fresh
   `mirror.getDecks()` if cache miss → calls the existing
   `setOriginalDeck(...)` to mutate state + emit a snapshot.

`CallbackDeckIdentifier` remains in the public API for direct
consumers (a future CLI tool, etc.) but no longer wired into the
default DeckTracker chain.

### D13 — Embed `pendingDeckSelection` in `DeckTrackerSnapshot`

The proposal D8 wired `needs-deck-selection` as a one-shot event.
But Electron's lifecycle fires `app.whenReady` → `startDeckTracker()`
→ `createMainWindow()` in that order, and the renderer doesn't
subscribe to the IPC channel until React mounts `useDeckTracker()`
inside the loaded window. Result: the FIRST poll's
`needs-deck-selection` event broadcasts to `BrowserWindow.getAllWindows()`,
which returns an empty array → event is dropped.

**Fix.** Added `pendingDeckSelection: { decks } | null` to
`DeckTrackerSnapshot`. Populated by `buildSnapshot` whenever
`awaitingDeckSelection === true`. The renderer Zustand store now
derives its `pendingSelection` slice primarily from
`snapshot.pendingDeckSelection` (every-tick push, race-free) with
the one-shot `needs-deck-selection` event as a low-latency
supplement.

A complementary `dialogDismissed: boolean` slice in the renderer
store suppresses the dialog from re-opening on subsequent snapshot
ticks (because main keeps reporting `pendingDeckSelection !== null`
until `setOriginalDeck` or `cancelDeckSelection` runs, and we
don't want a flicker between dismissal and main-side clearing).
The flag resets when main eventually clears its pending state.

### Bonus build-system bits (not architectural, but required for runtime)

- `apps/desktop/package.json` adds `@hdt/hearthmirror-native` as a
  direct workspace dep so Electron's ESM resolver can find the
  externalized native binding at runtime.
- `apps/desktop/electron.vite.config.ts` adds `@hdt/core` to
  `WORKSPACE_INLINE` + the per-process resolve aliases, and marks
  `@hdt/hearthmirror-native` external in main + preload
  `rollupOptions` so the .node binary lookup uses node's native
  require resolution rather than getting bundled (which would
  break the relative `.node` file lookup).

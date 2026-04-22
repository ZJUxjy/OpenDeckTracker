## Why

We just shipped `add-hearthmirror-decks-and-in-match-readers` (R-17 + Phase
5/7) — 19 NAPI reflectors return live data with **0 ERR / 14 OK** during
an active match. But that's only the bottom of the stack: the live-bridge
exposes raw observability primitives, not the **deck-tracker product
feature** the user actually wants ("进入对局后看到自己牌库里剩什么牌").

The gap between "we can read board/hand/deck zones from memory" and
"the user sees a live deck panel that updates as they draw" is:

- A TS facade out of sync with the new Rust schemas (typecheck broken,
  7 new methods unexposed, stale `.node` binary).
- An empty `packages/core` (no `Game` / `Player` / `Entity` state machine).
- An empty `packages/hearthwatcher` (no log parsing — but M2 doesn't
  need this yet; deferred to a later change).
- A renderer Dashboard that still consumes `mockDecks.ts` rather than
  any live bridge.

Closing this gap with a **memory-only MVP** (decision in
`docs/explorations/...` Q&A — path A condensed into one shippable
milestone, M2 of the explored 4-milestone plan) is the smallest unit of
work that ships **a real deck-tracker** the user can use end-to-end:
choose a deck in-game, queue, and watch the renderer show 30 cards
shrinking as they're drawn / played / discarded.

## What Changes

### Prerequisite (M1 — baseline fix, captured as Section 1 of tasks)

- **REBUILD** `packages/hearthmirror/native/hearthmirror-native.win32-x64-msvc.node`
  via `napi build --release` so the JS layer sees the new methods (decks
  schema, getEditedDeck, isMulligan, getBoardState, getHandState,
  getDeckState, getOpponentSecrets, getChoices) plus the modified
  `getGameType` / `getMatchInfo` / `getServerInfo` shapes.
- **MODIFY** `packages/hearthmirror/src/hearthmirror.ts` (TS facade)
  to mirror the new Rust schema: drop dead fields
  (`accountIdHi/Lo`, `battleTagFull`, `dbfId`, `resumable`), add new
  fields (`streak`, `bestStarLevel`, `cardId` (string), `seasonId`,
  `cardbackId`, `createDateMicrosec`, in-match struct types), and
  expose 7 new methods.
- **MODIFY** `apps/desktop/src/{main/ipc.ts, preload/index.ts}` to
  forward the 7 new methods + the renamed shapes to the renderer.

### New (M2 — deck tracker MVP)

- **NEW** `packages/core` workspace package: empty today, scaffolded
  with TS strict + vitest. Houses the domain state machine.
- **NEW** `Game` / `Player` / `Entity` / `DeckSnapshot` / `MatchPhase`
  TS classes in `packages/core/src/game/` modelling the per-match
  state we care about for M2. NOT a full HDT port — just enough for
  "did the player draw / play / discard a known card from their
  starting deck".
- **NEW** `DeckTracker` orchestrator in `packages/core/src/tracker/`:
  - Polls `hearthmirror` at 2s (idle) / 250-500ms (in-match).
  - Detects match start / end / phase transitions
    (`getMatchInfo`, `isGameOver`, `isMulligan`).
  - Identifies the active deck by reading `getDecks` + a new
    `DeckPickerWatcher`-style pull from a memory field (or, if
    unavailable for the current mode, prompts the user via fallback
    `selectDeck(deckId)` API).
  - Maintains a per-match `DeckSnapshot`:
    `originalCards: { cardId → count }`, `seenCards: { cardId → count }`
    (cards that have left DECK zone, derived from `getHandState` +
    `getBoardState` + Hearthstone GRAVE zone reads), and `remainingCards`
    (the displayed list).
  - Emits typed events on each tick (`onDeckChanged`, `onMatchStarted`,
    `onMatchEnded`).
- **NEW** Memory-only "remaining" algorithm (simplified subset of
  HDT's `Player.GetDeckState`):
  - `remaining = originalDeck (multiset) - seenInHandOrPlay (multiset)`.
  - Created/Stolen cards are tolerated as best-effort: they show up
    as "extra" cards in `seenCards` that don't subtract from
    `originalDeck` (we surface but don't filter — mismatch is logged,
    not crashed).
  - Cards in DECK zone whose `cardId` is non-empty (rare — usually
    Discover offers we revealed) are NOT used as the "remaining"
    source; we always derive remaining from the original-minus-seen
    formula.
- **NEW** Electron main-process tracker host (`apps/desktop/src/main/
  deck-tracker.ts`): instantiates the core `DeckTracker` per HDT
  session, forwards events to the renderer over IPC channels
  (`deck-tracker:state`, `deck-tracker:match-event`).
- **NEW** Renderer Zustand store (`apps/desktop/src/renderer/src/
  stores/deck-tracker-store.ts`) projecting the IPC events into React
  state.
- **NEW** Renderer "live deck panel" component
  (`apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`): a
  30-row vertical list (one per unique card in the original deck),
  each row showing `card name / cost / remaining count / total count`,
  with rows fading when count hits 0 and highlighting the most
  recently-drawn card. Powered by `@hdt/hearthdb` for card name /
  cost / rarity lookups.
- **NEW** `Dashboard` integration: when the user is in an active
  match, a "Live Deck" panel replaces the existing mock-deck card
  on the dashboard.
- **NEW** Fallback "select deck" dialog when DeckPickerWatcher can't
  determine the active deck (Practice / Tavern Brawl / no-decks-saved
  scenarios) — single Radix dialog, lists `getDecks` results, the user
  picks one for this match.

### Out of scope (deferred to follow-up changes)

- **Power.log parsing / event stream** — deferred to M3
  (`add-deck-tracker-log-stream`). M2 polls memory only; that's
  enough for "see what's left in deck" but loses event-level fidelity
  for created / stolen / dredged cards.
- **Opponent deck inference** — deferred to M4
  (`add-deck-tracker-opponent-side`).
- **Transparent overlay window** — deferred to M4. M2 lives in the
  main Electron Dashboard window only.
- **Sideboard / Zilliax 3000 cosmetic resolution** — deferred. M2
  shows them as plain cards.
- **Battlegrounds / Mercenaries / Arena** — explicit non-goals per
  user direction "构筑模式就行了，先不用管战棋模式".

## Capabilities

### New Capabilities

- `deck-tracker-core`: per-match deck state machine, memory-poll
  orchestrator, "remaining cards" algorithm, match-phase detection,
  fallback-select-deck flow, IPC protocol, renderer Zustand store,
  React panel component. All M2 deliverables roll up here.

### Modified Capabilities

None at the spec level. The M1 baseline-fix work (TS facade /
preload / IPC handlers / `.node` rebuild) is plumbing — it doesn't
change the existing `hearthmirror-class-resolution` /
`hearthmirror-mono-probe` requirements, just realigns the TS layer
to the latest reflector schemas. Captured under tasks Section 1
without a spec delta.

> Note: `hearthmirror-service-locator` and
> `hearthmirror-reflection-runtime` from the in-flight changes
> (`add-hearthmirror-service-locator`,
> `add-hearthmirror-decks-and-in-match-readers`) are NOT yet archived.
> This change consumes their already-merged code only; archival of
> those proceeds on its own track.

## Impact

### Code

- **NEW** `packages/core/` (full new workspace package):
  - `package.json`, `tsconfig.json`, `vitest.config.ts`
  - `src/game/{game.ts, player.ts, entity.ts, deck-snapshot.ts,
    match-phase.ts, types.ts}` — domain state machine.
  - `src/tracker/{deck-tracker.ts, polling-loop.ts,
    deck-identifier.ts, remaining-algorithm.ts}` — orchestrator.
  - `src/index.ts` — public API.
  - `src/**/*.test.ts` — unit tests for the algorithm + state machine.
- **MODIFIED** `packages/hearthmirror/src/{hearthmirror.ts, types.ts}` —
  schema realignment + 7 new methods.
- **REBUILT** `packages/hearthmirror/native/*.node` — new x64 binary
  with all reflectors.
- **MODIFIED** `apps/desktop/src/main/{ipc.ts, hearthmirror.ts,
  deck-tracker.ts (NEW)}` — IPC handlers + tracker host.
- **MODIFIED** `apps/desktop/src/preload/index.ts` — exposed new
  shapes + `deck-tracker:*` channels.
- **NEW** `apps/desktop/src/renderer/src/stores/deck-tracker-store.ts`.
- **NEW** `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`,
  `apps/desktop/src/renderer/src/components/DeckSelectDialog.tsx`,
  `apps/desktop/src/renderer/src/hooks/use-deck-tracker.ts`.
- **MODIFIED** `apps/desktop/src/renderer/src/components/Dashboard.tsx`
  to swap in LiveDeckPanel during active matches.

### APIs

- 1 new TS workspace package `@hdt/core` for cross-process consumers.
- 2 new IPC channels: `deck-tracker:state` (renderer → main pull),
  `deck-tracker:event` (main → renderer push).
- TS facade `HearthMirror` schema breaking-changes: `getMatchInfo`,
  `getMedalInfo`, `getDecks`, `getServerInfo`, `getGameType`. Old
  shapes were never consumed in production (renderer used mockDecks)
  so blast radius is internal-only.

### Dependencies

- No new runtime deps. `zustand` is already in the renderer's
  workspace, so the new store doesn't add anything.
- `@hdt/core` workspace dep added to `apps/desktop`.

### Docs

- `DEVELOPMENT_PLAN.md` Phase 4 milestone gets a checkmark for
  "Deck Tracker MVP — memory polling".
- `docs/spikes/0003-...md` gains a brief "Run 12 — deck tracker
  end-to-end" section once M2 is live-validated against an actual match.

### Risk

- **Medium**: the "remaining = original − seen" algorithm is correct
  for most-of-the-time gameplay (drawing your own deck), but loses
  precision when the opponent steals cards (Steal Spell, Burgle), when
  the player creates cards in deck (Renowned Performer, Yogg), or
  during a Discover-replace-in-deck. Documented as known limitations
  in M2; M3 (log stream) addresses these.
- **Low**: Polling cost. 250ms in-match × 5-7 reflector calls × ~50ms
  per IPC round-trip = comfortably under 50% of one CPU core. Profiled
  against current reflector latencies (most are <1ms, getCollection is
  the only slow one at ~6s — we exclude it from in-match polling).
- **Low**: Deck-picker auto-detection. The dialog fallback covers any
  mode where the in-game `SelectedDeck` field is null or unreadable.

## Non-goals

- **Not** writing log-parsing infrastructure. M3 will handle that.
- **Not** designing a transparent overlay window. M4 will handle that.
- **Not** opponent-side tracking. M4 will handle that.
- **Not** changing the canonical state-machine model in a way that
  precludes log-driven event ingestion later. The `Game` /
  `Player` / `Entity` classes designed in M2 SHALL be the same
  classes M3 will feed events into — the only thing that changes
  in M3 is the data source (events vs polled snapshots).
- **Not** importing HDT's full 60+ event handler set. M2 only models
  the 4-5 zone transitions needed for "remaining cards in deck".
- **Not** reactive UI animations beyond a simple "newly drawn" CSS
  highlight. Polish goes in M4.

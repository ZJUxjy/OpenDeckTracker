# macOS Deck Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On macOS (no memory mirror), make the deck tracker recognize the player's deck and track remaining cards + opponent reveals, driven by the Power.log plus a user-selected "current deck".

**Architecture:** A "mirror-absent mode" adds four log-driven bridges over the existing tracker, each used only as a fallback when the corresponding mirror signal is null (so Windows is unchanged): (1) derive the phase-machine signals from Power.log; (2) persist a user-chosen current deck and apply it as `originalDeck` at match start; (3) resolve the local player's `controllerId` from the log; (4) show observed-leaving cards when no deck is set. Reuses the phase machine, remaining engine, `DeckStore`, and deckstring import unchanged.

**Tech Stack:** TypeScript, Electron, vitest, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-06-17-macos-deck-recognition-design.md`
**Branch:** `feat/macos-deck-recognition` (already created).

**Test prerequisite:** `esbuild@0.21.5` in the repo `node_modules` is corrupted (reports `0.27.7`), so vitest won't start without it. Run TS tests with:
```
export ESBUILD_BINARY_PATH="/Users/xu/Code/js/OpenDeckTracker/.worktrees/feat-card-image-bulk-download/node_modules/.pnpm/@esbuild+darwin-arm64@0.21.5/node_modules/@esbuild/darwin-arm64/bin/esbuild"
```
Prefix every `pnpm --filter … test` command with this export. (Or repair the install.)

**Invariant for every task:** mirror signals win; log-derived values are used only when the mirror value is null/absent. Never change the Windows path.

---

## File Structure

**Core (`packages/core/src/tracker/`)**
- `phase-signals.ts` (new) — pure `LogPhaseSignals` type + `resolvePhaseSignals(mirror, log)` merge.
- `local-player-resolver.ts` (new) — pure resolver: local `controllerId` from HAND entities with known cardId.
- `deck-tracker.ts` (modify) — accept injected `logPhaseSignals` provider; use `resolvePhaseSignals` in `tick()`; add public `applyLocalControllerId`; no-deck remaining fallback.

**Desktop host (`apps/desktop/src/main/`)**
- `log-match-state.ts` (new) — pure `reduceLogMatchState(state, event, eventPhase)`.
- `deck-tracker.ts` (modify) — maintain `logMatchState` + the local-player resolver from the event stream; pass `logPhaseSignals` to the tracker; apply active deck on `match-started`.
- `deck-store.ts` (modify) — `getActiveDeckId` / `setActiveDeckId` persistence.
- `deck-ipc.ts` (modify) — `decks:get-active` / `decks:set-active` handlers.

**Preload + renderer**
- `apps/desktop/src/preload/index.ts` (modify) — expose `decks.getActive` / `decks.setActive`.
- `apps/desktop/src/renderer/src/components/SavedDecksTab.tsx` (modify) — "Set as current deck" action + active indicator.

---

## Phase A — Bridge 1: log-driven phase (the blocker)

### Task 1: Core — merge log signals into the phase machine

**Files:**
- Create: `packages/core/src/tracker/phase-signals.ts`
- Create: `packages/core/src/tracker/phase-signals.test.ts`
- Modify: `packages/core/src/tracker/deck-tracker.ts` (constructor deps; `tick()` ~803-808)

- [ ] **Step 1: Write the failing test** — `packages/core/src/tracker/phase-signals.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { resolvePhaseSignals } from './phase-signals';

const noLog = { matchActive: false, inPlay: false, gameOver: false };

describe('resolvePhaseSignals', () => {
  it('uses mirror signals when present (Windows path)', () => {
    const r = resolvePhaseSignals(
      { hasMatchInfo: true, hasDeckState: true, isGameOver: false, isSpectating: false },
      noLog,
    );
    expect(r).toEqual({ hasMatchInfo: true, hasDeckState: true, isGameOver: false, isSpectating: false });
  });

  it('fills from log signals when mirror is absent (mac path)', () => {
    const r = resolvePhaseSignals(
      { hasMatchInfo: false, hasDeckState: false, isGameOver: false, isSpectating: false },
      { matchActive: true, inPlay: true, gameOver: false },
    );
    expect(r.hasMatchInfo).toBe(true);
    expect(r.hasDeckState).toBe(true);
  });

  it('log.gameOver ORs into isGameOver', () => {
    const r = resolvePhaseSignals(
      { hasMatchInfo: false, hasDeckState: false, isGameOver: false, isSpectating: false },
      { matchActive: false, inPlay: false, gameOver: true },
    );
    expect(r.isGameOver).toBe(true);
  });

  it('never lets log downgrade a true mirror signal', () => {
    const r = resolvePhaseSignals(
      { hasMatchInfo: true, hasDeckState: true, isGameOver: false, isSpectating: false },
      { matchActive: false, inPlay: false, gameOver: false },
    );
    expect(r.hasMatchInfo).toBe(true);
    expect(r.hasDeckState).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/core test -- phase-signals`
Expected: FAIL — cannot find `./phase-signals`.

- [ ] **Step 3: Implement `packages/core/src/tracker/phase-signals.ts`**

```ts
import type { PhaseSignals } from './phase-machine';

/** Log-derived phase signals, supplied by the host in mirror-absent mode. */
export interface LogPhaseSignals {
  /** A real match is in progress (Power.log STEP reached a real-match value). */
  matchActive: boolean;
  /** Gameplay/cards dealt (mulligan reached). */
  inPlay: boolean;
  /** Game has completed (STATE=COMPLETE / FINAL_GAMEOVER). */
  gameOver: boolean;
}

export interface MirrorPhaseSignals {
  hasMatchInfo: boolean;
  hasDeckState: boolean;
  isGameOver: boolean;
  isSpectating: boolean;
}

/**
 * Merge mirror + log signals into the phase machine's inputs.
 * Mirror wins; log only fills falsy mirror values. This keeps Windows
 * (mirror authoritative) unchanged while letting macOS drive phase from logs.
 */
export function resolvePhaseSignals(
  mirror: MirrorPhaseSignals,
  log: LogPhaseSignals,
): PhaseSignals {
  return {
    hasMatchInfo: mirror.hasMatchInfo || log.matchActive,
    hasDeckState: mirror.hasDeckState || log.inPlay,
    isGameOver: mirror.isGameOver || log.gameOver,
    isSpectating: mirror.isSpectating,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/core test -- phase-signals` → PASS (4 tests).

- [ ] **Step 5: Wire into the tracker constructor + `tick()`**

In `packages/core/src/tracker/deck-tracker.ts`:

(a) Add to the constructor options interface (next to the existing `mirror` dep) and store it:
```ts
  // in the DeckTrackerOptions interface:
  logPhaseSignals?: () => LogPhaseSignals;
```
```ts
  // field + constructor assignment (default = all-false → Windows unchanged):
  private readonly logPhaseSignals: () => LogPhaseSignals;
  // in constructor body:
  this.logPhaseSignals = options.logPhaseSignals ?? (() => ({ matchActive: false, inPlay: false, gameOver: false }));
```
Add imports:
```ts
import { resolvePhaseSignals, type LogPhaseSignals } from './phase-signals';
```

(b) Replace the `nextPhase(...)` signal block in `tick()` (currently lines ~803-808):
```ts
    const target = nextPhase(previousPhase, resolvePhaseSignals(
      {
        hasMatchInfo: matchInfo !== null,
        hasDeckState: deckState !== null,
        isGameOver: isGameOverFlag,
        isSpectating,
      },
      this.logPhaseSignals(),
    ));
```

- [ ] **Step 6: Typecheck + core tests**

`pnpm --filter @hdt/core typecheck` → clean.
`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/core test` → all green (existing + new).

- [ ] **Step 7: Commit**
```bash
git add packages/core/src/tracker/phase-signals.ts packages/core/src/tracker/phase-signals.test.ts packages/core/src/tracker/deck-tracker.ts
git commit -m "feat(core): merge log-derived signals into the phase machine"
```

### Task 2: Host — maintain log match-state and feed the provider

**Files:**
- Create: `apps/desktop/src/main/log-match-state.ts`
- Create: `apps/desktop/src/main/log-match-state.test.ts`
- Modify: `apps/desktop/src/main/deck-tracker.ts` (`forwardPowerEventToDeckTracker` ~600-646; `startDeckTracker` ~462-472)

- [ ] **Step 1: Write the failing test** — `apps/desktop/src/main/log-match-state.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { reduceLogMatchState, initialLogMatchState } from './log-match-state';
import type { PowerEvent } from '@hdt/hearthwatcher';

const createGame: PowerEvent = { type: 'create-game', raw: '', content: '' };
const step = (value: string): PowerEvent => ({
  type: 'tag-change', raw: '', content: '', entity: 'GameEntity', tag: 'STEP', value,
});
const state = (value: string): PowerEvent => ({
  type: 'tag-change', raw: '', content: '', entity: 'GameEntity', tag: 'STATE', value,
});

describe('reduceLogMatchState', () => {
  it('create-game resets to inactive', () => {
    const s = reduceLogMatchState({ matchActive: true, inPlay: true, gameOver: true }, createGame, 'live');
    expect(s).toEqual({ matchActive: false, inPlay: false, gameOver: false });
  });

  it('real-match STEP activates match + inPlay', () => {
    const s = reduceLogMatchState(initialLogMatchState(), step('BEGIN_MULLIGAN'), 'live');
    expect(s.matchActive).toBe(true);
    expect(s.inPlay).toBe(true);
  });

  it('ignores STEP on replay events', () => {
    const s = reduceLogMatchState(initialLogMatchState(), step('BEGIN_MULLIGAN'), 'replay');
    expect(s.matchActive).toBe(false);
  });

  it('STATE=COMPLETE ends the match', () => {
    let s = reduceLogMatchState(initialLogMatchState(), step('MAIN_READY'), 'live');
    s = reduceLogMatchState(s, state('COMPLETE'), 'live');
    expect(s).toEqual({ matchActive: false, inPlay: false, gameOver: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/desktop test -- log-match-state` → FAIL (module missing).

- [ ] **Step 3: Implement `apps/desktop/src/main/log-match-state.ts`**

```ts
import type { PowerEvent } from '@hdt/hearthwatcher';
import type { LogPhaseSignals } from '@hdt/core';
import { isRealMatchStepValue } from './deck-tracker';

export type LogMatchState = LogPhaseSignals;

export function initialLogMatchState(): LogMatchState {
  return { matchActive: false, inPlay: false, gameOver: false };
}

function isGameComplete(event: PowerEvent): boolean {
  return (
    event.type === 'tag-change' &&
    event.entity === 'GameEntity' &&
    ((event.tag === 'STATE' && event.value === 'COMPLETE') ||
      (event.tag === 'STEP' && event.value === 'FINAL_GAMEOVER'))
  );
}

/**
 * Pure reducer for the Power.log-derived match phase signals (mac/mirror-absent
 * mode). `create-game` resets; a real-match STEP marks the match active +
 * in-play; game-complete ends it. Replay events never flip the gate (mirrors
 * the existing overlay STEP-gate discipline).
 */
export function reduceLogMatchState(
  state: LogMatchState,
  event: PowerEvent,
  eventPhase: 'live' | 'replay',
): LogMatchState {
  if (event.type === 'create-game') {
    return initialLogMatchState();
  }
  if (eventPhase === 'live' && isGameComplete(event)) {
    return { matchActive: false, inPlay: false, gameOver: true };
  }
  if (
    eventPhase === 'live' &&
    event.type === 'tag-change' &&
    event.entity === 'GameEntity' &&
    event.tag === 'STEP' &&
    isRealMatchStepValue(event.value)
  ) {
    return { matchActive: true, inPlay: true, gameOver: false };
  }
  return state;
}
```
> Note: `isRealMatchStepValue` is already exported from `apps/desktop/src/main/deck-tracker.ts` (used for the overlay gate). If it is not `export`ed yet, add `export` to its declaration (no behavior change).
> Note: `EventPhase` in the host is the `'live' | 'replay'` type; if it's imported from `@hdt/hearthwatcher`, use that type instead of the inline union for parity.

- [ ] **Step 4: Run to verify it passes**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/desktop test -- log-match-state` → PASS (4 tests).

- [ ] **Step 5: Maintain state in the host + pass the provider**

In `apps/desktop/src/main/deck-tracker.ts`:

(a) Module-level state + import:
```ts
import { reduceLogMatchState, initialLogMatchState, type LogMatchState } from './log-match-state';

let logMatchState: LogMatchState = initialLogMatchState();
```

(b) In `forwardPowerEventToDeckTracker`, near the top (after the `create-game` reset block, before `pushPowerEvent`), update it for both phases:
```ts
  logMatchState = reduceLogMatchState(logMatchState, event, phase);
```

(c) In `startDeckTracker` (where `new DeckTracker({ mirror, … })` is constructed ~465), add the provider:
```ts
    logPhaseSignals: () => logMatchState,
```

(d) Reset on teardown if there's a stop/dispose path: set `logMatchState = initialLogMatchState()` where the tracker is torn down (search for where `tracker = null`).

- [ ] **Step 6: Typecheck**

`pnpm --filter @hdt/desktop typecheck` → no new errors (pre-existing `Settings.tsx` error allowed).

- [ ] **Step 7: Commit**
```bash
git add apps/desktop/src/main/log-match-state.ts apps/desktop/src/main/log-match-state.test.ts apps/desktop/src/main/deck-tracker.ts
git commit -m "feat(desktop): derive phase signals from Power.log for mirror-absent mode"
```

---

## Phase B — Bridge 3: local player identity from logs

### Task 3: Core — pure `LocalPlayerResolver`

**Files:**
- Create: `packages/core/src/tracker/local-player-resolver.ts`
- Create: `packages/core/src/tracker/local-player-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createLocalPlayerResolver } from './local-player-resolver';

describe('LocalPlayerResolver', () => {
  it('resolves the controller whose HAND entity has a known cardId', () => {
    const r = createLocalPlayerResolver();
    r.observe([
      { zone: 'HAND', controllerId: 2, cardId: '' },        // opponent hand (hidden)
      { zone: 'HAND', controllerId: 1, cardId: 'CS2_062' }, // my hand (known)
    ]);
    expect(r.localControllerId).toBe(1);
  });

  it('stays null until a known HAND card is seen', () => {
    const r = createLocalPlayerResolver();
    r.observe([{ zone: 'HAND', controllerId: 2, cardId: '' }]);
    expect(r.localControllerId).toBeNull();
  });

  it('ignores non-HAND zones for resolution', () => {
    const r = createLocalPlayerResolver();
    r.observe([{ zone: 'PLAY', controllerId: 1, cardId: 'CS2_062' }]);
    expect(r.localControllerId).toBeNull();
  });

  it('reset() clears resolution', () => {
    const r = createLocalPlayerResolver();
    r.observe([{ zone: 'HAND', controllerId: 1, cardId: 'CS2_062' }]);
    r.reset();
    expect(r.localControllerId).toBeNull();
  });

  it('keeps the first resolved controller (does not flip)', () => {
    const r = createLocalPlayerResolver();
    r.observe([{ zone: 'HAND', controllerId: 1, cardId: 'CS2_062' }]);
    r.observe([{ zone: 'HAND', controllerId: 2, cardId: 'CS2_063' }]); // opponent card later revealed
    expect(r.localControllerId).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/core test -- local-player-resolver` → FAIL.

- [ ] **Step 3: Implement `packages/core/src/tracker/local-player-resolver.ts`**

```ts
export interface ZoneEntityObservation {
  zone: 'HAND' | 'PLAY' | 'DECK' | 'SECRET' | string;
  controllerId: number;
  cardId: string;
}

export interface LocalPlayerResolver {
  readonly localControllerId: number | null;
  observe(updates: readonly ZoneEntityObservation[]): void;
  reset(): void;
}

/**
 * Resolve the local player's controllerId from the Power.log when no memory
 * mirror is available. The client logs the *local* player's own card ids; the
 * opponent's HAND/DECK cards are logged with an empty cardId. So the first
 * controller observed with a known cardId in HAND is the local player.
 * Resolves once per game; reset on `create-game`.
 */
export function createLocalPlayerResolver(): LocalPlayerResolver {
  let resolved: number | null = null;
  return {
    get localControllerId(): number | null {
      return resolved;
    },
    observe(updates): void {
      if (resolved !== null) return;
      for (const u of updates) {
        if (u.zone === 'HAND' && u.cardId.length > 0) {
          resolved = u.controllerId;
          return;
        }
      }
    },
    reset(): void {
      resolved = null;
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/core test -- local-player-resolver` → PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add packages/core/src/tracker/local-player-resolver.ts packages/core/src/tracker/local-player-resolver.test.ts
git commit -m "feat(core): log-only local player resolver"
```

### Task 4: Core + host — apply the resolved local controllerId

**Files:**
- Modify: `packages/core/src/tracker/deck-tracker.ts` (add `applyLocalControllerId`; reuse the identity logic from `applyMatchInfo` ~999)
- Modify: `apps/desktop/src/main/deck-tracker.ts` (feed the resolver + call when mirror-absent)
- Test: `packages/core/src/tracker/deck-tracker.local-controller.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { DeckTracker } from './deck-tracker';
import { createStubMirror } from './test-helpers'; // if none exists, inline a stub returning nulls

describe('applyLocalControllerId (mirror-absent identity)', () => {
  it('sets local + opposing controllerIds from a log-resolved id', () => {
    const tracker = new DeckTracker({ mirror: createStubMirror() });
    tracker.applyLocalControllerId(2);
    const g = tracker.getGame();
    expect(g.localPlayer.controllerId).toBe(2);
    expect(g.opposingPlayer.controllerId).toBe(1);
  });

  it('is idempotent (no Player object churn when unchanged)', () => {
    const tracker = new DeckTracker({ mirror: createStubMirror() });
    tracker.applyLocalControllerId(1);
    const before = tracker.getGame().localPlayer;
    tracker.applyLocalControllerId(1);
    expect(tracker.getGame().localPlayer).toBe(before);
  });
});
```
> If `createStubMirror`/`getGame` don't exist, use the existing test utilities (other deck-tracker tests in this folder construct a tracker — copy their mirror stub; `getGame()` is referenced in `deck-tracker.global-effects.test.ts:38`).

- [ ] **Step 2: Run to verify it fails**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/core test -- deck-tracker.local-controller` → FAIL.

- [ ] **Step 3: Implement `applyLocalControllerId` in `deck-tracker.ts`**

Add a public method that reuses the same controller-reconciliation `applyMatchInfo` uses (local id + derive opposing as the other of {1,2}, with the idempotency guard). Place it next to `applyMatchInfo`:
```ts
  /**
   * Mirror-absent identity: set the local player's controllerId from a
   * log-resolved value (see LocalPlayerResolver). Mirrors applyMatchInfo's
   * controller reconciliation + idempotency, without needing MatchInfo.
   */
  applyLocalControllerId(localControllerId: number): void {
    const opposingControllerId = localControllerId === 1 ? 2 : 1;
    if (
      this.game.localPlayer.controllerId === localControllerId &&
      this.game.opposingPlayer.controllerId === opposingControllerId
    ) {
      return; // idempotent — preserve Player objects (originalDeck/bindings)
    }
    this.game.setControllerIds(localControllerId, opposingControllerId);
  }
```
> Use the SAME mutation the idempotent branch of `applyMatchInfo` uses to set both controllerIds. If `applyMatchInfo` sets them by constructing Players / a helper, call that exact helper here (read lines ~999-1055 and reuse it — do not invent a new `setControllerIds` if a different setter already exists; name it to match).

- [ ] **Step 4: Run to verify it passes**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/core test -- deck-tracker.local-controller` → PASS.

- [ ] **Step 5: Feed the resolver from the host**

In `apps/desktop/src/main/deck-tracker.ts`:
```ts
import { createLocalPlayerResolver } from '@hdt/core';

const localPlayerResolver = createLocalPlayerResolver();
```
In `forwardPowerEventToDeckTracker`:
- On `create-game`: `localPlayerResolver.reset();`
- After computing `logUpdates` (the existing `const logUpdates = logUpdatesFromPowerEvent(event)`), feed them and apply when resolved and the mirror is absent:
```ts
  if (logUpdates.length > 0) {
    tracker?.applyLogDerivedEntityUpdates(logUpdates);
    localPlayerResolver.observe(
      logUpdates.map((u) => ({ zone: u.zone, controllerId: u.controllerId, cardId: u.cardId })),
    );
    const localId = localPlayerResolver.localControllerId;
    if (localId !== null && mirrorAbsent()) {
      tracker?.applyLocalControllerId(localId);
    }
  }
```
- `mirrorAbsent()`: a small helper — on darwin the facade window provider proves the mirror is stubbed; the simplest robust check is `process.platform === 'darwin'` (the mirror is Windows-only). Define:
```ts
function mirrorAbsent(): boolean {
  return process.platform === 'darwin';
}
```
> Confirm `logUpdatesFromPowerEvent` entries expose `zone`, `controllerId`, `cardId` (deck-tracker.ts:1063 shows these fields). If a field name differs, map accordingly.

- [ ] **Step 6: Typecheck + tests**

`pnpm --filter @hdt/core typecheck && pnpm --filter @hdt/desktop typecheck` → clean.
`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/core test` → green.

- [ ] **Step 7: Commit**
```bash
git add packages/core/src/tracker/deck-tracker.ts packages/core/src/tracker/deck-tracker.local-controller.test.ts apps/desktop/src/main/deck-tracker.ts
git commit -m "feat: seed local player controllerId from Power.log when mirror absent"
```

---

## Phase C — Bridge 2: active-deck persistence + apply

### Task 5: DeckStore — active-deck persistence

**Files:**
- Modify: `apps/desktop/src/main/deck-store.ts` (schema + interface + impl)
- Test: `apps/desktop/src/main/deck-store.active-deck.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createDeckStore } from './deck-store';

describe('DeckStore active deck', () => {
  it('returns null before any active deck is set', () => {
    const store = createDeckStore(':memory:');
    expect(store.getActiveDeckId()).toBeNull();
  });

  it('persists the active deck id', () => {
    const store = createDeckStore(':memory:');
    store.setActiveDeckId('deck-123');
    expect(store.getActiveDeckId()).toBe('deck-123');
  });

  it('clears the active deck id with null', () => {
    const store = createDeckStore(':memory:');
    store.setActiveDeckId('deck-123');
    store.setActiveDeckId(null);
    expect(store.getActiveDeckId()).toBeNull();
  });
});
```
> If `createDeckStore(':memory:')` fails (it `mkdirSync`s a dir for file paths), use a temp file path via `node:os` `tmpdir()` + a unique name from `node:crypto` randomUUID instead of `':memory:'`. Match how existing deck-store tests construct the store.

- [ ] **Step 2: Run to verify it fails**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/desktop test -- deck-store.active-deck` → FAIL (no `getActiveDeckId`).

- [ ] **Step 3: Implement in `deck-store.ts`**

(a) In `initializeSchema(db)`, add a key/value meta table:
```ts
  db.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
```
(b) Add to the `DeckStore` interface:
```ts
  getActiveDeckId(): string | null;
  setActiveDeckId(id: string | null): void;
```
(c) Implement inside `createDeckStore` and include in the returned object:
```ts
  function getActiveDeckId(): string | null {
    const row = db.prepare<[string]>(`SELECT value FROM app_meta WHERE key = ?`).get('activeDeckId') as
      | { value: string } | undefined;
    return row ? row.value : null;
  }
  function setActiveDeckId(id: string | null): void {
    if (id === null) {
      db.prepare<[string]>(`DELETE FROM app_meta WHERE key = ?`).run('activeDeckId');
      return;
    }
    db.prepare<[string, string]>(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run('activeDeckId', id);
  }
```
Add `getActiveDeckId, setActiveDeckId` to the `return { … }` object of `createDeckStore`.

- [ ] **Step 4: Run to verify it passes**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/desktop test -- deck-store.active-deck` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/desktop/src/main/deck-store.ts apps/desktop/src/main/deck-store.active-deck.test.ts
git commit -m "feat(desktop): persist active deck id in DeckStore"
```

### Task 6: IPC + preload — get/set active deck

**Files:**
- Modify: `apps/desktop/src/main/deck-ipc.ts` (channels + handlers)
- Modify: `apps/desktop/src/preload/index.ts` (expose on `decks`)

- [ ] **Step 1: Add channels + handlers** in `deck-ipc.ts`

In the `CHANNELS` map:
```ts
  getActive: 'decks:get-active',
  setActive: 'decks:set-active',
```
In `registerDeckIpc` (where other `ipcMain.handle` calls live):
```ts
  ipcMain.handle(CHANNELS.getActive, (): string | null => store.getActiveDeckId());
  ipcMain.handle(CHANNELS.setActive, (_e, id: string | null): void => store.setActiveDeckId(id));
```
And add the two channels to the teardown `removeHandler` loop if one exists.

- [ ] **Step 2: Expose in preload** `apps/desktop/src/preload/index.ts`

In the `decks` object (next to `importDeckstring` ~231):
```ts
    getActive: (): Promise<string | null> => ipcRenderer.invoke('decks:get-active'),
    setActive: (id: string | null): Promise<void> => ipcRenderer.invoke('decks:set-active', id),
```
Add matching types to the preload's `decks` type/`window.hdt` typing (mirror how `importDeckstring` is typed).

- [ ] **Step 3: Typecheck**

`pnpm --filter @hdt/desktop typecheck` → no new errors.

- [ ] **Step 4: Commit**
```bash
git add apps/desktop/src/main/deck-ipc.ts apps/desktop/src/preload/index.ts
git commit -m "feat(desktop): IPC to get/set the active deck"
```

### Task 7: Host — apply the active deck at match start

**Files:**
- Create: `apps/desktop/src/main/apply-active-deck.ts`
- Create: `apps/desktop/src/main/apply-active-deck.test.ts`
- Modify: `apps/desktop/src/main/deck-tracker.ts` (`startDeckTracker` — subscribe to `match-started`)

- [ ] **Step 1: Write the failing test** — pure applier with injected deps

```ts
import { describe, expect, it, vi } from 'vitest';
import { applyActiveDeck } from './apply-active-deck';

const deck = {
  id: 'deck-1', name: 'Test', version: 3,
  cards: [{ cardId: 'CS2_062', count: 2 }, { cardId: 'CS2_063', count: 1 }],
};

describe('applyActiveDeck', () => {
  it('sets originalDeck + saved-deck attribution when an active deck is configured', () => {
    const tracker = { setOriginalDeck: vi.fn(), selectSavedDeck: vi.fn(),
      getLocalOriginalDeck: () => null };
    applyActiveDeck({
      tracker,
      mirrorAbsent: true,
      getActiveDeckId: () => 'deck-1',
      getDeckById: () => deck,
    });
    expect(tracker.setOriginalDeck).toHaveBeenCalledTimes(1);
    const arg = tracker.setOriginalDeck.mock.calls[0][0];
    expect(arg.name).toBe('Test');
    expect(arg.deckId).toBe(0);
    expect(tracker.selectSavedDeck).toHaveBeenCalledWith('deck-1', 3);
  });

  it('does nothing on Windows (mirror present)', () => {
    const tracker = { setOriginalDeck: vi.fn(), selectSavedDeck: vi.fn(), getLocalOriginalDeck: () => null };
    applyActiveDeck({ tracker, mirrorAbsent: false, getActiveDeckId: () => 'deck-1', getDeckById: () => deck });
    expect(tracker.setOriginalDeck).not.toHaveBeenCalled();
  });

  it('does nothing when no active deck is set', () => {
    const tracker = { setOriginalDeck: vi.fn(), selectSavedDeck: vi.fn(), getLocalOriginalDeck: () => null };
    applyActiveDeck({ tracker, mirrorAbsent: true, getActiveDeckId: () => null, getDeckById: () => deck });
    expect(tracker.setOriginalDeck).not.toHaveBeenCalled();
  });

  it('does not overwrite an already-identified deck', () => {
    const tracker = { setOriginalDeck: vi.fn(), selectSavedDeck: vi.fn(),
      getLocalOriginalDeck: () => ({} as object) };
    applyActiveDeck({ tracker, mirrorAbsent: true, getActiveDeckId: () => 'deck-1', getDeckById: () => deck });
    expect(tracker.setOriginalDeck).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/desktop test -- apply-active-deck` → FAIL.

- [ ] **Step 3: Implement `apps/desktop/src/main/apply-active-deck.ts`**

```ts
import { DeckSnapshot } from '@hdt/core';
import type { DeckDetail } from './deck-store';

interface ApplyActiveDeckDeps {
  tracker: {
    setOriginalDeck(identified: { deckId: number; name: string; originalDeck: DeckSnapshot }): void;
    selectSavedDeck(savedDeckId: string, savedDeckVersion: number): void;
    getLocalOriginalDeck(): unknown | null;
  };
  mirrorAbsent: boolean;
  getActiveDeckId(): string | null;
  getDeckById(id: string): DeckDetail | null;
}

/**
 * Apply the user's persisted "current deck" as the tracker's live deck at
 * match start, but only in mirror-absent mode and only when no deck has been
 * identified yet (so the Windows mirror auto-identify path always wins).
 */
export function applyActiveDeck(deps: ApplyActiveDeckDeps): void {
  if (!deps.mirrorAbsent) return;
  if (deps.tracker.getLocalOriginalDeck() !== null) return;
  const activeId = deps.getActiveDeckId();
  if (activeId === null) return;
  const deck = deps.getDeckById(activeId);
  if (deck === null) return;
  deps.tracker.setOriginalDeck({
    deckId: 0, // sentinel — no mirror deck id on macOS
    name: deck.name,
    originalDeck: DeckSnapshot.fromDeckCards(deck.cards),
  });
  deps.tracker.selectSavedDeck(deck.id, deck.version);
}
```
> `getLocalOriginalDeck()` — add a tiny public getter on `DeckTracker` returning `this.game.localPlayer.originalDeck` if one doesn't already exist (there's `getGame()` per the global-effects test — you may use `tracker.getGame().localPlayer.originalDeck` instead and drop `getLocalOriginalDeck` from the deps; adjust the test to match whichever you choose).

- [ ] **Step 4: Run to verify it passes**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/desktop test -- apply-active-deck` → PASS (4 tests).

- [ ] **Step 5: Wire into `startDeckTracker`**

After the tracker is created, subscribe to `match-started` (and the `IN_MATCH` re-entry) and call `applyActiveDeck`:
```ts
  tracker.on('match-started', () => {
    applyActiveDeck({
      tracker,
      mirrorAbsent: mirrorAbsent(),
      getActiveDeckId: () => deckStore.getActiveDeckId(),
      getDeckById: (id) => deckStore.getById(id),
    });
  });
```
> `deckStore` must be reachable from `startDeckTracker` — it's created in the IPC host. If it isn't in scope, pass it in (thread the store into `startDeckTracker(deckStore)` from `index.ts`, where both are wired). Also handle the case where the user sets the active deck mid-match: in the `decks:set-active` handler, if currently in a match with no originalDeck, call the same applier.

- [ ] **Step 6: Typecheck + tests**

`pnpm --filter @hdt/desktop typecheck` → no new errors; `… test -- apply-active-deck` → green.

- [ ] **Step 7: Commit**
```bash
git add apps/desktop/src/main/apply-active-deck.ts apps/desktop/src/main/apply-active-deck.test.ts apps/desktop/src/main/deck-tracker.ts
git commit -m "feat(desktop): apply the persisted active deck at match start (mirror-absent)"
```

### Task 8: Renderer — "Set as current deck" action

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/SavedDecksTab.tsx`

- [ ] **Step 1: Add the action + indicator**

In `SavedDecksTab.tsx` (the saved-decks list), for each deck row add a "Set as current deck" button, and load/show which deck is active:
```tsx
// state
const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
useEffect(() => { void window.hdt.decks.getActive().then(setActiveDeckId); }, []);

// per-deck control:
<button
  onClick={async () => { await window.hdt.decks.setActive(deck.id); setActiveDeckId(deck.id); }}
  aria-pressed={activeDeckId === deck.id}
>
  {activeDeckId === deck.id ? t('decks.current') : t('decks.setCurrent')}
</button>
```
Add the i18n keys `decks.current` / `decks.setCurrent` to the locale files (follow the existing i18n pattern used by neighboring strings in this component).

- [ ] **Step 2: Typecheck**

`pnpm --filter @hdt/desktop typecheck` → no new errors (the pre-existing `Settings.tsx` error remains).

- [ ] **Step 3: Manual smoke (renderer)**

Launch `pnpm dev`; in the Decks tab, click "Set as current deck" on a deck; reopen the tab → it shows as current (persisted via `decks:get-active`).

- [ ] **Step 4: Commit**
```bash
git add apps/desktop/src/renderer/src/components/SavedDecksTab.tsx apps/desktop/src/renderer/src/locales/ 2>/dev/null || git add -A
git commit -m "feat(renderer): set a saved deck as the current tracked deck"
```

---

## Phase D — Bridge 4: no-deck fallback

### Task 9: Core — show observed-leaving cards when no deck is set

**Files:**
- Modify/Test: `packages/core/src/tracker/remaining-algorithm.ts` (+ test)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { computeRemaining } from './remaining-algorithm';

describe('computeRemaining with no originalDeck (no-deck fallback)', () => {
  it('returns the cards observed leaving the deck, not empty', () => {
    const result = computeRemaining({
      originalDeck: null,
      seenEntities: [
        { cardId: 'CS2_062', zone: 'HAND' },   // drawn from deck → observed leaving
      ],
      // include whatever fields computeRemaining requires; mirror an existing test's input shape
    } as Parameters<typeof computeRemaining>[0]);
    // Expect the observed card to appear (so the overlay shows "seen leaving deck")
    expect(result.some((c) => c.cardId === 'CS2_062')).toBe(true);
  });
});
```
> First READ `remaining-algorithm.ts` and an existing `remaining-algorithm.test.ts` to get `computeRemaining`'s exact input/output types; adapt this test to the real shapes. The behavior to assert: `originalDeck === null` yields the observed-leaving (`seen`) cards, not `[]`.

- [ ] **Step 2: Run to verify it fails (or already passes)**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/core test -- remaining-algorithm`
- If it already passes, the fallback exists — keep the test as a guard and skip Step 3.
- If it fails (returns empty for null deck), proceed.

- [ ] **Step 3: Implement the fallback**

In `computeRemaining`, when `originalDeck` is null/empty, return the observed-leaving cards (the `seenCards`/`seenEntities` projected to `{cardId,count}`) instead of an empty list. Keep the existing behavior when `originalDeck` is present. (Match the existing return type exactly.)

- [ ] **Step 4: Run to verify it passes**

`export ESBUILD_BINARY_PATH=… ; pnpm --filter @hdt/core test -- remaining-algorithm` → PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/core/src/tracker/remaining-algorithm.ts packages/core/src/tracker/remaining-algorithm.test.ts
git commit -m "feat(core): no-deck fallback shows cards observed leaving the deck"
```

---

## Phase E — Verification

### Task 10: Real-log fixture + full verification

**Files:**
- Create: `apps/desktop/src/main/__fixtures__/mac-match.power.log` (captured)
- Create: `apps/desktop/src/main/deck-recognition.live-log.test.ts`

- [ ] **Step 1: Capture a real fixture**

With `pnpm dev` running and Hearthstone, play one full Practice-vs-AI match with a known imported+active deck. Copy that match's `Power.log` (under `/Applications/Hearthstone/Logs/Hearthstone_*/Power.log`) into the fixture path. Trim to one complete game if large.

- [ ] **Step 2: Write the end-to-end test**

Feed the fixture lines through the hearthwatcher Power parser into `forwardPowerEventToDeckTracker` (live phase) with `mirrorAbsent`=true and a stub `DeckStore` returning the known deck as active. Assert, over the event sequence:
- the deck-tracker phase leaves `IDLE` (reaches `IN_MATCH`),
- `localPlayer.controllerId` resolves to the friendly side,
- after the active deck applies, `remaining` total starts at 30 and decrements as draw events occur,
- opponent revealed list grows as the opponent plays cards.
> Model the parsing/wiring on the existing `apps/desktop/src/main/card-played-detector.live-log.test.ts` (it already reads real Power.log lines through the parser).

- [ ] **Step 3: Run the full suites**

```
export ESBUILD_BINARY_PATH="…/.worktrees/feat-card-image-bulk-download/node_modules/.pnpm/@esbuild+darwin-arm64@0.21.5/node_modules/@esbuild/darwin-arm64/bin/esbuild"
pnpm --filter @hdt/core test
pnpm --filter @hdt/desktop test
pnpm --filter @hdt/core typecheck && pnpm --filter @hdt/desktop typecheck
```
Expected: all new tests green; the only pre-existing failures are the unrelated renderer `App.test.tsx`/`App.i18n.test.tsx` + the `Settings.tsx` typecheck error (baseline).

- [ ] **Step 4: Manual verification (the real proof, macOS)**

1. `pnpm dev`; import a deck via deck code (DeckImportDialog); mark it current (Task 8).
2. Open Hearthstone, enter a match.
3. Dev log: `[deck-tracker] state phase=` leaves IDLE → `IN_MATCH`; `deck=… friendlyDeckCount>0`; remaining decrements as you draw.
4. Overlay panels show your remaining cards + opponent revealed cards.
5. Clear the current deck → overlay shows only observed-leaving cards.
6. Confirm no Windows regression conceptually: all new behavior is gated by `mirrorAbsent()` / mirror-first merges.

- [ ] **Step 5: Final commit (any fixups)**
```bash
git add -A && git commit -m "test(deck-recognition): real-log fixture + verification"
```

---

## Notes

- **Mirror-first invariant:** every bridge is a fallback used only when the mirror signal is null (`resolvePhaseSignals` ORs log into falsy mirror; identity/deck application gated by `mirrorAbsent()`). Windows behavior is unchanged.
- **Highest risk:** Bridge 3 (local player heuristic). Task 10's real fixture is the guard; if it mis-resolves, the no-deck fallback (Task 9) still shows useful data.
- **`tick()` cadence:** Task 1 assumes the existing poll `tick()` runs on macOS (it drives phase via the loop regardless of mirror connectivity). If verification shows it does not advance, add an event-driven `nextPhase` evaluation after phase-relevant log events in the host (re-using `logMatchState`). Confirm during Task 1/Task 10.
- **Out of scope:** auto-prompt deck picker, drawn-card mismatch detection, spectator/BG/Arena, memory-mirror port, packaging.
```

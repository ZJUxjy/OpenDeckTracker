## Context

`@hdt/core` already owns the live match state machine and consumes `HearthMirror.getBoardState()` during PRE_MATCH / IN_MATCH ticks. The reflected `BoardEntity` shape already includes `attack`, so board attack totals can be derived without adding a native API or renderer-side duplicate logic.

The renderer and overlay receive `DeckTrackerSnapshot` over existing IPC channels. Extending that snapshot is the smallest cross-layer contract change: the core remains the authority for game-state computation, while UI components only render the resulting totals.

## Goals / Non-Goals

**Goals:**

- Compute friendly and opposing minion board attack totals from the current board state.
- Expose totals on `DeckTrackerSnapshot` for desktop panels and overlay routes.
- Keep the computation pure, deterministic, and covered by `@hdt/core` tests.
- Render localized labels and mono numeric values in existing live tracker UI surfaces.

**Non-Goals:**

- No lethal calculator, combat simulator, weapon/hero attack, spell damage, hand damage, or taunt math.
- No Battlegrounds combat-specific rules.
- No new external package dependency.
- No native HearthMirror schema change unless implementation discovers the existing `attack` field is not being populated in practice.

## Decisions

### Decision 1: Compute totals in `@hdt/core`

**Context:** Board attack is derived state from tracked entities / reflected board state and will be consumed by multiple UI surfaces.

**Options:**

- Compute separately inside each renderer component.
- Compute once in Electron main before IPC forwarding.
- Compute in `@hdt/core` and include the result in `DeckTrackerSnapshot`.

**Choice:** Compute in `@hdt/core`.

**Rationale:** Core already owns match state, controller identity, and pure domain algorithms such as remaining-card calculation. Keeping attack computation there avoids UI duplication and keeps renderer tests focused on display behavior.

### Decision 2: Use `BoardEntity.attack` as the source of truth

**Context:** `packages/hearthmirror/src/types.ts` already exposes `BoardEntity.attack`, and `DeckTracker.tick()` already polls `getBoardState()`.

**Options:**

- Extend `Entity` to persist `attack` and calculate from `Player.board`.
- Calculate directly from the latest `BoardState` returned by `getBoardState()`.
- Re-read card database base attack from `@hdt/hearthdb`.

**Choice:** Calculate from the latest `BoardState` using `BoardEntity.attack`, and optionally persist attack on `Entity` only if implementation needs the value outside the current tick.

**Rationale:** Reflected attack includes in-game buffs/debuffs, while card database base attack does not. Calculating from `BoardState` also avoids expanding the canonical `Entity` shape until there is a broader stat-tracking need.

### Decision 3: Conservative attacker filtering

**Context:** Board reflections can include heroes, hero powers, placeholders, or invalid values. The feature must avoid overstating pressure.

**Options:**

- Sum every `BoardEntity.attack`.
- Sum only entities with positive attack.
- Sum positive attack after excluding obvious non-minion card IDs such as `HERO_`.

**Choice:** Sum finite positive attack values for board entries, excluding obvious non-card / hero entities already filtered by tracker helpers where possible.

**Rationale:** A conservative positive-only sum prevents negative, missing, or non-finite values from reducing/inflating totals. Excluding known non-minion entities prevents hero cards from appearing as board pressure if the reflector includes them.

### Decision 4: Snapshot shape

**Context:** The current snapshot has flat counters such as `opposingHandCount` and `friendlyDeckCount`, plus grouped structures for deck/opponent data.

**Options:**

- Add `friendlyBoardAttack` and `opposingBoardAttack` as flat fields.
- Add a grouped `boardAttack: { friendly: number; opposing: number }`.
- Add board attack under `opponent` and `deck`.

**Choice:** Add `boardAttack: { friendly: number; opposing: number }`.

**Rationale:** A grouped field keeps combat pressure separate from deck/opponent card history and leaves room for future board summaries without adding many top-level counters.

### Decision 5: No dependency changes

**Context:** This feature only needs TypeScript, existing HearthMirror types, React components, Zustand store data, and i18n files already in the app.

**Options:**

- Add a helper/statistics package.
- Use existing packages only.

**Choice:** Use existing packages only.

**Rationale:** There is no external API or algorithmic complexity that justifies a dependency. Version status check: no new package version needs to be validated because no dependency will be added.

## Directory / File Structure

```text
packages/core/src/tracker/
  board-attack.ts
  board-attack.test.ts
  deck-tracker.ts

apps/desktop/src/renderer/src/components/
  LiveDeckPanel.tsx
  OpponentCardsPanel.tsx
  OverlayView.tsx
  OpponentOverlayView.tsx

apps/desktop/src/renderer/tests/
  LiveDeckPanel.test.tsx
  OpponentCardsPanel.test.tsx

resources/locales/
  en-US.json
  zh-CN.json
```

Exact component targets can be narrowed during implementation after inspecting current panel layout; the contract is that both friendly and opposing totals are visible in appropriate live match surfaces.

## Risks / Trade-offs

- **Performance:** Recomputing every poll is cheap, but it runs on the same 500 ms in-match cadence as deck tracking. → Mitigation: implement as a linear pass over at most board-size arrays and avoid card database lookups in the core function.
- **Compatibility:** Some reflected board entries may include heroes or non-minion entities. → Mitigation: positive-only and obvious non-minion filtering, with tests covering hero card IDs and invalid attacks.
- **Accuracy:** `BoardEntity.attack` may be stale or unavailable if the native reflector fails. → Mitigation: return `0` for missing/null board state and preserve existing tracker error handling.
- **UI clutter:** Adding another counter can crowd overlay panels. → Mitigation: render compact numeric badges in existing panel headers/summary rows rather than adding a new large panel.
- **Security:** No new input boundary or external dependency is introduced. Existing IPC only forwards numbers in the already-trusted tracker snapshot.

## Migration Plan

1. Add the pure core computation and tests.
2. Extend `DeckTrackerSnapshot` and `blankSnapshot()` with `boardAttack`.
3. Populate `boardAttack` from the current tick's `BoardState`.
4. Render the values in renderer/overlay components with localized labels.
5. Add/update renderer tests and locale keys.

Rollback is straightforward: remove UI reads and the snapshot field before release, or leave the field unused if only presentation needs to be disabled.

## Open Questions

- Which exact visual location should own the friendly total in the desktop deck panel versus the in-game player overlay?
- Should zero-attack minions be visually counted elsewhere in a future "board count" feature? This change only reports attack totals.

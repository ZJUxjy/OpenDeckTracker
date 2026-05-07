## 1. Core Board Attack Calculation

- [x] 1.1 Add failing core tests in `packages/core/src/tracker/board-attack.test.ts` for separate friendly/opposing sums, invalid attacks, hero exclusion, and null board state. Use this test shape:

```ts
import { describe, expect, it } from 'vitest';
import type { BoardEntity, BoardState } from '@hdt/hearthmirror';
import { computeBoardAttack } from './board-attack';

const entity = (overrides: Partial<BoardEntity>): BoardEntity => ({
  entityId: overrides.entityId ?? 1,
  cardId: overrides.cardId ?? 'CS2_231',
  zonePosition: overrides.zonePosition ?? 1,
  attack: overrides.attack ?? 0,
  health: overrides.health ?? 1,
  damage: overrides.damage ?? 0,
});

describe('computeBoardAttack', () => {
  it('sums friendly and opposing attack separately', () => {
    const board: BoardState = {
      friendly: [entity({ attack: 2 }), entity({ entityId: 2, attack: 5 })],
      opposing: [entity({ entityId: 3, attack: 3 }), entity({ entityId: 4, attack: 4 })],
    };

    expect(computeBoardAttack(board)).toEqual({ friendly: 7, opposing: 7 });
  });

  it('ignores invalid attacks and hero entities', () => {
    const board: BoardState = {
      friendly: [
        entity({ attack: -1 }),
        entity({ entityId: 2, attack: Number.NaN }),
        entity({ entityId: 3, cardId: 'HERO_07', attack: 5 }),
        entity({ entityId: 4, attack: 3 }),
      ],
      opposing: [],
    };

    expect(computeBoardAttack(board)).toEqual({ friendly: 3, opposing: 0 });
  });

  it('returns zero totals when board state is missing', () => {
    expect(computeBoardAttack(null)).toEqual({ friendly: 0, opposing: 0 });
  });
});
```

Run `pnpm --filter @hdt/core test -- board-attack.test.ts`; expected output before implementation: test run fails because `./board-attack` does not exist. Commit after the failing test if following strict TDD with `test(core): cover board attack calculation`.

- [x] 1.2 Implement `packages/core/src/tracker/board-attack.ts` with exported `computeBoardAttack(boardState: BoardState | null | undefined): { friendly: number; opposing: number }`. It MUST sum finite positive `attack` values only and skip empty card IDs, `HERO_` card IDs, and known non-card game IDs where practical. Run `pnpm --filter @hdt/core test -- board-attack.test.ts`; expected output: all `board-attack.test.ts` tests pass. Commit message: `feat(core): compute board attack totals`.

- [x] 1.3 Export the utility from `packages/core/src/index.ts` if tracker utilities are exported there, preserving existing public exports. Run `pnpm --filter @hdt/core typecheck`; expected output: command exits 0 with no TypeScript errors. Commit message: `feat(core): expose board attack utility`.

## 2. DeckTracker Snapshot Integration

- [x] 2.1 Add failing tracker tests in `packages/core/src/tracker/deck-tracker.test.ts` covering `snapshot.boardAttack` during IN_MATCH and zero values in the blank snapshot. Use existing mirror test helpers and add assertions equivalent to:

```ts
expect(snapshot.boardAttack).toEqual({ friendly: 3, opposing: 4 });
expect(new DeckTracker({ mirror }).getSnapshot().boardAttack).toEqual({
  friendly: 0,
  opposing: 0,
});
```

Run `pnpm --filter @hdt/core test -- deck-tracker.test.ts`; expected output before implementation: assertions fail because `boardAttack` is missing. Commit message: `test(core): cover board attack snapshot field`.

- [x] 2.2 Extend `DeckTrackerSnapshot` in `packages/core/src/tracker/deck-tracker.ts` with `boardAttack: { friendly: number; opposing: number }`, update `blankSnapshot()`, and populate it in `buildSnapshot()` using `computeBoardAttack(args?.boardState ?? null)`. Run `pnpm --filter @hdt/core test -- deck-tracker.test.ts board-attack.test.ts`; expected output: both suites pass. Commit message: `feat(core): include board attack in tracker snapshots`.

- [x] 2.3 Verify snapshot consumers compile without a separate IPC change by running `pnpm --filter @hdt/core typecheck` and `pnpm --filter @hdt/desktop typecheck` from the repo root. Expected output: both commands exit 0. Commit message: `chore: verify board attack snapshot typing`.

## 3. Renderer Display

- [x] 3.1 Add failing renderer tests in `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx` and `apps/desktop/src/renderer/tests/OpponentCardsPanel.test.tsx` using active snapshots that include `boardAttack`. Assertions MUST check localized labels and mono numeric values. Example assertion shape:

```ts
expect(screen.getByText(/board attack/i)).toBeInTheDocument();
expect(screen.getByText('6')).toHaveClass('font-mono');
```

Run `pnpm --filter @hdt/desktop test -- LiveDeckPanel.test.tsx OpponentCardsPanel.test.tsx`; expected output before implementation: tests fail because labels/values are not rendered. Commit message: `test(renderer): cover board attack display`.

- [x] 3.2 Add locale keys in `resources/locales/en-US.json` and `resources/locales/zh-CN.json` for friendly and opposing board attack labels. Run `pnpm --filter @hdt/desktop test -- LiveDeckPanel.test.tsx OpponentCardsPanel.test.tsx`; expected output: tests still fail only on missing UI render, not missing translations. Commit message: `feat(i18n): add board attack labels`.

- [x] 3.3 Render friendly board attack in `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` using `snapshot.boardAttack.friendly`, existing theme tokens, and `font-mono` for the number. Preserve empty/waiting states. Run `pnpm --filter @hdt/desktop test -- LiveDeckPanel.test.tsx`; expected output: LiveDeckPanel board attack assertions pass. Commit message: `feat(renderer): show friendly board attack`.

- [x] 3.4 Render opposing board attack in `apps/desktop/src/renderer/src/components/OpponentCardsPanel.tsx` or the current opponent live surface using `snapshot.boardAttack.opposing`, existing theme tokens, and `font-mono` for the number. Run `pnpm --filter @hdt/desktop test -- OpponentCardsPanel.test.tsx`; expected output: OpponentCardsPanel board attack assertions pass. Commit message: `feat(renderer): show opposing board attack`.

- [x] 3.5 Inspect `apps/desktop/src/renderer/src/components/OverlayView.tsx` and `apps/desktop/src/renderer/src/components/OpponentOverlayView.tsx` to confirm they receive the updated panel displays without separate overlay-only code. If overlay-specific markup is required, add focused tests under `apps/desktop/src/renderer/tests/`. Run `pnpm --filter @hdt/desktop test -- OverlayView.test.tsx OpponentOverlayView.test.tsx` when those tests exist; expected output: overlay tests pass or no additional tests are needed because panels are reused. Commit message: `test(renderer): verify overlay board attack surfaces`.

## 4. Verification

- [ ] 4.1 Run `pnpm --filter @hdt/core test`; expected output: all core tests pass, including `board-attack.test.ts` and `deck-tracker.test.ts`.

- [ ] 4.2 Run `pnpm --filter @hdt/desktop test`; expected output: renderer/main desktop tests pass with board attack display coverage.

- [x] 4.3 Run `pnpm --filter @hdt/core typecheck` and `pnpm --filter @hdt/desktop typecheck`; expected output: both commands exit 0 with no TypeScript errors.

- [x] 4.4 Run `openspec status --change "add-board-attack-calculation"`; expected output: proposal, design, specs, and tasks are complete. Commit message after final verification: `feat: add board attack calculation`.

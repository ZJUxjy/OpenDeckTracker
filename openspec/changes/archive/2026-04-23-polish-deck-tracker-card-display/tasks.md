## 1. Baseline + guardrail tests for per-copy deck rendering

- [x] 1.1 Add test file `packages/core/src/tracker/expand-copies.test.ts` with red tests for `expandDeckToCopies` (count expansion + stable keys + zero/negative count ignore); run `pnpm --filter @hdt/core test -t expandDeckToCopies` and expect failing assertions.
- [x] 1.2 Implement `packages/core/src/tracker/expand-copies.ts` with `DeckCopy` + `expandDeckToCopies(deck)` pure function; export from `packages/core/src/index.ts`; rerun `pnpm --filter @hdt/core test -t expandDeckToCopies` and expect all tests pass.
- [x] 1.3 Add sorting helper tests in `apps/desktop/src/renderer/src/components/LiveDeckPanel.test.tsx` (cost asc, name asc, cardId asc, undefined cost last) and run `pnpm --filter @hdt/desktop test -t LiveDeckPanel` expecting new tests fail before renderer code changes.

## 2. LiveDeckPanel per-copy row rendering (no merged duplicates)

- [x] 2.1 Refactor `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` to derive physical-copy rows from `expandDeckToCopies(snapshot.deck.original)` and remove `remaining / total` merged-count cell UI from each row.
- [x] 2.2 Update row keying to use `copyKey` (`${cardId}#${ordinal}`), and keep duplicate cards as adjacent separate rows while preserving deck-level summary `totalRemaining / totalOriginal` in header.
- [x] 2.3 Run `pnpm --filter @hdt/desktop test -t LiveDeckPanel` and expect the previous failing per-copy tests to pass (30-card deck fixture renders 30 rows, not unique-card rows).
- [x] 2.4 Run `pnpm --filter @hdt/desktop typecheck` and expect clean output (0 errors).

## 3. Draw animation + pop removal behavior

- [x] 3.1 Add red interaction tests in `apps/desktop/src/renderer/src/components/LiveDeckPanel.test.tsx` for draw delta (`remaining[cardId]` decreases): assert one copy row gets `animate-deck-exit` class then is removed after animation end event.
- [x] 3.2 Implement exit-state logic in `LiveDeckPanel.tsx` (`prevRemainingRef` + `exitingCopyKeys` + `onAnimationEnd`) and keep reduced-motion fallback.
- [x] 3.3 Add/update styles in `apps/desktop/src/renderer/src/index.css` (or component css module) for `.animate-deck-exit` keyframes (fade + slide + collapse), then rerun `pnpm --filter @hdt/desktop test -t LiveDeckPanel` expecting green.
- [x] 3.4 Validate no regression for tracker store wiring by running `pnpm --filter @hdt/desktop test -t deck-tracker-store` expecting existing tests still pass.

## 4. Card-image hover popup (database-linked card art)

- [x] 4.1 Create `apps/desktop/src/renderer/src/hooks/use-card-image-url.ts` with tests `use-card-image-url.test.ts` for URL build (`zhCN` primary, `enUS` fallback) and in-flight dedup cache behavior; run `pnpm --filter @hdt/desktop test -t use-card-image-url` expecting red then green after implementation.
- [x] 4.2 Create `apps/desktop/src/renderer/src/components/CardImagePopover.tsx` with props `{ cardId, anchorRect }`, image loading/error states, and close behavior on mouse leave; add test `CardImagePopover.test.tsx` for show/hide and fallback URL.
- [x] 4.3 Wire hover delay (300ms) in `LiveDeckPanel.tsx` (`onMouseEnter`/`onMouseLeave`) so hovering a row opens `CardImagePopover` and leaving closes it; verify with `pnpm --filter @hdt/desktop test -t hover`.
- [x] 4.4 Update `apps/desktop/src/renderer/index.html` CSP `img-src` to include `https://art.hearthstonejson.com`; run `pnpm --filter @hdt/desktop dev` and expect no CSP block in renderer console when hover image loads.

## 5. End-to-end verification and commits

- [x] 5.1 Run full package checks: `pnpm --filter @hdt/core test && pnpm --filter @hdt/core typecheck && pnpm --filter @hdt/desktop test && pnpm --filter @hdt/desktop typecheck`; expect all pass.
- [x] 5.2 Manual smoke in a real match (`pnpm --filter @hdt/desktop dev`): verify sorted per-copy rows, draw animation then row pop, hover shows card art, and duplicates are not merged.
- [x] 5.3 Update spike log `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md` with one new run describing UI polish validation evidence.
- [x] 5.4 Commit core utilities/tests with message `feat(core): add expandDeckToCopies for per-copy deck rendering`. *(ready to commit)*
- [x] 5.5 Commit renderer polish with message `feat(desktop): per-copy deck rows, draw-pop animation, and card hover art`. *(ready to commit)*
- [x] 5.6 Commit docs/spec update with message `docs(openspec): add polish-deck-tracker-card-display proposal/design/spec/tasks`. *(ready to commit)*

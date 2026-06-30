# EVH Prepare Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track local-player Prepare / 预备 actions and surface state on released Escape from Violet Hold promo cards (Phase 0–2).

**Architecture:** Extend hsdata conversion for `PREPARE` tags. Add `prepare.ts` helpers, `PrepareActionDetector` on the PowerEvent stream, per-hand `preparedHand` snapshot slice, and Herald-parity UI (hover lines + `预备 N` chip). Minimal Bribe counter for Deadly Bribe when log attribution is clear.

**Spec:** `docs/superpowers/specs/2026-06-29-evh-prepare-tracking-design.md`

**Tech Stack:** TypeScript, Vitest, React, Electron main/renderer, hsdata XML converter, `@hdt/core`, `@hdt/hearthdb`, `@hdt/desktop`.

---

## File Structure

- Modify `scripts/convert-hsdata-cards.ts`: add `PREPARE` to `MECHANIC_TAGS`; optional `deckActionCost` from `DECK_ACTION_COST`.
- Modify `scripts/convert-hsdata-cards.test.ts`: PREPARE mechanics / referencedTags coverage.
- Create `scripts/fixtures/hsdata-prepare.xml`: Prepare caster + referenced Prepare card.
- Modify `packages/hearthdb/src/card-defs.ts`: optional `deckActionCost?: number` if surfaced in `CardDef`.
- Create `packages/core/src/tracker/prepare.ts`: counter key + `isPrepareCard` / `isPrepareCaster`.
- Create `packages/core/src/tracker/prepare.test.ts`.
- Create `packages/core/src/tracker/prepare-action-detector.ts`: deduped Prepare zone/cost detector.
- Create `packages/core/src/tracker/prepare-action-detector.test.ts`: fixture log sequences.
- Modify `packages/core/src/tracker/extra-display-state.ts`: `prepareCountThisGame`, `preparedHand` map, `bribeCoinsGivenToOpponentThisGame`, `demonsRemainingInDeck` pool builder hook.
- Modify `packages/core/src/tracker/extra-display-state.test.ts`.
- Modify `packages/core/src/tracker/deck-tracker.ts`: `recordPrepareAction`, expose `preparedHand` in snapshot, wire demon deck pool on rebuild.
- Modify `packages/core/src/index.ts`: export Prepare helpers + detector.
- Modify `apps/desktop/src/main/deck-tracker.ts`: wire `PrepareActionDetector`.
- Modify `apps/desktop/src/main/deck-tracker.test.ts`: integration forwarding.
- Modify `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`: Prepare hover, hand badge, `预备 N` chip.
- Modify `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx`.
- Modify `apps/desktop/src/renderer/tests/OverlayView.test.tsx`.
- Modify `data/cards/review/standard-extra-display-candidates/*.json`: add `JAIL_906` demon pool candidate (one class file or neutral as appropriate).
- Modify `data/cards/schema/stateNeeded-vocabulary.md`: EVH / Prepare keys (done in spec task).

---

### Task 1: Convert hsdata Prepare Metadata

**Files:**
- Modify: `scripts/convert-hsdata-cards.ts`
- Modify: `scripts/convert-hsdata-cards.test.ts`
- Create: `scripts/fixtures/hsdata-prepare.xml`
- Modify: `packages/hearthdb/src/card-defs.ts` (if adding `deckActionCost`)

- [ ] **Step 1: Create fixture** with `TEST_PREPARE_CASTER` (`Tag PREPARE`) and `TEST_PREPARE_REF` (`ReferencedTag PREPARE`).

- [ ] **Step 2: Add failing converter tests** expecting `mechanics: ["PREPARE"]` and `referencedTags: ["PREPARE"]`.

- [ ] **Step 3: Implement** — add `PREPARE` to `MECHANIC_TAGS`; map `DECK_ACTION_COST` → `deckActionCost` when present.

- [ ] **Step 4: Run** `pnpm exec vitest run scripts/convert-hsdata-cards.test.ts` — pass.

- [ ] **Step 5: Run** `pnpm cards:convert` — verify `JAIL_407`, `CATA_EVENT_401` in generated JSON.

---

### Task 2: Prepare Helpers And Counter Key

**Files:**
- Create: `packages/core/src/tracker/prepare.ts`
- Create: `packages/core/src/tracker/prepare.test.ts`

- [ ] **Step 1: Failing tests** for `isPrepareCard`, `isPrepareCaster`, `PREPARE_COUNTER_KEY`.

- [ ] **Step 2: Implement** helpers mirroring `herald.ts` style.

- [ ] **Step 3: Run** `pnpm --filter @hdt/core test prepare` — pass.

---

### Task 3: Prepare Action Detector

**Files:**
- Create: `packages/core/src/tracker/prepare-action-detector.ts`
- Create: `packages/core/src/tracker/prepare-action-detector.test.ts`

- [ ] **Step 1: Document expected log sequence** in test file comments (HAND→DECK, COST decrease, DECK→HAND).

- [ ] **Step 2: Failing tests** with synthetic `PowerEvent[]` fixtures.

- [ ] **Step 3: Implement** detector with dedupe window (match Herald detector pattern).

- [ ] **Step 4: Run** `pnpm --filter @hdt/core test prepare-action-detector` — pass.

> **Note:** If live 35.6 logs differ, add a follow-up task with captured log snippet; keep detector extensible.

---

### Task 4: Match State And Snapshot

**Files:**
- Modify: `packages/core/src/tracker/extra-display-state.ts`
- Modify: `packages/core/src/tracker/extra-display-state.test.ts`
- Modify: `packages/core/src/tracker/deck-tracker.ts`

- [ ] **Step 1: Failing tests** — `recordPrepareAction` increments `prepareCountThisGame`, stores `preparedHand` entry, clears on entity leave hand.

- [ ] **Step 2: Implement** `recordPrepareAction` on `DeckTracker` + state mutations.

- [ ] **Step 3: Add `demonsRemainingInDeck` pool** — filter `remaining` by race `DEMON` during snapshot build; test with mock remaining list.

- [ ] **Step 4: Optional** — increment `bribeCoinsGivenToOpponentThisGame` when Deadly Bribe block shows opponent Coin; skip if log too ambiguous (test with fixture or mark `it.skip` + TODO).

- [ ] **Step 5: Run** `pnpm --filter @hdt/core test extra-display-state deck-tracker` — pass.

---

### Task 5: Desktop Wiring

**Files:**
- Modify: `apps/desktop/src/main/deck-tracker.ts`
- Modify: `apps/desktop/src/main/deck-tracker.test.ts`

- [ ] **Step 1: Instantiate** `PrepareActionDetector` beside `HeraldTriggerDetector`.

- [ ] **Step 2: Forward** events in `forwardPowerEventToDeckTracker`.

- [ ] **Step 3: Integration test** — synthetic Prepare sequence increments snapshot counter.

- [ ] **Step 4: Run** `pnpm --filter @hdt/desktop test deck-tracker` — pass.

---

### Task 6: Renderer UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`
- Modify: `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx`
- Modify: `apps/desktop/src/renderer/tests/OverlayView.test.tsx`

- [ ] **Step 1: Failing tests** — Prepare hover line, `预备 N` chip visibility, hand badge when `preparedHand` contains entity.

- [ ] **Step 2: Extend `KeywordCounterStrip`** — `prepareCount` + `showPrepare` parallel to Herald.

- [ ] **Step 3: Data-driven hover** — `本局已预备：N 次` when `isPrepareCard(def)`.

- [ ] **Step 4: Card-specific hovers** — `JAIL_407` board line, `JAIL_906` demon pool, `CATA_EVENT_402` combo line.

- [ ] **Step 5: Run** `pnpm --filter @hdt/desktop test LiveDeckPanel OverlayView` — pass.

---

### Task 7: Review Data And Docs

**Files:**
- Modify: `data/cards/review/standard-extra-display-candidates/*.json`
- Already updated: `data/cards/schema/stateNeeded-vocabulary.md`

- [ ] **Step 1: Add `JAIL_906` review entry** with `stateNeeded: ["demonsRemainingInDeck"]` and suggested zh-CN display text.

- [ ] **Step 2: Final verification**

```bash
pnpm exec vitest run scripts/convert-hsdata-cards.test.ts
pnpm --filter @hdt/core test prepare extra-display-state
pnpm --filter @hdt/desktop test LiveDeckPanel OverlayView deck-tracker
pnpm cards:convert
pnpm typecheck
```

Expected: build `245096` cards convert; `JAIL_407` has `PREPARE` mechanic; overlay shows `预备 0` chip when Prepare cards are in deck.

---

## Deferred (Phase 3+)

- Disguise board-side entity tracking — new spec when `DISGUISE` tags appear in hsdata.
- `BRIBE` referenced tag + generic bribe detector.
- Rulebreaker `globalEffect.*` flags.
- Full `standard-extra-display-candidates` pass for all 135 EVH cards post-launch.

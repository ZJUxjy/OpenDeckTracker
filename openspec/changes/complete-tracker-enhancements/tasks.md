## 1. Draw odds and live analysis

- [x] 1.1 Add `packages/core/src/analysis/draw-odds.test.ts` covering `expect(result.probability).toBeCloseTo(24 / 45)` for any target and `2 / 45` for all components, deterministic positions and invalid data; run `pnpm exec vitest run packages/core/src/analysis/draw-odds.test.ts`, observe missing implementation then passing tests after 1.2.
- [x] 1.2 Implement and export `packages/core/src/analysis/draw-odds.ts` with exact any/all probabilities and inconsistent-input handling; run `pnpm --filter @hdt/core typecheck`, expect exit 0.
- [x] 1.3 Integrate persistent key-card selection and bilingual probability controls in `apps/desktop/src/renderer/src/components/TrackerAnalysisPanel.tsx`, `TrackerPanelTabs.tsx`, `OverlayView.tsx` and `Dashboard.tsx`; add `apps/desktop/src/renderer/tests/TrackerAnalysisPanel.test.tsx` asserting selection changes visible odds and survives remount; run `pnpm exec vitest run apps/desktop/src/renderer/tests/TrackerAnalysisPanel.test.tsx`, expect pass.

## 2. Draw risks

- [x] 2.1 Implement `packages/core/src/analysis/draw-risk.ts` and tests with `expect(result.fatigueDamage).toBe(7)` and `expect(result.burned).toBe(1)` for the specified mixed-draw case; run `pnpm exec vitest run packages/core/src/analysis/draw-risk.test.ts`, expect pass after initial failure.
- [x] 2.2 Project observed fatigue, hand limit and known automatic draw context through `packages/core/src/tracker/deck-tracker.ts`; integrate warnings in `TrackerAnalysisPanel.tsx`; run `pnpm exec vitest run packages/core/src/tracker/deck-tracker.test.ts apps/desktop/src/renderer/tests/TrackerAnalysisPanel.test.tsx`, expect pass including unavailable inputs.

## 3. Opponent hand timeline

- [x] 3.1 Add `packages/core/src/tracker/opponent-hand-timeline.ts` and tests for position shifts, mulligan, generation, late attach and reset; assert `expect(after[0].acquiredTurn).toBe(before[1].acquiredTurn)`; run `pnpm exec vitest run packages/core/src/tracker/opponent-hand-timeline.test.ts`, expect pass after initial failure.
- [x] 3.2 Integrate public log projection in `deck-tracker.ts` and `apps/desktop/src/renderer/src/components/OpponentCardsPanel.tsx`; run `pnpm --filter @hdt/desktop typecheck` and timeline integration tests, expect no hidden card IDs and exit 0.

## 4. Secret assistant

- [ ] 4.1 Build evidence-based rule catalog and projection in `packages/core/src/analysis/secrets.ts`; add `secrets.test.ts` with `expect(ambiguous.candidates).toContain(secretId)`; run `pnpm exec vitest run packages/core/src/analysis/secrets.test.ts`, expect pass.
- [ ] 4.2 Connect actual public events and format to secret projection; add `apps/desktop/src/renderer/src/components/SecretAssistant.tsx` with reversible persisted exclusions and evidence; run `pnpm --filter @hdt/desktop typecheck`, expect exit 0; test per-secret override/reset behavior.

## 5. Resource groups

- [x] 5.1 Add `packages/core/src/analysis/resources.ts` and tests asserting generated plays do not decrement original copies; run `pnpm exec vitest run packages/core/src/analysis/resources.test.ts`, expect pass.
- [x] 5.2 Add persistent editable groups and known/predicted summaries to `TrackerAnalysisPanel.tsx` and opponent overlay; run `pnpm exec vitest run apps/desktop/src/renderer/tests/TrackerAnalysisPanel.test.tsx`, expect edit/restart/deck-switch cases pass.

## 6. Damage sequences

- [ ] 6.1 Add `packages/core/src/analysis/damage-sequence.ts` and tested supported card rules; assert `expect(result.manaSpent).toBeLessThanOrEqual(availableMana)` and unique card-instance use; run `pnpm exec vitest run packages/core/src/analysis/damage-sequence.test.ts`, expect pass.
- [ ] 6.2 Wire observed costs, hero power and board constraints into tracker analysis and advisor; render ordered actions and limitations in `TrackerAnalysisPanel.tsx`; run `pnpm --filter @hdt/desktop typecheck`, expect exit 0; verify unsupported mechanics never produce a guaranteed-lethal claim.

## 7. Personal mulligan statistics

- [x] 7.1 Add recording-derived aggregation in `packages/core/src/stats/mulligan-stats.ts` and tests with `expect(result.sampleSize).toBe(2)` after excluding a record without mulligan; run `pnpm exec vitest run packages/core/src/stats/mulligan-stats.test.ts`, expect pass.
- [x] 7.2 Connect recording/deck identifiers and filters to `apps/desktop/src/renderer/src/components/Stats.tsx`; test deck/class/play-order filters and sample warnings; run `pnpm --filter @hdt/desktop typecheck`, expect exit 0.

## 8. Key-turn replay

- [ ] 8.1 Add deterministic key-event indexing and public reconstruction in `packages/core/src/recordings/key-turns.ts`; test `expect(frame.opponentHand.every(card => !card.hiddenIdentity)).toBe(true)` with hidden fixtures and actual exposed shape; run `pnpm exec vitest run packages/core/src/recordings/key-turns.test.ts`, expect pass.
- [ ] 8.2 Extend `apps/desktop/src/main/match-recording-store.ts` and typed IPC with local annotations; integrate navigation, board state and notes in `MatchRecordingViewer.tsx`; run `pnpm exec vitest run apps/desktop/src/renderer/tests/MatchRecordingViewer.test.tsx`, expect bookmark reopen and navigation cases pass.

## 9. Deck versions

- [x] 9.1 Extend saved-deck storage with immutable version snapshots and played-version match linkage; implement `packages/core/src/stats/deck-version-comparison.ts` and tests asserting previous version cards unchanged after edit; run `pnpm exec vitest run packages/core/src/stats/deck-version-comparison.test.ts`, expect pass.
- [x] 9.2 Add version comparison UI to `apps/desktop/src/renderer/src/components/SavedDecksTab.tsx`, including list diff, samples, matchups, win rate and turns; run `pnpm --filter @hdt/desktop typecheck`, expect exit 0; test legacy records show unavailable version.

## 10. Collection-aware preparation

- [ ] 10.1 Implement `packages/core/src/deck/collection-preparation.ts` with variant-aware ownership, craftability and class/format legality tests; assert `expect(result.missingCopies).toBe(0)` for normal plus golden ownership; run `pnpm exec vitest run packages/core/src/deck/collection-preparation.test.ts`, expect pass.
- [ ] 10.2 Integrate missing cards, cost and reasoned owned substitutes into `apps/desktop/src/renderer/src/components/DeckFinderTab.tsx` and `DeckEditor.tsx`; run `pnpm --filter @hdt/desktop typecheck`, expect exit 0; verify choosing a substitute updates counts and legality.

## 11. Delivery audit

- [ ] 11.1 Verify bilingual labels, persistence, idle/loading/error states and overlay/main reachability for every feature; record evidence in `openspec/changes/complete-tracker-enhancements/verification.md`.
- [ ] 11.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`; fix relevant failures and record exact results in `verification.md`.
- [ ] 11.3 Inspect desktop runtime and overlay layouts with representative records and live snapshots; audit each spec scenario against code and runtime evidence; only mark the full goal complete when all ten enhancements pass.

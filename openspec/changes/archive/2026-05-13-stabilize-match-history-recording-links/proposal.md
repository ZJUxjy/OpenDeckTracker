## Why

Phase 4 stats already records real constructed matches and renders them in the Stats page, but the current recording pipeline can treat one real game as multiple records because DeckTracker and Power.log completion paths build fingerprints from different, partially-known fields. The same instability also breaks the Stats page's recording drill-in: the specs require rows to open recordings by `fingerprint`, while the current UI falls back to matching recordings by `endedAt`.

This change is the first implementation step from the Stats gap investigation. It stabilizes the data foundation before adding larger UX surfaces like full match-history browsing, real play/coin detection, deck-scoped dashboards, or mulligan analysis.

## What Changes

- Define a stable match identity contract for constructed match history so duplicate completion writes for the same real game enrich one row instead of creating separate rows.
- Stop using volatile enrichment fields (`result`, `opponentClass`, `playOrder`, and late recorder timing drift) as the practical dedupe boundary between DeckTracker and Power.log completions.
- Ensure the Power.log completion path and DeckTracker match-ended path share the same fingerprint for the same game whenever they observe the same game lifecycle.
- Persist or expose enough recording identity metadata for completed recordings to be looked up by the matching `MatchHistoryRecord.fingerprint`.
- Update the Stats recent-match row behavior so `View recording` is enabled and opens by fingerprint, not by `endedAt` matching.
- Add tests that reproduce the investigated failures: duplicate unknown/result completions, recording lookup by fingerprint, and no false match when only `endedAt` happens to align.
- Keep the rest of Stats functionality unchanged.

Non-goals:

- No full match-history browser, pagination, search, or manual record correction UI.
- No play/coin inference implementation; existing `playOrder: 'unknown'` behavior can remain until a follow-up change.
- No deck-scoped whole-page Stats filtering beyond the existing saved-deck matchup table.
- No mulligan win-rate analysis or richer replay scrubber.
- No cloud sync or cross-device merge.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `match-history-stats`: Clarify stable real-game identity and require duplicate recorder paths to enrich a single row when they refer to the same game.
- `match-recordings`: Require recording storage and IPC to support lookup by match-history fingerprint for Stats drill-in.

## Impact

- `packages/core/src/stats/match-history.ts`: fingerprint/identity helper behavior and tests.
- `packages/core/src/tracker/deck-tracker.ts`: completed-match summary identity fields, if needed, so DeckTracker and Power.log paths can converge.
- `apps/desktop/src/main/power-match-recorder.ts`: reuse the stable in-progress match identity instead of emitting an independently-built volatile fingerprint.
- `apps/desktop/src/main/match-history-store.ts`: idempotent enrichment tests and any small store changes needed to merge duplicate partial completions safely.
- `apps/desktop/src/main/match-recording-recorder.ts` and `match-recording-store.ts`: recording metadata or lookup support keyed by match fingerprint.
- `apps/desktop/src/main/match-recordings-ipc.ts` / preload API: keep existing read-only IPC shape but make `recordings:get(fingerprint)` work for Stats rows.
- `apps/desktop/src/renderer/src/components/Stats.tsx`: remove `endedAt` recording lookup and drive the viewer with `match.fingerprint`.
- Tests in `packages/core`, `apps/desktop/src/main`, and `apps/desktop/src/renderer/tests`.

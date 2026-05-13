## Context

The current Stats pipeline has two independent completion writers:

- `DeckTracker` emits `match-ended` and writes a `completedMatch` with useful deck attribution but often `result: 'unknown'`, `playOrder: 'unknown'`, and `opponentClass: null`.
- `PowerMatchRecorder` observes live Power.log completion and writes a second `completedMatch` with the inferred win/loss result and class context from the latest snapshot.

Both paths call `recordCompletedMatch`, and both currently allow `normalizeCompletedMatch` to derive a fingerprint from partially-known fields. The legacy fingerprint includes volatile enrichment fields such as `endedAt`, `result`, `opponentClass`, and `playOrder`, so the two writes can miss the store's duplicate-enrichment path and become two persisted rows for one real game.

Match recordings have a related issue. A recording currently gets a timestamp/random `recordingId`, while `Stats.tsx` tries to find a recording for a recent match by joining `recordings.list()` on `endedAt`. The specs already expect `recordings:get(fingerprint)` to work for Stats rows, but the implementation has no durable fingerprint link.

No new external dependencies are needed. This change stays within `@hdt/core`, Electron main/preload, and renderer tests.

## Goals / Non-Goals

**Goals:**

- Make one live constructed game produce one durable match-history row even when multiple recorder paths complete it.
- Preserve enrichment semantics: a later Power.log result can upgrade an earlier unknown DeckTracker row, while a later unknown row cannot downgrade a known result.
- Make recording lookup from Stats exact by match fingerprint.
- Remove `endedAt` as the recording-correlation mechanism in the renderer.
- Keep existing read-only recording IPC channels and existing legacy recording-id lookup working.

**Non-Goals:**

- No full history browser, pagination, search, or editing.
- No play/coin inference.
- No rewrite of the recording viewer into a replay scrubber.
- No schema migration for `stats.sqlite` beyond what already exists.
- No cloud sync or cross-device identity.

## Decisions

### D1. Canonical live match identity lives in the desktop main process

**Context:** The identity must be available to the Power recorder, DeckTracker completion writer, and match-recording recorder. `@hdt/core` can build legacy fingerprints, but it does not observe all live main-process event ordering.

**Options:**

- **A.** Keep identity derivation inside `@hdt/core` by changing `buildMatchFingerprint`.
- **B.** Add a main-process `match-identity` helper that creates a stable live fingerprint on live Power.log `create-game` and exposes the current identity to all recorders.
- **C.** Let `MatchHistoryStore` infer duplicates by fuzzy time windows and merge rows after insert.

**Choice:** **B**.

**Rationale:** A still leaves each producer free to call the helper with different timestamps and enrichment fields. C is risky because time-window merging can collapse separate short games or miss delayed completions. B gives every live artifact for one game the same identity at the boundary where the app already sees the canonical lifecycle event: live `create-game`.

### D2. New live fingerprints must exclude enrichment fields

**Context:** A stable idempotency key cannot include fields that arrive later or differ by recorder path.

**Options:**

- **A.** Use the existing pipe-delimited `buildMatchFingerprint` shape.
- **B.** Create a safe live fingerprint such as `match-v2-<startedAtMs>-<sequence>` and keep `buildMatchFingerprint` as a fallback for non-live/test-only summaries.
- **C.** Hash every known field at completion time.

**Choice:** **B**.

**Rationale:** The live identity only needs to be stable within persisted local history and safe as a filesystem key when recordings use it. It must not depend on `result`, `opponentClass`, `playOrder`, `deckName`, or `endedAt`. A and C both reintroduce volatility. A also includes characters that are poor recording-directory names on Windows.

### D3. Normalize fingerprints at recorder boundaries

**Context:** `DeckTracker` currently builds a `NormalizedCompletedMatch` inside core. `PowerMatchRecorder` also normalizes before recording.

**Options:**

- **A.** Add identity plumbing deeply into `DeckTracker`.
- **B.** Keep core mostly unchanged and override/attach the current main-process live fingerprint immediately before each main-process recorder calls `recordCompletedMatch`.
- **C.** Store both fingerprints and choose one later in SQL.

**Choice:** **B**.

**Rationale:** This is the smallest cross-module change. Core can still emit a useful completed summary. The main process owns durable recording, so it is the right place to stamp the live idempotency key. If no live identity exists, the existing normalized fingerprint remains the fallback.

### D4. Recording summaries carry `matchFingerprint`

**Context:** Stats needs to know whether a recent match row has a recording before enabling its button.

**Options:**

- **A.** Set `recordingId` equal to the match fingerprint for all new recordings and infer availability from that.
- **B.** Add optional `metadata.matchFingerprint` / `summary.matchFingerprint`, use it as the Stats lookup map, and keep exact `recordingId` lookup for backward compatibility.
- **C.** Keep `endedAt` matching.

**Choice:** **B**, with new recordings allowed to use the live fingerprint as their recording id when available.

**Rationale:** B keeps old recordings loadable by their existing IDs and gives the renderer an explicit, non-ambiguous join key. A is attractive for new recordings but does not help legacy or manually-created test recordings by itself. C is the bug.

### D5. `recordings:get` remains one read-only IPC method

**Context:** Existing specs say no new recording-specific IPC channel is needed.

**Options:**

- **A.** Add `recordings:get-by-fingerprint`.
- **B.** Extend `recordings:get(idOrFingerprint)` to first load by recording id, then by `matchFingerprint` index/scan.

**Choice:** **B**.

**Rationale:** The renderer already has `window.hdt.recordings.get`. Extending lookup semantics is backward-compatible and keeps preload/API churn small.

### D6. Stats renderer uses fingerprint-only recording correlation

**Context:** The current `recordingByEndedAt` map can enable the wrong row.

**Options:**

- **A.** Keep `endedAt`, but add a tolerance window.
- **B.** Build `recordingByFingerprint` from `recordings.list()` summaries with `matchFingerprint`, and pass `match.fingerprint` to the viewer.
- **C.** Always enable the button and let the viewer show empty state.

**Choice:** **B**.

**Rationale:** It is exact and matches the spec. C avoids false negatives but creates a poor user path for matches without recordings. A preserves the underlying ambiguity.

## Risks / Trade-offs

- **[Compatibility] Existing recordings lack `matchFingerprint`.** They remain loadable by `recordingId`, but old Stats rows may not enable `View recording` unless they have a matching fingerprint. This is acceptable because `endedAt` matching was unreliable.
- **[Ordering] DeckTracker may end a match before live Power completion.** The main-process identity is created at live `create-game`, so both writers can still use it; the first write creates the row and the second enriches it.
- **[Startup mid-match] Recorders intentionally ignore replay events.** If no live identity exists, completion records fall back to legacy fingerprint behavior rather than inventing a fuzzy id.
- **[Filesystem] Fingerprints used as recording IDs must be Windows-safe.** The live fingerprint format avoids characters such as `:`, `|`, `?`, `*`, and path separators.
- **[Testing environment] `better-sqlite3` can be ABI-locked locally.** The implementation should keep pure core tests separate from SQLite tests, and document when a local rebuild is required.

## Migration Plan

1. Add the live match identity helper and wire it to live Power.log `create-game`.
2. Stamp the current live fingerprint onto PowerMatchRecorder and DeckTracker completed-match writes before calling `recordCompletedMatch`.
3. Add optional `matchFingerprint` metadata to recordings and summaries; use it for new recordings when available.
4. Extend recording store lookup so `recordings:get(fingerprint)` can resolve the matching recording.
5. Update Stats renderer to map recordings by `matchFingerprint` and pass `match.fingerprint` to the viewer.
6. Existing `stats.sqlite` rows and existing recording directories remain readable. No destructive migration is needed.
7. Rollback removes the new lookup/wiring; extra JSON metadata on recordings is harmless.

## Open Questions

- Should legacy recordings be backfilled by scanning nearby match-history rows once a reliable identity exists? This change does not backfill because `endedAt` was the unreliable input.
- Should `source` distinguish `deck-tracker` versus `power-log` after both paths merge? Current specs say `source` is initially `deck-tracker`; this change keeps that field unchanged unless implementation reveals a stronger need.

## Final touched-files tree

```text
packages/core/src/stats/
├── match-history.ts                 # MOD: live-safe identity helper or tests around fallback semantics
└── match-history.test.ts            # MOD

packages/core/src/recordings/
├── match-recording.ts               # MOD: optional matchFingerprint on metadata/summary
└── match-recording.test.ts          # MOD

apps/desktop/src/main/
├── match-identity.ts                # NEW
├── match-identity.test.ts           # NEW
├── power-match-recorder.ts          # MOD
├── power-match-recorder.test.ts     # MOD
├── deck-tracker.ts                  # MOD
├── deck-tracker.test.ts             # MOD
├── match-history-store.test.ts      # MOD
├── match-recording-recorder.ts      # MOD
├── match-recording-recorder.test.ts # MOD
├── match-recording-store.ts         # MOD
├── match-recording-store.test.ts    # MOD
├── match-recordings-ipc.ts          # MOD
└── match-recordings-ipc.test.ts     # MOD

apps/desktop/src/preload/
└── index.ts                         # MOD: type surface if summary type changes

apps/desktop/src/renderer/src/components/
└── Stats.tsx                        # MOD: fingerprint-based recording lookup

apps/desktop/src/renderer/tests/
├── Stats.test.tsx                   # MOD
└── MatchRecordingViewer.test.tsx    # MOD if needed
```

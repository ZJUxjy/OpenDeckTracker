# Card Image Bulk Download Design

## Context

OpenDeckTracker already downloads card images on demand via `card-image-cache.ts`:
render images (`zhCN/256x/*.png` with `enUS` fallback) and trimmed tile images
(`tiles-v2/*.png`). This works well during gameplay but causes visible pop-in the
first time a card is revealed, especially on slower connections.

The project also ships a CLI helper `scripts/download-card-images.ts` that can
download all collectible card images in one shot. That script is not integrated
into the desktop app, has no pause/resume support, and does not persist progress.

This design adds an in-app "bulk pre-download" feature that downloads every image
needed for the current collectible card pool, with pause/resume, graceful abort,
and progress persistence across app restarts.

## Goals

- Let users pre-download all collectible card images from inside the desktop app.
- Support two image types independently: 256x renders and trimmed tiles.
- Allow the user to pause, resume, or abort the download at any time.
- Persist progress to disk so a paused or crashed download can resume on the next
  app launch.
- Skip already-cached images on resume (true断点重传).
- Report progress to the renderer in real time.
- Be robust against transient network failures, CDN 404s, disk-full conditions,
  and abrupt process termination.

## Non-Goals

- Do not download non-collectible cards (tokens, hero powers, etc.) in the first
  slice; the on-demand cache already handles those.
- Do not implement automatic background sync on every card-data update; the user
  must explicitly start the bulk download.
- Do not build the renderer Settings UI in this slice; only the main-process
  orchestrator, storage, and IPC surface are required.
- Do not support downloading images for multiple locales in one run; the primary
  locale (`zhCN`) and its fallback (`enUS`) are handled by the existing cache.

## Data Model

### Progress file

`<userData>/card-images/bulk-download-progress.json`

```ts
export const BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION = 1;

export interface BulkDownloadProgress {
  schemaVersion: typeof BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION;
  startedAt: string;
  updatedAt: string;
  /** All card IDs that should be downloaded in this run. */
  cardIds: string[];
  /** Card IDs where every requested image type is already cached or was successfully downloaded. */
  completedCardIds: string[];
  /** Card IDs where at least one requested type permanently failed on the last attempt. Retried on resume. */
  failedCardIds: string[];
  /** True if the user explicitly paused the last run. */
  paused: boolean;
  /** Last explicit stop time, if any. */
  stoppedAt?: string;
  /** Which image types are included in this run. */
  types: BulkDownloadType[];
  /** Aggregate statistics across all sessions for this run. */
  stats: BulkDownloadStats;
}

export type BulkDownloadType = 'render' | 'tile';

export interface BulkDownloadStats {
  downloadedRenders: number;
  downloadedTiles: number;
  skippedRenders: number;
  skippedTiles: number;
  failed: number;
}
```

### Status type

```ts
export type BulkDownloadState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed-with-errors'
  | 'failed';

export interface BulkDownloadStatus {
  state: BulkDownloadState;
  progress: {
    completed: number;
    total: number;
    failed: number;
    currentCardId: string | null;
  };
  stats: BulkDownloadStats;
}
```

## Architecture

```text
renderer (future Settings UI)
    ↓ IPC invoke / progress events
apps/desktop/src/main/card-image-download/ipc.ts
    ↓
CardImageBulkDownloadOrchestrator
    ↓ reads/writes
storage.ts (bulk-download-progress.json)
    ↓ downloads via
apps/desktop/src/main/card-image-cache.ts
    ↓
art.hearthstonejson.com CDN
```

New files:

- `apps/desktop/src/main/card-image-download/index.ts` — public types and exports.
- `apps/desktop/src/main/card-image-download/orchestrator.ts` — core state machine.
- `apps/desktop/src/main/card-image-download/storage.ts` — progress persistence.
- `apps/desktop/src/main/card-image-download/ipc.ts` — IPC wiring.
- `apps/desktop/src/main/card-image-download/orchestrator.test.ts` — unit tests.
- `apps/desktop/src/main/card-image-download/storage.test.ts` — unit tests.
- `apps/desktop/src/main/card-image-download/ipc.test.ts` — IPC tests.

## State Machine

```text
                    start()
idle  ──────────────► running
 ▲                    │
 │           pause()  │ abort()
 │◄───────────────────┤
 │    paused          │
 │                    │
 │ resume()           │
 └────────────────────┘

running ──all done──► completed
running ──done with failures──► completed-with-errors
running ──unrecoverable error──► failed
```

- `start()` begins a new run. If a progress file exists with `paused: true`, it
  resumes that run instead.
- `pause()` aborts in-flight downloads and writes `paused: true` to disk.
- `resume()` is equivalent to `start()` on a paused run.
- `abort()` stops the run and clears the in-memory orchestrator state. The
  progress file is preserved so `start()` can resume later.

## Download Flow

1. **Build card list**
   - Read `data/cards/generated/cards.collectible.<primaryLocale>.json`.
   - Filter to `collectible: true` cards and sort by `id` for stable ordering.

2. **Resume or start fresh**
   - Load existing progress.
   - If `cardIds` differ from the current card pool, recompute `cardIds` and keep
     the intersection with `completedCardIds` (cards that disappeared from the
     pool are dropped; new cards are added).
   - Compute `pendingCardIds = cardIds - completedCardIds`.

3. **Download loop**
   - Use a bounded concurrency pool (default 8 parallel downloads).
   - For each pending card, sequentially fetch requested types:
     - `ensureCardImageCached(cardId, { force: false, ... })` for `render`.
     - `ensureCardTileCached(cardId, { force: false, ... })` for `tile`.
   - Each type is independent: one can succeed while the other fails.
   - If the `AbortSignal` fires, stop scheduling new work and let in-flight
     requests finish or reject. Save progress before returning.

4. **Per-card completion**
   - If all requested types are cached successfully, move the card to
     `completedCardIds`.
   - If any type permanently fails (non-retryable error or retries exhausted),
     move the card to `failedCardIds` and increment `stats.failed`.
   - Update `updatedAt` and persist progress after every 10 cards or every 5
     seconds, whichever comes first, and again after the final card.

5. **Finish**
   - If `failedCardIds` is empty → `completed`.
   - If `failedCardIds` is non-empty → `completed-with-errors`.
   - Keep the progress file so the user can inspect which cards failed.

## Error Handling and Robustness

| Scenario | Handling |
|----------|----------|
| Network blip | `fetchWithRetry` already retries 3 times with exponential backoff. |
| CDN 404 / non-retryable 4xx | Mark that type as failed for the card; continue with other cards. |
| User pauses | AbortController signals; in-flight requests are cancelled or finish; progress is saved. |
| App crash or quit | Next launch reads progress file; state becomes `paused`; user can resume. |
| Disk full at start | Estimate required space (pending count × 350 KB average per requested type); if free space < estimate × 1.2 + 500 MB, return `insufficient-disk-space` before starting. |
| Disk full mid-run | Check free space every 50 cards; if it drops below 500 MB, pause and persist progress. |
| Corrupt progress file | Treat as missing; start a fresh run. |
| Temp file left behind | `writeBufferAtomic` writes to `.tmp` then renames; leftover `.tmp` files are harmless. |
| Concurrency safety | Single orchestrator instance in main process; `start()` rejects if already running. |

## Concurrency and Rate Control

- Default concurrency: 8 parallel card downloads.
- Each card download internally serializes its requested types (render then tile)
  to avoid two temp files for the same card.
- `ensureCardImageCached` / `ensureCardTileCached` already deduplicate concurrent
  downloads for the same card, so overlapping UI-triggered on-demand fetches do
  not cause double network traffic.

## IPC Surface

Channels:

- `card-image-bulk-download:start` — payload `{ types: BulkDownloadType[], force?: boolean }`.
- `card-image-bulk-download:pause`
- `card-image-bulk-download:resume`
- `card-image-bulk-download:abort`
- `card-image-bulk-download:status` — returns `BulkDownloadStatus`.
- `card-image-bulk-download:progress` — main → renderer push event.

Start semantics:

- If no progress file exists, start a new run.
- If a progress file exists and `paused === true`, resume.
- If `force === true`, discard the old progress file and start fresh.
- If already `running`, return `{ ok: false, error: 'already-running' }`.

## Preload API (future UI hookup)

```ts
cardImages: {
  // ... existing get / getTile
  bulkDownload: {
    start: (types: BulkDownloadType[], force?: boolean) => Promise<StartResult>;
    pause: () => Promise<void>;
    resume: () => Promise<StartResult>;
    abort: () => Promise<void>;
    getStatus: () => Promise<BulkDownloadStatus>;
    onProgress: (cb: (status: BulkDownloadStatus) => void) => () => void;
  };
}
```

## Integration into Main Process

In `apps/desktop/src/main/ipc.ts`, after the popular-decks sync setup:

1. Construct `CardImageBulkDownloadOrchestrator` with:
   - `cacheRoot: join(app.getPath('userData'), 'card-images')`
   - `getCardIds: () => Promise<string[]>` — resolves the current collectible card pool. The concrete loader reads `data/cards/generated/cards.collectible.zhCN.json` using the same path-resolution strategy as `cards.ts` (try `process.resourcesPath`, then monorepo root, then `process.cwd()`).
   - `fetchImpl: (url, init) => net.fetch(url, init)`
2. Call `registerCardImageBulkDownloadIpc(orchestrator)`.
3. On `before-quit`, call `orchestrator.abort()`.

## Testing

Unit tests for the orchestrator:

- State transitions: idle → running → paused → running → completed.
- `start()` rejects when already running.
- Pause aborts in-flight work and persists progress.
- Resume continues from progress file, skipping completed cards.
- Failed cards are retried on resume and recorded in `failedCardIds`.
- `force: true` discards old progress.
- Corrupt progress file is treated as missing.

Unit tests for storage:

- Load missing file returns null.
- Save and load round-trip.
- Malformed JSON returns null.
- Atomic write does not leave partial files.

IPC tests:

- `start` / `pause` / `resume` / `abort` handlers delegate correctly.
- Progress events are broadcast to renderer windows.

Mock fetch tests:

- Successful download increments `stats.downloadedRenders` / `downloadedTiles`.
- Existing files increment `stats.skipped*` and do not trigger fetch.
- 404 response increments `stats.failed`.

Verification commands:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/
pnpm --filter @hdt/desktop typecheck
```

## Future Work

- Expose the feature in Settings UI with progress bar and failure list.
- Allow automatic resume when the app launches if `paused === true`.
- Extend to non-collectible cards (tokens, hero powers) used by the current deck.
- Support additional locales beyond the primary + fallback pair.

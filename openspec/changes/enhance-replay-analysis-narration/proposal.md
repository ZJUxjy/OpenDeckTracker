## Why

The current match recording feature preserves raw Power events and a conservative timeline, but it is still too low-level for post-game review or model-assisted analysis. This change builds on the existing DEVELOPMENT_PLAN direction for durable replay/statistics surfaces by adding a focused, independently deliverable layer that turns live game progress into stable analysis records and natural-language narration without replacing the tracker core.

## What Changes

- Add a live game-progress narration pipeline that converts important public match events into concise Chinese natural-language statements suitable for later LLM input.
- Extend match recordings with analysis-ready derived records so replay review can inspect structured events and their corresponding narration after a game ends.
- Keep narration deterministic and sourced from public/log-derived state only, with source event references for debugging and replay re-projection.
- Expose read-only IPC for retrieving recording analysis/narration together with recording detail.
- Add tests for replay projection, hidden-information protection, event ordering, and narration output.

Non-goals:

- Do not call any remote LLM provider or add API-key management in this change.
- Do not implement strategic recommendations, win-rate prediction, or automated coaching UI.
- Do not simulate full Hearthstone rules; derived analysis remains conservative and event-log based.
- Do not expose hidden opponent hand/deck identities beyond cards revealed by public game events.
- Do not redesign the recording viewer UI beyond what is needed to surface the new analysis data.

## Capabilities

### New Capabilities

- `game-progress-narration`: Converts live and replayed public game-progress events into structured analysis events and Chinese natural-language narration frames suitable for LLM ingestion.

### Modified Capabilities

- `match-recordings`: Persist and expose analysis-ready event records and narration frames alongside existing raw events, timeline, metadata, and recording detail.

## Impact

- Affected packages: `packages/hearthwatcher`, `packages/core`, and `apps/desktop`.
- Affected app surfaces: Electron main-process recording host, preload IPC typing, recording detail API, and Stats recording viewer data loading.
- Storage impact: recording files gain additive analysis/narration fields; legacy recordings remain loadable and may return empty analysis/narration arrays.
- Testing impact: add pure projector/narrator unit tests plus main-process recording store compatibility tests.

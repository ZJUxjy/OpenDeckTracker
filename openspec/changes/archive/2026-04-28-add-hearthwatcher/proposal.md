## Why

The current tracker depends mainly on HearthMirror memory snapshots, which can show the current board/deck/hand shape but cannot reliably explain how an entity got there. This blocks the next DEVELOPMENT_PLAN step: using Hearthstone logs as the primary event source so the tracker can distinguish original deck cards from cards created, discovered, stolen, transformed, or otherwise introduced during play.

## What Changes

- Add a new `@hdt/hearthwatcher` workspace package that monitors Hearthstone log files, starting with `Power.log` and minimal loading-screen state.
- Implement a live log tailer that handles append-only writes, partial lines, truncation, rotation, missing files, and diagnostic status without blocking the Electron main process.
- Parse core `Power.log` records into typed events: `CREATE_GAME`, `FULL_ENTITY`, `SHOW_ENTITY`, `HIDE_ENTITY`, `CHANGE_ENTITY`, `TAG_CHANGE`, `BLOCK_START`, `BLOCK_END`, and `SHUFFLE_DECK`.
- Add a log-driven game-state reducer/adapter that updates entity card IDs, controllers, zones, visibility, mulligan state, and origin metadata for use by deck tracking.
- Integrate HearthWatcher into the desktop main process as the preferred live event source, while keeping HearthMirror as a fallback and metadata source.
- Add fixture-based parser and reducer tests so future Hearthstone log format changes are caught early.

### Non-goals

- Do not replace HearthMirror completely; it remains useful for deck selection, match metadata, and fallback reads when logs are unavailable.
- Do not implement the full HDT KnownCardIds prediction system in this change.
- Do not build replay UI, statistics storage, overlay rendering, or deck-management features.
- Do not implement advanced Arena, Battlegrounds, Mercenaries, or Tavern Brawl mode-specific parsing beyond exposing raw mode tags when present.
- Do not silently edit the user's Hearthstone `log.config`; this change should detect missing logs and report actionable diagnostics.

## Capabilities

### New Capabilities

- `hearthwatcher-log-ingestion`: Monitors Hearthstone log files, parses `Power.log` and loading-screen lines into typed events, and derives live entity state from those events.

### Modified Capabilities

- `deck-tracker-core`: Consume log-derived entity origin and zone metadata so remaining-card logic can distinguish original deck entities from generated or stolen entities even when card IDs match.

## Impact

- Adds `packages/hearthwatcher/` with TypeScript runtime code, fixtures, and Vitest coverage.
- Updates workspace/package configuration so `@hdt/hearthwatcher` can be built and tested with the monorepo.
- Extends `@hdt/core` integration points for event-driven entity updates and origin metadata population.
- Adds desktop main-process wiring and renderer-visible diagnostics for watcher status, log availability, and parser errors.
- Introduces no breaking public API changes; existing HearthMirror polling remains available during migration.

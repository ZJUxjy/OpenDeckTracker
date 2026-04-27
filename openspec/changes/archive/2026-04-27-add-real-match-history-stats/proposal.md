## Why

The Stats page currently presents hardcoded match history, winrate, and class matchup data, which makes the UI look functional while the project has no durable record of real matches. This change delivers the P3 `add-stats` direction from `docs/development-direction.md` as a focused, independently shippable slice: record completed constructed matches from the live tracker and show only real or empty-state data in Stats.

## What Changes

- Add a real match-history capability that records completed matches with deck, opponent, result, duration, play/draw, format, timestamps, and source metadata.
- Persist match records locally so Stats survives app restarts and can be queried by time filter.
- Connect the Electron main process to the existing tracker/watchers so a match is written once when the tracker observes a completed game.
- Replace the Stats page mock arrays and hardcoded summary cards with data loaded from the real match-history store.
- Show explicit empty states when no real matches exist instead of fabricated wins, losses, class winrates, or recent games.
- Add tests for recording, deduplication, aggregation, IPC, and renderer empty/loaded states.

Non-goals:

- No cloud sync, account login, or cross-device history.
- No full deck-management database redesign beyond the fields needed to identify the deck used in a match.
- No manual match editing, import/export, replay viewer, or detailed turn timeline.
- No Battlegrounds, Arena, Tavern Brawl, Mercenaries, or non-constructed stats unless the existing match metadata can safely classify them as constructed.
- No opponent deck archetype detection beyond opponent class/name metadata already available from live data.

## Capabilities

### New Capabilities

- `match-history-stats`: Records real completed matches locally and exposes recent matches plus aggregate stats for the Stats page.

### Modified Capabilities

- `deck-tracker-core`: The tracker event contract must provide enough completed-match metadata for the stats recorder to persist one match per real game.

## Impact

- `packages/core`: Add stats/match-history domain types, aggregation functions, and a recorder boundary that consumes completed tracker snapshots/events.
- `apps/desktop/src/main`: Add a match-history repository/host, local persistence wiring, and IPC handlers for Stats queries.
- `apps/desktop/src/preload`: Expose typed match-history query APIs to the renderer.
- `apps/desktop/src/renderer`: Replace `Stats.tsx` mock data with store/query-driven real data and empty states.
- `packages/hearthwatcher` / `packages/core` integration: May need small event metadata additions to determine match result and play/draw reliably.
- Local storage: Introduce or extend the app-local SQLite/data store for durable match records.

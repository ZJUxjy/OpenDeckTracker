## Why

The desktop app already has live HearthMirror data, saved-deck storage, and real match-history stats, but several views still degrade when Hearthstone is not running or when a match record lacks complete attribution. This change continues the data-persistence and stats work from `DEVELOPMENT_PLAN.md` by closing the local offline-state loop rather than introducing new product areas.

## What Changes

- Persist the last known local player identity (`accountId`, BattleTag, and timestamp) in the Electron main process and use it as the header fallback when Hearthstone is not running.
- Clean up the main header so the player block is display-only: remove the notification bell, remove the dropdown chevron, and keep only non-clickable hover styling for the player identity.
- Persist saved-deck attribution in match history (`savedDeckId`, `savedDeckVersion`) and ensure completed match records carry deck, player class, opponent class, and result whenever those values are available.
- Add saved-deck-aware stats aggregation so the Stats page can show "Deck A vs each opponent class" win/loss/winrate.
- Cache live Hearthstone deck snapshots into the existing saved-deck system so the Decks page can show the user's known decks when the game is not running.
- Cache HearthMirror collection snapshots so the Collection page can show last known progress offline, with a visible stale-data state.
- Add focused tests for persistence migrations, aggregation semantics, preload IPC, and renderer empty/cache states.

Non-goals:

- No cloud sync, cross-device merge, account authentication, or remote profile service.
- No destructive reconciliation that overwrites user-edited saved decks without an explicit match/update policy.
- No changes to HearthMirror native reflection paths or HearthWatcher log parsing grammar beyond consuming data they already expose.
- No new notification center, player dropdown menu, or social/profile screen.
- No redesign of the Stats, Decks, or Collection pages beyond the controls and data surfaces needed for this change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `hearthmirror-ui-integration`: Header player identity becomes a persisted fallback display surface, and non-functional notification/dropdown affordances are removed.
- `match-history-stats`: Match history stores saved-deck attribution and exposes deck-vs-opponent-class stats derived from persisted records.
- `deck-management`: Live Hearthstone deck snapshots are cached into local saved-deck storage so deck information remains available offline.
- `collection-progress`: Collection progress can use the last successful live collection snapshot when HearthMirror is unavailable.

## Impact

- `apps/desktop/src/main`: new or extended stores for player profile, collection snapshots, deck snapshot sync, stats persistence, and IPC registration.
- `apps/desktop/src/preload/index.ts`: additive APIs for profile/status fallback and saved-deck matchup stats; collection progress response gains cache metadata.
- `apps/desktop/src/renderer/src`: header cleanup, HearthMirror status fallback, Stats deck matchup selector/chart, Decks offline sync behavior, Collection stale-cache banner.
- `packages/core/src/stats`: pure saved-deck matchup aggregation and type additions.
- SQLite migrations for `stats.sqlite` and, if needed, additive metadata in `decks.db` or a companion local-state database.
- Tests in `packages/core`, `apps/desktop/src/main`, and `apps/desktop/src/renderer/tests`.

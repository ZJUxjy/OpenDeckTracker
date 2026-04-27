## Context

The current application can identify the local player's deck, track remaining local card copies, animate draw events, and show a remote card image on hover. Opponent information is limited to counts and board entities already exposed by `getBoardState`; revealed opponent cards are not persisted into a user-facing history, and opponent cards that leave play are not displayed as a graveyard record.

The renderer still contains legacy prototype branding in some places, and hover images currently resolve directly to `https://art.hearthstonejson.com/...` URLs. Direct remote URLs work for a prototype but cause repeated network dependency, slow first hover, and no predictable offline behavior.

Current dependency/version status from workspace manifests:

- Electron: `^33.4.11`
- Node engine: `>=20`
- React: `^18.3.1`
- Zustand: `^5.0.12`
- No new runtime dependency is required for this change; Node/Electron main can use built-in `fetch`, `fs`, `path`, and Electron protocol/IPC APIs.

## Goals / Non-Goals

**Goals:**

- Track opponent revealed cards from live match snapshots without leaking hidden hand/deck contents.
- Preserve opponent cards that disappear from board/visible zones as graveyard history.
- Add a renderer sidebar dedicated to opponent revealed/graveyard cards.
- Rename user-facing application identity to `OpenDeckTracker`.
- Cache card art locally for hover previews, supporting both pre-download and lazy first-request download.
- Keep hover previews functional while replacing direct remote image usage with local cached URLs when available.

**Non-Goals:**

- No opponent deck prediction, archetype inference, or hidden-card reveal.
- No full match-history database schema for opponent plays beyond in-memory match state.
- No global visual redesign beyond layout needed for the new opponent sidebar and branding cleanup.
- No new image CDN provider selection UI.
- No macOS/Linux-specific cache path work beyond using Electron's app userData path abstraction.

## Decisions

### Decision 1: Track opponent history in core match state

**Context:** `Game` already has `opposingPlayer`, and `DeckTracker.applyEntitySnapshots` already ingests opposing board entities. The current snapshot omits opponent revealed history and only exposes `opposingHandCount`.

**Options:**

- Keep opponent tracking purely in renderer by diffing board rows.
- Add opponent state to `@hdt/core` and expose it through `DeckTrackerSnapshot`.
- Wait for future Power.log parsing and do nothing with memory polling.

**Choice:** Add opponent revealed/graveyard tracking to `@hdt/core` and expose it in `DeckTrackerSnapshot`.

**Rationale:** Core owns canonical match state and already handles entity lifecycle. Renderer-only diffing would be fragile across route reloads and overlay windows. Waiting for logs blocks a useful subset that current memory snapshots can support.

### Decision 2: Do not record hidden opponent hand/deck cards

**Context:** Hearthstone only reveals some opponent cards. A tracker must not invent hidden opponent card identities from counts.

**Options:**

- Track all opponent entities including empty card IDs.
- Track only non-empty opponent card IDs observed in visible zones.
- Track only opponent graveyard, not board/played cards.

**Choice:** Track only opponent entities with non-empty `cardId` that have appeared in public zones such as `PLAY`, `GRAVEYARD`, or `SECRET` once revealed.

**Rationale:** This respects information boundaries while still providing a useful opponent history. Empty card IDs and counts remain aggregate-only.

### Decision 3: Represent opponent sidebar data as copy-level records plus aggregate display

**Context:** Opponent may play multiple copies of the same card. The UI should support both chronological records and compact counts.

**Options:**

- Store only aggregate `{ cardId, count }`.
- Store only chronological entity records.
- Store entity/copy records in core and aggregate in renderer where needed.

**Choice:** Store and expose copy-level opponent records with `cardId`, `entityId`, `zone`, and last-known timestamp/order; renderer can group by card for display.

**Rationale:** Copy-level state preserves chronology and avoids losing detail. Aggregation is cheap and presentation-specific.

### Decision 4: Use main-process image cache with IPC/protocol serving

**Context:** Renderer currently receives remote image URLs. Local files should be served safely without exposing arbitrary filesystem paths or relying on `file://` behavior in renderer.

**Options:**

- Renderer downloads images directly into IndexedDB/cache storage.
- Main process downloads images and exposes `hdt-card-image://...` or IPC-resolved local URLs.
- Bundle all images into the application package.

**Choice:** Main process owns download/cache and serves cached images through a controlled app protocol or equivalent IPC-generated local URL. The cache root lives under Electron `app.getPath('userData')/card-images`.

**Rationale:** Main process can use Node filesystem APIs and centralize cache policy. It avoids duplicating downloads across windows and keeps renderer code simple. Bundling all images would bloat installers and would still need updates.

### Decision 5: Support both lazy cache and pre-download script

**Context:** Users may prefer no upfront download, while development/packaging may benefit from warming cache.

**Options:**

- Lazy-only: download on first hover.
- Pre-download-only: require all images before use.
- Support both paths sharing the same cache writer and URL construction.

**Choice:** Implement shared cache utilities used by a `cards:images` script and by runtime lazy fetch.

**Rationale:** Lazy loading keeps first run light; pre-download improves demos/offline use. Shared code reduces mismatch between script and app behavior.

### Decision 6: Rename branding by text/config, not package namespace

**Context:** Workspace package names use `@hdt/*`. Renaming all package scopes would be high churn and unrelated to user-facing identity.

**Options:**

- Rename every package from `@hdt/*` to `@opendecktracker/*`.
- Rename user-facing app metadata and documentation only.
- Do nothing until a packaging release.

**Choice:** Rename product-facing strings, app metadata, HTML title, README, test expectations, and release/docs references to `OpenDeckTracker`; keep internal package scope as `@hdt/*` for now.

**Rationale:** This satisfies the user-facing project rename with low risk. Package namespace migration can happen separately if publishing public packages becomes a requirement.

## Final Directory Shape

```text
apps/desktop/
  src/main/
    card-image-cache.ts
    cards.ts
    ipc.ts
  src/preload/
    index.ts
  src/renderer/src/
    components/
      LiveDeckPanel.tsx
      OpponentCardsPanel.tsx
      CardImagePopover.tsx
    hooks/
      use-card-image-url.ts
    stores/
      deck-tracker-store.ts
packages/core/src/
  game/
    game.ts
    entity.ts
    player.ts
  tracker/
    deck-tracker.ts
    opponent-cards.ts
scripts/
  download-card-images.ts
resources/
  card-images/README.md
```

## Risks / Trade-offs

- [Risk] Memory polling does not observe all opponent card transitions, especially battlecries/spells that never persist on board. -> Mitigation: track the subset visible from current reflectors and define log parsing as a future enhancement.
- [Risk] Opponent entity IDs may disappear before a poll sees the card. -> Mitigation: keep behavior conservative and never synthesize hidden cards.
- [Risk] Lazy image download can still fail offline on first hover. -> Mitigation: show existing failure UI and support pre-download script for offline preparation.
- [Risk] Cache can grow over time. -> Mitigation: cache by locale/size/cardId with deterministic paths and add future cache pruning as a separate setting if needed.
- [Risk] Serving local files can expose paths if implemented with raw `file://`. -> Mitigation: use a controlled protocol or IPC path mapping rooted under the cache directory.
- [Risk] Branding rename can miss strings in tests/docs. -> Mitigation: add source scans/tests for legacy Fireplace/FIRESTONE labels.

## Migration Plan

1. Add core snapshot fields for opponent revealed/graveyard cards while keeping existing fields backward-compatible.
2. Add renderer opponent sidebar behind the live tracker route and overlay layout.
3. Add image cache APIs and switch hover image hook to cached URLs.
4. Add `cards:images` script for optional pre-download.
5. Rename user-facing product strings to `OpenDeckTracker`.
6. Update tests and docs.

Rollback strategy: keep direct remote image URL fallback in the renderer hook until cache behavior is proven; if cache serving fails, hover previews can temporarily fall back to the current CDN URL logic.

## Open Questions

- Should the opponent sidebar group cards by zone first (`Played`, `Graveyard`) or use tabs? Default implementation will use two sections in one sidebar.
- Which locale should pre-download use by default? Default implementation will use `zhCN` primary and `enUS` fallback to match current hover behavior.
- Should card image cache size be configurable in settings? Not in this change unless implementation reveals a hard need.

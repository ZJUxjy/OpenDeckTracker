## Why

The tracker can now follow the local player's in-match deck, but it still lacks the opponent-side record that users expect from a practical deck tracker, and the UI still carries legacy Fireplace/FIRESTONE naming from the prototype. This change is the next productization step after the current live-deck milestone in the development plan: it turns the working local tracker into a clearer OpenDeckTracker experience with opponent history and reliable card art.

## What Changes

- Add opponent-card tracking for cards the opponent has revealed by playing, summoning, or moving into graveyard-visible zones.
- Display opponent revealed cards and opponent graveyard cards in a new sidebar distinct from the local deck sidebar.
- Rename the product from Fireplace/FIRESTONE-style labels to `OpenDeckTracker` in package metadata, app chrome, HTML title, tests, and user-facing documentation.
- Add a local card-image cache that can be populated either by a pre-download script or by lazy downloading on first image request.
- Serve subsequent card-image requests from local cache without repeated network fetches.
- Preserve existing hover behavior while changing the source of image URLs to the cached/local-serving path where available.

Non-goals:

- Do not infer unrevealed opponent deck contents or show hidden opponent hand/deck identities.
- Do not implement full opponent deck archetype prediction.
- Do not redesign the entire renderer layout beyond adding the opponent sidebar and brand text changes.
- Do not require network access for normal tracker operation after images are cached.
- Do not replace the current card database conversion pipeline.

## Capabilities

### New Capabilities

- `card-image-cache`: Local caching and serving of card image assets for hover previews.
- `app-branding`: User-facing application identity uses OpenDeckTracker consistently.

### Modified Capabilities

- `deck-tracker-core`: Track and expose revealed opponent cards and opponent graveyard state for renderer sidebar display.

## Impact

- `packages/core`: Extend match state, snapshot shape, and tests for opponent revealed/graveyard tracking.
- `packages/hearthmirror`: Reuse existing board/hand/deck/opponent-secret reflectors where possible; add only minimal facade shape changes if needed.
- `apps/desktop/src/main`: Add card-image cache IPC or protocol handling, cache directory policy, and optional prefetch integration.
- `apps/desktop/src/preload`: Expose image-cache APIs to renderer if IPC is used.
- `apps/desktop/src/renderer`: Add opponent sidebar, update hover image source handling, remove legacy Fireplace/FIRESTONE labels, and update tests.
- `scripts`: Add card-image pre-download script.
- `README.md`, `package.json`, app HTML metadata, and tests: Update branding and usage notes.

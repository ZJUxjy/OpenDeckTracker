## ADDED Requirements

### Requirement: Local card image cache

The desktop app SHALL cache card images locally and serve hover previews from the local cache whenever possible.

The cache MUST:

- Store images under an application-controlled cache root.
- Key files by locale, size, and `cardId`.
- Support `zhCN` primary image lookup with `enUS` fallback.
- Avoid repeated network downloads for a card image that already exists locally.
- Return a stable local URL or renderer-safe source for cached images.
- Fall back to the existing remote image URL behavior only when local cache resolution fails.

#### Scenario: First hover downloads and caches image

- **WHEN** a user hovers a card whose image is not present in the local cache
- **THEN** the app downloads the primary locale image or fallback locale image
- **AND** stores the successful image in the local cache
- **AND** displays the image in the hover popup

#### Scenario: Subsequent hover uses local cache

- **WHEN** a user hovers the same card after its image has been cached
- **THEN** the hover popup uses the cached local image
- **AND** no network request is made for that card image

#### Scenario: Missing primary locale falls back

- **WHEN** the primary locale image request fails for a card
- **THEN** the app attempts the fallback locale image
- **AND** caches and serves the fallback image if it succeeds

### Requirement: Card image pre-download script

The repository SHALL provide a script that pre-downloads card images for generated card data into the same cache layout used by runtime lazy loading.

The script MUST:

- Be runnable from the root workspace through a package script.
- Read generated card data from `data/cards/generated/`.
- Accept locale and size options with defaults matching runtime hover behavior.
- Skip files already present in the cache unless a force option is provided.
- Report counts for downloaded, skipped, failed, and total cards.
- Exit non-zero when required card data is missing or when all requested downloads fail.

#### Scenario: Pre-download skips existing cache entries

- **WHEN** the script is run and some requested image files already exist
- **THEN** those files are counted as skipped
- **AND** the script does not re-download them unless force mode is enabled

#### Scenario: Runtime and script share paths

- **WHEN** the pre-download script caches `EX1_277` for the configured locale and size
- **THEN** a later runtime hover for `EX1_277` resolves to that same cached file

### Requirement: Cached image serving boundary

The app SHALL serve cached image files to the renderer only through a controlled cache boundary.

The implementation MUST:

- Reject path traversal outside the card image cache root.
- Only serve supported image extensions used by the cache.
- Avoid exposing arbitrary absolute filesystem paths to renderer components.

#### Scenario: Invalid cache path is rejected

- **WHEN** renderer code requests an image path containing traversal outside the cache root
- **THEN** the main process or protocol handler rejects the request
- **AND** no arbitrary local file is served

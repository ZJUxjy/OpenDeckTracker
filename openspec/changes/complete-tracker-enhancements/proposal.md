## Why

The tracker already records decks, public actions, effects and matches, but players still have to calculate draw odds and resource risks and manually connect observations to post-match learning. This extends the implemented tracking and statistics phases in DEVELOPMENT_PLAN.md into a complete player-facing analysis workflow.

## What Changes

- Add selectable key-card draw odds, including alternative answers and combined components, respecting known deck positions.
- Track public opponent hand history by entity, acquisition turn, mulligan retention and known generation source.
- Add secret candidates, evidence-based exclusions and reversible manual corrections.
- Add editable key-resource groups with observed consumption and explicitly predicted remaining opponent resources.
- Add fatigue and overdraw forecasts for planned and known upcoming draws.
- Extend damage analysis to supported hand damage and hero powers with mana-aware action sequences and explicit unsupported-mechanic limits.
- Add personal mulligan statistics by deck, opponent class and play order with sample counts.
- Add key-turn replay navigation, board reconstruction, bookmarks and notes.
- Persist deck versions and compare list changes and version-specific performance.
- Add collection-aware missing copies, crafting costs and legal substitute suggestions.

## Capabilities

### New Capabilities
- `tracker-enhancement-suite`: Integrated live analysis, historical learning and collection-aware deck preparation.

### Modified Capabilities
None. Existing tracking, recording and deck management contracts remain compatible; the new suite adds consumers and additive data.

## Non-goals

- Automated game inputs, revealing hidden opponent identities, a complete Hearthstone simulation engine, cloud account synchronization, and the unrelated desktop shell migration.
- All ten requested enhancements remain in scope; staged implementation does not reduce the completion criteria.

## Impact

Core tracker projections and calculations; recording and deck persistence; shared IPC types; desktop main/preload; React tracker, stats, replay and deck views; bilingual labels; regression and integration tests. Deliver as one integrated local desktop feature set, using existing providers and storage.

## Context

Existing core snapshots carry remaining copies, hand, deck positions, board damage and effects. Advisor has an at-least-one draw probability helper. Public action recording, saved decks, collection and statistics already exist. The suite extends these actual paths rather than creating isolated demonstration screens.

## Goals / Non-Goals

Goals: all ten proposal enhancements usable from the desktop and relevant overlays, with persistent user preferences, bilingual UI, trustworthy uncertainty and regression coverage.
Non-goals: automated play, hidden-information access, a universal game simulator, new cloud services or shell migration.

## Decisions

### Shared pure analysis
Context: both advisor and direct UI need consistent arithmetic.
Options: duplicate renderer arithmetic; call AI; shared core functions.
Choice: pure core calculations consumed by UI and advisor.
Rationale: deterministic, offline, testable and usable without credentials. Draw calculations distinguish any-target odds from all-components odds, use known positions and reject inconsistent deck information.

### Public observations and evidence
Context: entity movement carries more information than a cumulative played-card list.
Options: infer identities; record public entity facts.
Choice: match-scoped hand and secret projections keyed by entity, with source/evidence and reversible overrides.
Rationale: identity remains unknown unless publicly revealed; late attach is marked unknown rather than backdating acquisition. Unsupported secret triggers remain candidates. Damage results identify covered mechanics and do not claim universal optimality.

### Persistent learning
Context: historical comparisons require original facts, not current edited decks.
Options: recompute against current deck; retain immutable versions and recording annotations.
Choice: additive version snapshots, version-linked match summaries and locally persisted bookmarks/resource groups.
Rationale: protects history and supports restarts. Old records lacking fields display unavailable rather than invented statistics.

### UI integration
Context: overlay width is constrained and already has several tabs.
Options: add every feature inline; a scrollable analysis surface plus contextual historical views.
Choice: an optional Analysis tab for live tools; existing stats/replay/deck routes for historical tools.
Rationale: keeps controls discoverable without making card rows unreadable. Use existing i18n and theme tokens, no new runtime dependencies.

Intended structure (existing files are extended where appropriate):
```text
packages/core/src/
  analysis/                 # draw odds, draw risks, resources, secrets, damage
  tracker/                  # public hand projection and snapshot integration
  recordings/               # key turns and reconstruction
  stats/                    # mulligan and version comparison
  deck/                     # collection-aware preparation
apps/desktop/src/
  main/                     # additive persistence and IPC
  preload/                  # typed bridges
  renderer/src/
    components/             # Analysis panel and contextual route extensions
    stores/                 # durable analysis preferences
    i18n/                   # English and Chinese labels
```

## Risks / Trade-offs

### Performance
Combinatorial calculations → polynomial probability dynamic programming and bounded damage search, memoized by relevant snapshot state.

### Security
Opponent hidden identity leakage → public observations only, redaction tests across IPC and recording.

### Compatibility
Old databases and recordings → additive migrations/defaults and unavailable states; never rewrite history using current decks.

### Domain correctness
Generated cards, changing hand limits, unsupported damage/secret mechanics → explicit inputs and unknown states; verified rule catalog rather than loose text guesses.

## Migration Plan

Implement and verify pure calculations, integrate live projections and persistence, then UI and historical consumers. Retain additive storage during rollback; older recordings stay readable. Run focused tests per feature and final workspace typecheck, lint, tests and production build, followed by desktop visual/runtime checks.

## Open Questions

None requiring user input. Mechanic coverage and runtime limitations will be recorded with concrete test evidence during implementation.

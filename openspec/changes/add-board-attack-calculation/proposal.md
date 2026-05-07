## Why

The current deck tracker can derive card and entity state, but it does not surface the immediate damage pressure represented by minions on board. Adding board attack calculation fits the existing DEVELOPMENT_PLAN.md direction of turning live match state into useful overlay information, while keeping this change independently deliverable as a narrow combat-state enhancement.

## What Changes

- Compute friendly and opposing board attack totals from live entity state.
- Add board attack totals to the deck-tracker snapshot/event surface so renderer and overlay consumers can display them without duplicating domain logic.
- Treat only attack-capable minions in the PLAY zone as board attackers, using conservative defaults when attack or entity type data is unavailable.
- Add focused core tests and renderer tests for the calculated totals and display behavior.

Non-goals:

- Do not calculate lethal, taunt/blocking rules, weapon attack, hero attack, spell damage, or hand damage.
- Do not implement Battlegrounds-specific combat simulation.
- Do not change remaining-deck or opponent-card tracking semantics except for sharing the same entity state source.
- Do not add new native HearthMirror APIs unless existing reflected entity fields are insufficient during implementation; if needed, this change will only wire already-exposed fields.

## Capabilities

### New Capabilities

- `board-attack-calculation`: Calculates and exposes current friendly and opposing minion attack totals from tracked board entities.

### Modified Capabilities

- `deck-tracker-core`: Snapshot and state-change requirements are extended to include board attack totals.

## Impact

- `packages/core`: add a pure board attack computation utility, extend tracked snapshot types, and cover behavior with Vitest.
- `apps/desktop/src/main`: forward the extended deck-tracker snapshot over existing IPC channels.
- `apps/desktop/src/renderer`: render friendly and opposing board attack totals in appropriate live match panels/overlays with i18n labels.
- `resources/locales`: add localized labels for board attack display.

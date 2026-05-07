## ADDED Requirements

### Requirement: Board attack totals are computed from board entities

The system SHALL provide a pure board attack calculation that returns friendly and opposing minion attack totals from the current board state.

The calculation MUST:

- Accept friendly and opposing board entity arrays using the reflected board entity shape.
- Sum only finite positive attack values.
- Treat missing, null, undefined, negative, and non-finite attack values as 0.
- Exclude obvious non-minion entities such as hero card IDs from the total.
- Return deterministic `{ friendly: number; opposing: number }` output without mutating input arrays or entities.

#### Scenario: Friendly and opposing attack are summed separately

- **GIVEN** friendly board entities with attack values `2` and `5`
- **AND** opposing board entities with attack values `3` and `4`
- **WHEN** board attack totals are computed
- **THEN** the friendly total is `7`
- **AND** the opposing total is `7`

#### Scenario: Invalid attack values do not affect totals

- **GIVEN** board entities with attack values `-1`, `0`, `NaN`, and `3`
- **WHEN** board attack totals are computed
- **THEN** only the `3` attack entity contributes to the total

#### Scenario: Hero entities are excluded

- **GIVEN** a board entity with card ID `HERO_07` and attack `5`
- **AND** a normal minion board entity with attack `2`
- **WHEN** board attack totals are computed
- **THEN** the total is `2`

#### Scenario: Missing board state returns zero totals

- **WHEN** board attack totals are computed without a current board state
- **THEN** the friendly total is `0`
- **AND** the opposing total is `0`

### Requirement: Board attack calculation remains framework agnostic

The board attack calculation SHALL live in `@hdt/core` and MUST NOT depend on Electron, React, DOM APIs, renderer stores, or locale resources.

#### Scenario: Core package can test board attack in isolation

- **WHEN** `pnpm --filter @hdt/core test` is run
- **THEN** board attack calculation tests run in the Node/Vitest environment without requiring Electron or a browser

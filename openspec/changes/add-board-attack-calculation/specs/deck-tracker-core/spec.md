## ADDED Requirements

### Requirement: DeckTracker snapshot exposes board attack totals

`@hdt/core` SHALL include board attack totals in every `DeckTrackerSnapshot`.

The snapshot MUST include:

- `boardAttack.friendly`: the current summed attack of local player's attack-capable board entities.
- `boardAttack.opposing`: the current summed attack of opposing player's attack-capable board entities.

When `getBoardState()` returns `null`, fails for the current tick, or the tracker is outside an active match, both totals MUST be `0`.

Existing IPC forwarding and renderer store subscriptions MUST carry the field without introducing a new channel.

#### Scenario: Snapshot includes board attack during match

- **GIVEN** `getBoardState()` returns friendly minions with attack `2` and `1`
- **AND** opposing minions with attack `4`
- **WHEN** the deck tracker builds an IN_MATCH snapshot
- **THEN** `snapshot.boardAttack.friendly === 3`
- **AND** `snapshot.boardAttack.opposing === 4`

#### Scenario: Blank snapshot has zero board attack

- **WHEN** a new deck tracker snapshot is created before a match starts
- **THEN** `snapshot.boardAttack.friendly === 0`
- **AND** `snapshot.boardAttack.opposing === 0`

#### Scenario: Existing IPC channels carry board attack

- **WHEN** the main process forwards `deck-tracker:state` to renderer windows
- **THEN** the forwarded snapshot includes `boardAttack`
- **AND** no additional IPC channel is required for board attack values

### Requirement: Renderer displays friendly and opposing board attack

The desktop renderer SHALL display board attack totals from `DeckTrackerSnapshot.boardAttack` in live match surfaces.

The display MUST:

- Show friendly and opposing totals in the relevant deck/opponent panels or overlay views.
- Use existing i18n locale resources for all labels.
- Render numeric totals with mono typography.
- Preserve existing empty, waiting, and disconnected states when no match is active.

#### Scenario: Friendly board attack is visible in player live surface

- **GIVEN** an active snapshot with `boardAttack.friendly === 6`
- **WHEN** the player live deck panel or player overlay renders
- **THEN** the localized friendly board attack label is visible
- **AND** the value `6` is rendered with mono typography

#### Scenario: Opposing board attack is visible in opponent live surface

- **GIVEN** an active snapshot with `boardAttack.opposing === 8`
- **WHEN** the opponent card panel or opponent overlay renders
- **THEN** the localized opposing board attack label is visible
- **AND** the value `8` is rendered with mono typography

#### Scenario: Board attack labels follow active locale

- **GIVEN** the active app locale is `zh-CN`
- **AND** an active snapshot contains board attack totals
- **WHEN** the live match surface renders
- **THEN** the board attack labels render in Chinese

## ADDED Requirements

### Requirement: Key-card draw probabilities
The tracker SHALL let users select and persist key-card targets, choose any-target or all-component mode and draw horizon, and display direct offline probabilities respecting known top/bottom copies. It MUST expose incomplete or inconsistent information rather than invent exact odds.

#### Scenario: Alternative answers and combo
- **WHEN** a ten-card random deck contains two A and one B and the user selects two draws
- **THEN** any A/B is 24/45 and at least one of each is 2/45

#### Scenario: Known positions
- **WHEN** the only target is known at the bottom and fewer than the whole deck is drawn
- **THEN** its draw probability is zero

### Requirement: Opponent hand timeline
The tracker SHALL show current hand positions, observed acquisition turn, observed mulligan retention and publicly known creation source, keyed by entity and reset per match. Unknown identities and missing history MUST remain unknown.

#### Scenario: Position shifts
- **WHEN** an opponent plays their leftmost card
- **THEN** surviving cards keep their original acquisition facts despite position shifts

### Requirement: Secret elimination
The tracker SHALL display mode-valid secret candidates, conservative automatic exclusions with evidence and reversible per-secret manual exclusions.

#### Scenario: Ambiguous trigger
- **WHEN** trigger eligibility or event ordering is incomplete
- **THEN** the affected secret remains possible and the UI does not assert exclusion

### Requirement: Key resources
Users SHALL persist editable card groups such as removal, healing and combo; the tracker SHALL summarize known local availability and public opponent expenditure, separating predicted remaining cards from facts.

#### Scenario: Predicted remaining
- **WHEN** a matched opponent deck contains two copies and one original copy has been publicly played
- **THEN** one remaining copy is labelled predicted and generated copies do not consume original copies

### Requirement: Fatigue and overdraw
The tracker SHALL forecast next fatigue, cumulative fatigue damage and burned draws using remaining deck, current hand, hand limit and draw count; known automatic draws and planned draws SHALL be distinguishable. Missing fatigue state MUST not imply zero.

#### Scenario: Mixed overdraw and fatigue
- **WHEN** hand is nine of ten, deck has two cards, previous fatigue is two and four draws are planned
- **THEN** one card enters hand, one burns and fatigue damage is seven

### Requirement: Explainable damage sequences
The tracker SHALL extend board damage with supported hand damage and hero powers using observed costs, available mana and legal target constraints, showing an ordered sequence and unsupported-mechanic limitations.

#### Scenario: Mana conflict
- **WHEN** available mana cannot pay for all damage actions
- **THEN** the result includes only a feasible sequence and never double-counts the same card or hero power

### Requirement: Personal mulligan learning
The statistics UI SHALL aggregate offered/kept/replaced cards by saved deck, opponent class and play order, displaying outcome counts and sample size without presenting correlation as causal advice.

#### Scenario: Missing historical data
- **WHEN** old matches lack mulligan observations
- **THEN** they are excluded from card denominators and the UI explains data availability

### Requirement: Key-turn replay
The replay UI SHALL provide key-event navigation, reconstructed public board/hand context and persistent per-recording bookmarks and notes, distinguishing suspected missed lethal from proven facts.

#### Scenario: Reopen bookmark
- **WHEN** the user bookmarks a turn, adds a note and reopens the recording
- **THEN** the note and target turn remain available and navigation restores that turn

### Requirement: Deck version comparison
The app SHALL retain immutable card-list versions after edits, associate future matches with their played version and compare card differences, match count, win rate, matchup distribution and average turns.

#### Scenario: Edit preserves history
- **WHEN** a saved deck changes one card after a match
- **THEN** the previous match remains assigned to the old list and the comparison shows the removed and added cards

### Requirement: Collection-aware preparation
The deck UI SHALL calculate missing copies and crafting cost from actual owned playable variants, and suggest owned, format/class-legal substitutes with reasons and manual selection.

#### Scenario: Variant ownership
- **WHEN** a deck needs two copies and collection has one normal and one golden playable copy
- **THEN** neither copy is missing and crafting cost is zero

### Requirement: Integrated delivery
All ten features SHALL be reachable in the application, support English and Chinese, handle idle/loading/unknown states and persist relevant user settings. Core, IPC, storage and UI tests plus production build and runtime inspection MUST substantiate completion.

#### Scenario: No AI credentials
- **WHEN** AI advice is disabled
- **THEN** deterministic tracking, odds, resource tools and historical analysis remain usable locally

## ADDED Requirements

### Requirement: isAlive reflects bound-process liveness within one tick

`HearthMirror.isAlive()` SHALL return `false` within one invocation of the underlying napi `is_alive` after the bound Hearthstone process exits or is replaced by a different `Hearthstone.exe` instance. The `_connected` boolean tracked by the wrapper MUST stay in sync with the napi result on every call.

The contract makes no guarantee about the *source* of the staleness — process exit, ASLR base change, mono runtime tear-down — only that a `true → false` transition is observable on the next call after the underlying state changes.

#### Scenario: User exits Hearthstone

- **GIVEN** `mirror.isAlive()` previously returned `true`
- **WHEN** the user closes Hearthstone
- **AND** `mirror.isAlive()` is called next
- **THEN** the call returns `false`

#### Scenario: User restarts Hearthstone

- **GIVEN** `mirror.isAlive()` previously returned `true` against pid `P1`
- **WHEN** the user closes Hearthstone and starts it again so the new pid is `P2 != P1`
- **AND** `mirror.isAlive()` is called against the new instance
- **THEN** the call returns `true` (after the native layer transparently re-inits) and subsequent reflectors operate against `P2`

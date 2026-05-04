## ADDED Requirements

### Requirement: getHearthstoneWindow proxies to native

`@hdt/hearthmirror` SHALL expose
`mirror.getHearthstoneWindow(): Promise<HearthstoneWindow | null>`
on the existing `HearthMirror` class. The method SHALL connect
lazily like the other reflection methods, then forward to the
native binding.

`HearthstoneWindow` is the exported type
`{ x: number; y: number; width: number; height: number; minimized:
boolean; visible: boolean }`. All numeric fields are integer pixel
counts in virtual-screen coordinates.

The method MUST resolve to `null` (not reject) when:

- The native call returns no window (HS not running, or running
  pre-window).
- The native call throws (mirror not alive, native panic).

The method MUST NOT cache results — each call hits the native
binding fresh.

#### Scenario: Returns null when native returns null

- **GIVEN** Hearthstone is not running
- **WHEN** `mirror.getHearthstoneWindow()` is awaited
- **THEN** the resolved value is `null`

#### Scenario: Returns full bounds when native returns a window

- **GIVEN** Hearthstone is running with a 1920×1080 window at
  origin (0, 0)
- **WHEN** `mirror.getHearthstoneWindow()` is awaited
- **THEN** the resolved value is `{ x: 0, y: 0, width: 1920,
  height: 1080, minimized: false, visible: true }`

#### Scenario: Returns null when native throws

- **GIVEN** the native binding throws (mirror not alive)
- **WHEN** `mirror.getHearthstoneWindow()` is awaited
- **THEN** the resolved value is `null` (not a rejection)

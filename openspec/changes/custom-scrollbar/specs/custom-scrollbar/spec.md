## ADDED Requirements

### Requirement: Custom scrollbar styling replaces native chrome scrollbars

The renderer SHALL render all overflow scrollbars (vertical and horizontal) using a custom theme-aligned style instead of the Chromium default. The custom style MUST be implemented purely with `::-webkit-scrollbar` family pseudo-elements (and `scrollbar-color` / `scrollbar-width` as fallbacks) — no JavaScript scrollbar library SHALL be introduced.

#### Scenario: Vertical scrollbar uses themed colors

- **WHEN** a user scrolls a vertically overflowing container in the deck tracker main window
- **THEN** the scrollbar track color resolves to `var(--scrollbar-track)` and the thumb color resolves to `var(--scrollbar-thumb)`, matching the console theme rather than the Windows native gray.

#### Scenario: Horizontal scrollbar uses the same themed colors

- **WHEN** a horizontally overflowing container is shown
- **THEN** its scrollbar uses the same `--scrollbar-track` / `--scrollbar-thumb` tokens as the vertical scrollbar; horizontal and vertical SHALL NOT diverge in palette.

#### Scenario: Hover and active thumbs change color

- **WHEN** the cursor hovers over the scrollbar thumb
- **THEN** the thumb color resolves to `var(--scrollbar-thumb-hover)`.
- **AND WHEN** the user presses and drags the thumb
- **THEN** the thumb color resolves to `var(--scrollbar-thumb-active)`.

### Requirement: Overlay variant tightens the scrollbar for transparent windows

The two overlay BrowserWindows (`/overlay`, `/overlay-opponent`) SHALL render scrollbars with reduced visual weight: narrower width and a transparent / semi-transparent track that does not draw a solid stripe over the transparent overlay background. The variant MUST be applied automatically when the renderer is loaded inside an overlay BrowserWindow, with no per-component opt-in.

#### Scenario: Overlay scrollbar is narrower than main window

- **WHEN** an overlay route mounts and a scrollable container is present
- **THEN** the scrollbar's width resolves to `6px` (vs `8px` in the main window) via a token override scoped to the overlay.

#### Scenario: Overlay scrollbar track is transparent

- **WHEN** an overlay route mounts
- **THEN** the resolved value of `var(--scrollbar-track)` is `transparent` so no opaque stripe is painted over the transparent overlay background.

#### Scenario: Overlay scope is set on body via the overlay root component

- **WHEN** the `OverlayView` or `OpponentOverlayView` component mounts
- **THEN** `document.body.dataset.overlay` is set to `"true"` so the overlay scrollbar overrides take effect.
- **AND WHEN** the overlay route unmounts
- **THEN** the dataset attribute is cleared (the overlay window typically lives for the renderer's lifetime; cleanup is best-effort for HMR robustness).

### Requirement: Implementation lives in a dedicated stylesheet imported once

The custom scrollbar rules SHALL live in `apps/desktop/src/renderer/src/styles/scrollbar.css` and be imported exactly once from `apps/desktop/src/renderer/src/styles/index.css`. No component-level scrollbar CSS SHALL be introduced; the global stylesheet is the single source of scrollbar truth.

#### Scenario: Stylesheet is imported from the renderer entry styles

- **WHEN** a smoke test reads `apps/desktop/src/renderer/src/styles/index.css`
- **THEN** it contains an `@import "./scrollbar.css";` directive (or equivalent loader-resolvable import).

#### Scenario: No per-component scrollbar overrides

- **WHEN** a smoke test greps the renderer source tree for `::-webkit-scrollbar`
- **THEN** the only match is in `styles/scrollbar.css`.

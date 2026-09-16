# Stylesheet ownership

`index.css` declares the cascade order. Keep new rules in their owning module:

- `theme.css`: semantic tokens, Tailwind exposure, base typography and glass primitives.
- `desktop-shell.css`: common desktop structure and macOS appearance.
- `reference.css`: Arcane desktop appearance and page components.
- `reference-overlay.css`: Arcane game overlays.
- `refinements.css`: desktop responsive layout, spacing and focus treatment.
- `reliability.css`: interactive tracker rows and diagnostic/update settings.
- `beui.css`: adapted beUI controls, selection indicators and motion accessibility.

Do not move rules across this order without checking both themes. Overlay
windows must remain independent of desktop width and responsive rules.

Visual checks: tracker empty state and long lists, settings data/appearance,
collection, stats, both overlays; 720, 980 and 1280 px widths; Arcane and macOS.
Verify keyboard focus, disabled/error/loading states, long card names and paths.

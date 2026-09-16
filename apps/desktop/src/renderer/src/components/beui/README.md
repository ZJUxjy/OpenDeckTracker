# beUI integration

Source components retrieved on 2026-09-16 from the official MIT registry:

- https://beui.dev/r/tabs (updated 2026-09-11)
- https://beui.dev/r/button
- https://beui.dev/r/switch
- Upstream: https://github.com/starc007/ui-components

These are local adaptations, following beUI's copy-and-own distribution model.
They reuse our existing React 18, Motion 12 and Radix dependencies. No React
upgrade, registry runtime, remote assets or new dependency is required.

Adaptations: semantic theme tokens; compact controls; restrained press feedback;
isolated selection IDs; reduced-motion handling; accessible switch names; Radix
keyboard navigation/ARIA for tabs; stable force-mounted tracker panels. Filter
buttons keep aria-pressed and route navigation keeps aria-current instead of
pretending to be tab panels. Unused magnetic/ripple/metallic variants are omitted.

Styles live in `../../styles/beui.css`. Both Arcane and macOS themes use their
existing colors. The source license is kept here and included in the packaged
third-party notices by `scripts/generate-third-party-notices.mjs`.

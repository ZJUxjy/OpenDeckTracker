## 1. Token additions

- [x] 1.1 In `apps/desktop/src/renderer/src/styles/theme.css`, append the five `--scrollbar-*` declarations to the Console theme tokens block (`:root`, after `--amber`): `--scrollbar-size: 8px;`, `--scrollbar-track: var(--bg-2);`, `--scrollbar-thumb: var(--border-hi);`, `--scrollbar-thumb-hover: var(--text-mute);`, `--scrollbar-thumb-active: var(--accent);`. Verify via `grep -n "scrollbar-" apps/desktop/src/renderer/src/styles/theme.css`; expected output: 5 matching lines. Commit message: `feat(theme): add scrollbar tokens`.

## 2. Stylesheet creation

- [x] 2.1 Create `apps/desktop/src/renderer/src/styles/scrollbar.css` with the global `::-webkit-scrollbar`, `::-webkit-scrollbar-track`, `::-webkit-scrollbar-thumb`, `::-webkit-scrollbar-thumb:hover`, `::-webkit-scrollbar-thumb:active`, and `::-webkit-scrollbar-corner` rules referencing the new tokens, plus `scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);` and `scrollbar-width: thin;` on `*` as a fallback. Both vertical and horizontal scrollbars MUST use the same palette.
- [x] 2.2 In the same file, add the overlay scope override block: `body[data-overlay="true"] { --scrollbar-size: 6px; --scrollbar-track: transparent; --scrollbar-thumb: rgba(42,53,67,0.55); }`. The hover/active tokens are inherited unchanged.
- [x] 2.3 In `apps/desktop/src/renderer/src/styles/index.css`, add `@import "./scrollbar.css";` after the existing `@import` lines. Verify via `grep -n scrollbar.css apps/desktop/src/renderer/src/styles/index.css`; expected: one match. Commit message: `feat(renderer): custom themed scrollbar styling`.

## 3. Overlay scope wiring

- [x] 3.1 In `apps/desktop/src/renderer/src/components/OverlayView.tsx`, add a `useEffect` that on mount sets `document.body.dataset.overlay = 'true'` and on unmount deletes the attribute (`delete document.body.dataset.overlay`). The effect MUST have an empty dependency array.
- [x] 3.2 In `apps/desktop/src/renderer/src/components/OpponentOverlayView.tsx`, add the identical effect. Both files SHALL keep the effect at the top of the component body, before any conditional returns.
- [x] 3.3 Run `pnpm --filter @hdt/desktop typecheck`; expected output: no TypeScript errors. Commit message: `feat(overlay): scope overlay scrollbar variant via body dataset`.

## 4. Manual smoke verification

- [ ] 4.1 `pnpm dev`, open the main window, scroll the live deck panel and the in-match opponent panel; confirm both vertical scrollbars render with `--accent`-tinted thumbs on press, no Windows-native gray. Capture observation in PR description.
- [ ] 4.2 With Hearthstone running, confirm both `/overlay` and `/overlay-opponent` BrowserWindows show 6px-wide scrollbars with no opaque track stripe over the transparent overlay background.
- [ ] 4.3 Scroll a horizontally overflowing container (e.g., a debug deck with very long card names, or temporarily add `overflow-x-auto` + wide content); confirm horizontal scrollbar matches the vertical palette.

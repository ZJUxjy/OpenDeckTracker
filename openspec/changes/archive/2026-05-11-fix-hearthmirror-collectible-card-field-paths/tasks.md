## 1. Update field-path constants

- [x] 1.1 In `packages/hearthmirror/native/src/reflection/field_paths.rs`, change:
  - `FLD_CARD_DBF_ID` from `"DbfId"` to `"m_CardDbId"`
  - `FLD_CARD_COUNT` from `"m_count"` to `"<OwnedCount>k__BackingField"`
  - `FLD_CARD_PREMIUM` from `"m_premium"` to `"m_PremiumType"`
- [x] 1.2 In `packages/hearthmirror/native/src/reflection/collection.rs`, replace the multi-line comment immediately above `iter_element_ptrs(...)` that references `CollectionCardData` with an updated block that names the element class `CollectibleCard`, lists the three field names introduced in 1.1, and cites the diagnostic counters (`field_misses == 3 × parsed`, `sampleClass == 'CollectibleCard'`) as the witness for the rename.
- [x] 1.3 Commit with `git add packages/hearthmirror/native/src/reflection/field_paths.rs packages/hearthmirror/native/src/reflection/collection.rs && git commit -m "fix(hearthmirror-native): align card field paths with CollectibleCard"`; expected output includes a new commit hash. (b67fa87)

## 2. Rebuild the native crate

- [x] 2.1 Pause here for the user: stop any running `pnpm dev` / Electron session so the existing `hearthmirror-native.win32-x64-msvc.node` is released. Resume only after the user confirms HDT.js is fully closed.
- [x] 2.2 Run `pnpm --filter @hdt/hearthmirror-native build` (or `cd packages/hearthmirror/native && pnpm build`); expect exit 0 and a refreshed `hearthmirror-native.win32-x64-msvc.node` in the package directory.
- [x] 2.3 Run `cd packages/hearthmirror/native && cargo clippy --release -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic`; expect exit 0.
- [x] 2.4 Confirm `packages/hearthmirror/native/index.d.ts` has no semantic changes (only the `.node` binary should differ in the commit). The TS surface is unchanged by this fix.
- [x] 2.5 Commit the rebuilt `.node` with `git add packages/hearthmirror/native/hearthmirror-native.win32-x64-msvc.node && git commit -m "build(hearthmirror-native): rebuild .node with CollectibleCard field paths"`; expected output includes a new commit hash. If `git status` shows the binary unchanged, skip this commit step. (45ad9c8)

## 3. Manual verification

- [x] 3.1 User starts `pnpm dev`, opens HDT.js with Hearthstone running, opens the Collection page, clicks the manual sync button.
- [x] 3.2 In the renderer DevTools Console, capture the `[hearthmirror:collection]` line. Success criteria:
  - `nonZeroDbfid > 0` (target: roughly equals `parsed`) — observed `nonZeroDbfid: 15695` (= `parsed`)
  - `fieldMisses == 0` — observed `fieldMisses: 0`
  - `sampleClass == "CollectibleCard"` — observed
- [x] 3.3 In the same DevTools Console, capture the `[collection-sync] progress` line and confirm `totalOwned > 0` — observed 7935 unique dbf-ids in `mirror.getCollection`.
- [x] 3.4 Confirm the Set Grid tiles on the Collection page now show non-zero `唯一卡牌` and `总收藏数` numbers — user confirmed "收藏页面正确地将收藏卡牌显示了出来".
- [x] 3.5 Open one specific Set Detail page — covered by 3.4's user confirmation of working collection display.
- [x] 3.6 Run `openspec status --change fix-hearthmirror-collectible-card-field-paths`; expected output shows all artifacts complete. — `Progress: 4/4 artifacts complete`.

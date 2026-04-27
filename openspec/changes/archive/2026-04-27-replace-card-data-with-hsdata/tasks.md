## 1. Setup and Fixtures

- [x] 1.1 Add XML parser dependency with `pnpm add -D saxes` in `D:\code\HDT_js`; expected `package.json` and `pnpm-lock.yaml` include `saxes` and install exits 0.
- [x] 1.2 Add root script `"cards:convert": "tsx scripts/convert-hsdata-cards.ts"` in `package.json`; expected `pnpm cards:convert --help` can be wired after task 3.1 without changing command name.
- [x] 1.3 Create `packages/hearthdb/src/tests/fixtures/hsdata-mini.xml` with three entities: collectible Fireball (`CS2_029`), a non-collectible hero power, and a card missing `zhCN`; expected fixture includes `CARDNAME`, `CARDTEXT_INHAND`, `COST`, `CLASS`, `CARD_SET`, `CARDTYPE`, `RARITY`, and `COLLECTIBLE` tags.
- [x] 1.4 Create `scripts/fixtures/hsdata-duplicates.xml` with two entities sharing the same `CardID`; expected converter tests can assert duplicate detection.
- [x] 1.5 Create `scripts/fixtures/hsdata-unknown-enum.xml` with one entity using an unsupported `CARDTYPE`; expected converter tests can assert contextual enum errors.
- [x] 1.6 Commit setup with `git add package.json pnpm-lock.yaml packages/hearthdb/src/tests/fixtures scripts/fixtures && git commit -m "test(hearthdb): add hsdata XML conversion fixtures"`; expected commit succeeds.

## 2. Converter Tests First

- [x] 2.1 Create `scripts/convert-hsdata-cards.test.ts` importing `convertHsdataCardsForTest` from `./convert-hsdata-cards`; expected initial `pnpm exec vitest run scripts/convert-hsdata-cards.test.ts` fails because implementation is missing.
- [x] 2.2 In `scripts/convert-hsdata-cards.test.ts`, add a mapping test: convert `packages/hearthdb/src/tests/fixtures/hsdata-mini.xml` to temp output and assert `CS2_029` has `{ id: "CS2_029", dbfId: 315, name: "Fireball", cost: 4, cardClass: "MAGE", type: "SPELL", collectible: true }`.
- [x] 2.3 In the same test file, add zhCN fallback coverage: assert the card missing `zhCN` uses `enUS` name in `cards.all.zhCN.json`; expected failure before implementation.
- [x] 2.4 Add collectible split coverage: assert `cards.all.enUS.json` contains collectible and non-collectible fixture cards while `cards.collectible.enUS.json` only contains `collectible === true`; expected failure before implementation.
- [x] 2.5 Add deterministic output coverage: run conversion twice into separate temp dirs and assert `cards.all.enUS.json` bytes are identical; expected failure before implementation.
- [x] 2.6 Add duplicate ID coverage using `scripts/fixtures/hsdata-duplicates.xml`; expected rejection message contains the duplicate `CardID`.
- [x] 2.7 Add unsupported enum coverage using `scripts/fixtures/hsdata-unknown-enum.xml`; expected rejection message contains `CARDTYPE`, the unsupported value, and the affected `CardID`.
- [x] 2.8 Add build metadata coverage: assert `card-build.json` contains `build`, `source`, `generatedAt`, `totalCards`, `collectibleCards`, and `locales`; expected failure before implementation.

## 3. Converter Implementation

- [x] 3.1 Create `scripts/convert-hsdata-cards.ts` exporting `convertHsdataCardsForTest(inputPath, outDir, options?)` and a CLI `main()`; expected `pnpm exec vitest run scripts/convert-hsdata-cards.test.ts` now loads the module.
- [x] 3.2 Implement SAX parsing with `SaxesParser` from `saxes`, reading `CardDefs.xml` via `fs.createReadStream(..., { encoding: "utf8" })`; expected parser processes one `Entity` at a time and does not build a full XML DOM.
- [x] 3.3 Add mapping tables in `scripts/convert-hsdata-cards.ts` for `CLASS`, `CARDTYPE`, `RARITY`, and known `CARD_SET` values used by current fixtures; expected fixture mapping test passes for Fireball.
- [x] 3.4 Implement localized `LocString` extraction for `CARDNAME` and `CARDTEXT_INHAND` with locale fallback order `requested -> enUS -> CardID`; expected zhCN fallback test passes.
- [x] 3.5 Implement mechanics extraction from boolean/int mechanics tags into `mechanics?: string[]`; expected fixture card with one mechanic emits that mechanic.
- [x] 3.6 Implement required-field validation for `id`, `dbfId`, `name`, `set`, `type`, `cardClass`, and `collectible`; expected malformed fixture tests reject with actionable messages.
- [x] 3.7 Implement duplicate `id` and duplicate non-zero `dbfId` detection; expected duplicate fixture test passes.
- [x] 3.8 Write generated JSON files to `data/cards/generated/` sorted by ascending `dbfId` then `id`, using stable object field ordering; expected deterministic output test passes.
- [x] 3.9 Write `card-build.json` with XML build number, source path, generated timestamp, total card count, collectible card count, and locales; expected metadata test passes.
- [x] 3.10 Run `pnpm exec vitest run scripts/convert-hsdata-cards.test.ts`; expected all converter tests pass.
- [x] 3.11 Run `pnpm cards:convert` against `data/cards/hsdata/CardDefs.xml`; expected exit 0 and generated files `cards.all.enUS.json`, `cards.all.zhCN.json`, `cards.collectible.enUS.json`, `cards.collectible.zhCN.json`, `card-build.json`.
- [x] 3.12 Commit converter with `git add scripts package.json pnpm-lock.yaml data/cards && git commit -m "feat(hearthdb): convert hsdata CardDefs XML to generated JSON"`; expected commit succeeds.

## 4. CardDb Compatibility

- [x] 4.1 Update `packages/hearthdb/src/card-defs.ts` so `collectible` is documented and typed as `boolean`, and unions include all string values emitted by the converter; expected `pnpm --filter @hdt/hearthdb typecheck` exits 0.
- [x] 4.2 Extend `packages/hearthdb/src/card-search.ts` `SearchFilter` with `collectible?: boolean`; expected TypeScript compile initially fails until `matches()` handles it.
- [x] 4.3 Add `packages/hearthdb/src/card-search.hsdata.test.ts` with tests loading generated fixture JSON and asserting `collectible: true`, `collectible: false`, and AND-combined filters; expected failure before implementation.
- [x] 4.4 Implement `collectible` filtering in `matches(card, filter)`; expected `pnpm --filter @hdt/hearthdb test card-search.hsdata` passes.
- [x] 4.5 Add `packages/hearthdb/src/card-loader.hsdata.test.ts` loading fixture-generated full and collectible JSON; expected full size is greater than or equal to collectible size and collectible output contains only `collectible === true`.
- [x] 4.6 Run `pnpm --filter @hdt/hearthdb test`; expected all hearthdb tests pass.
- [x] 4.7 Commit CardDb compatibility with `git add packages/hearthdb && git commit -m "feat(hearthdb): support full hsdata generated card database"`; expected commit succeeds.

## 5. Runtime Path, Docs, and CI

- [x] 5.1 Update `apps/desktop/src/main/cards.ts` to load `data/cards/generated/cards.all.enUS.json` by default, keeping clear fallback logging if the file is missing; expected desktop card IPC tests still pass.
- [x] 5.2 Update `data/cards/README.md` to document hsdata source, `CardDefs.xml`, generated paths, `pnpm cards:convert`, generated JSON git policy, and `pnpm cards:download` fallback; expected README contains required spec substrings.
- [x] 5.3 Update `.gitignore` to exclude `data/cards/generated/*.json` and retain relevant legacy JSON ignores; expected generated JSON files do not appear in `git status --short`.
- [x] 5.4 Update root `README.md` quickstart to use `pnpm cards:convert` instead of `pnpm cards:download`; expected quickstart commands are accurate for local hsdata.
- [x] 5.5 Update `.github/workflows/ci.yml` to run `pnpm cards:convert` after install and before tests; expected CI no longer depends on HearthstoneJSON network access for card data.
- [x] 5.6 Commit docs/CI/runtime path with `git add apps/desktop data/cards README.md .github .gitignore && git commit -m "build: use hsdata conversion as default card data source"`; expected commit succeeds.

## 6. Validation and Closeout

- [x] 6.1 Run `pnpm cards:convert`; expected exit 0 and `data/cards/generated/card-build.json` reports build `240818`.
- [x] 6.2 Run `pnpm --filter @hdt/hearthdb test`; expected all hearthdb tests pass.
- [x] 6.3 Run `pnpm test`; expected all Vitest suites pass.
- [x] 6.4 Run `pnpm typecheck`; expected all workspace TypeScript projects pass.
- [x] 6.5 Run `openspec validate replace-card-data-with-hsdata --strict`; expected change is valid.
- [x] 6.6 Update this `tasks.md` checklist to mark completed items `[x]`; expected `openspec status --change replace-card-data-with-hsdata` shows apply-required artifacts complete.
- [x] 6.7 Commit OpenSpec closeout with `git add openspec/changes/replace-card-data-with-hsdata && git commit -m "docs(openspec): finalize replace-card-data-with-hsdata plan"`; expected commit succeeds.

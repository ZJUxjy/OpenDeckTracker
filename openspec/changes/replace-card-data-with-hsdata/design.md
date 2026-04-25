## Context

`@hdt/hearthdb` currently loads HearthstoneJSON-style JSON arrays through `loadCards(jsonPath)` and indexes them by `dbfId` and `id`. The root script `pnpm cards:download` downloads `cards.collectible.enUS.json` and `cards.collectible.zhCN.json` from HearthstoneJSON, so local development and CI depend on network availability and only get collectible cards.

The new local source is `data/cards/hsdata/CardDefs.xml`, a Hearthstone client dump from HearthSim hsdata with build `240818` / version `35.2.2.240818`. It is roughly 100 MB and stores cards as `<Entity CardID="..." ID="...">` nodes with typed `<Tag>` children. Names and text are localized `LocString` tags.

The downstream consumers already expect `CardDef`: desktop IPC, renderer collection/search, deck tracker card labels, and card image lookup. The design should therefore change the data preparation pipeline, not the runtime API surface.

Target layout after this change:

```text
data/
  cards/
    README.md
    hsdata/
      README.md
      CardDefs.xml
    generated/
      cards.all.enUS.json
      cards.all.zhCN.json
      cards.collectible.enUS.json
      cards.collectible.zhCN.json
      card-build.json
scripts/
  convert-hsdata-cards.ts
  download-cards.ts              # legacy/fallback, not default
packages/
  hearthdb/
    src/
      card-defs.ts
      card-loader.ts
      card-db.ts
      tests/fixtures/
        hsdata-mini.xml
```

## Goals / Non-Goals

**Goals:**

- Convert `CardDefs.xml` into deterministic JSON artifacts that preserve the current `CardDef` loading and search flow.
- Emit both full-card and collectible-only JSON files for at least `enUS` and `zhCN`.
- Keep runtime startup simple: Electron loads generated JSON, not XML.
- Validate enum/tag mappings with focused tests and clear conversion failures.
- Make CI independent of HearthstoneJSON network availability for card data.

**Non-Goals:**

- No runtime XML loader in desktop or preload.
- No card ownership collection database.
- No deck editor or deck management work.
- No local card-art download/cache.
- No broad localization UI redesign beyond emitting localized generated JSON.

## Decisions

### D1. Convert XML ahead of runtime

**Context:** `CardDefs.xml` is about 100 MB and contains all cards, including non-collectible and hidden records.

**Options:**

- Parse XML at runtime inside `apps/desktop`.
- Convert XML to JSON during setup/CI and keep runtime JSON loading.
- Replace `@hdt/hearthdb` with an XML-aware database.

**Choice:** Convert XML to JSON ahead of runtime and keep `@hdt/hearthdb` JSON loading.

**Rationale:** The current API already works, tests cover JSON loading/search, and runtime should not pay XML parsing cost. A generated JSON boundary also makes diffs, fixtures, and validation simpler.

### D2. Use a streaming XML parser

**Context:** A DOM-style XML parser would hold the entire 100 MB input plus object graph in memory. The converter only needs one `<Entity>` at a time.

**Options:**

- Use ad hoc string parsing.
- Use a DOM XML parser.
- Use a SAX-style streaming parser.

**Choice:** Use a SAX-style parser, with `saxes@6.0.0` as the preferred dependency.

**Rationale:** `saxes` is a strict, non-validating SAX parser with built-in TypeScript declarations and supports chunked `write()` parsing. The npm package is currently `6.0.0`, published under ISC; it is older but small and suitable for a dev/build script. `sax@1.4.1` is a fallback option, but it is looser and needs separate typings for strict TypeScript.

Version check:

- `saxes`: npm latest `6.0.0`, ISC, built-in TypeScript declarations, last published 4 years ago (`https://www.npmjs.com/package/saxes`).
- `sax`: npm latest `1.4.1`, ISC, 0 dependencies, last published about 1 year ago (`https://www.npmjs.com/package/sax`); requires `@types/sax` for TS comfort.

### D3. Generate current `CardDef` plus small safe extensions

**Context:** Existing consumers expect `CardDef.id`, `dbfId`, `name`, `cardClass`, `set`, `type`, `collectible`, and optional stats/text/rarity/mechanics.

**Options:**

- Preserve the exact interface and drop unmapped hsdata metadata.
- Add a large raw-tag bag to every card.
- Preserve current fields and add a few explicit metadata fields only if needed.

**Choice:** Preserve current fields and allow small explicit extensions such as `nameEnUS`, `locale`, or `classes?: CardClass[]` only when tests prove they are needed.

**Rationale:** The existing UI and search code should continue to work. A raw tag bag would leak hsdata internals everywhere and increase generated file size.

### D4. Store enum mapping in source-controlled code

**Context:** XML uses integer enum values for tags such as `CARD_SET`, `CLASS`, `CARDTYPE`, and `RARITY`.

**Options:**

- Emit raw integers and update `CardDb` search to understand integers.
- Hard-code mapping inline inside the converter.
- Create named mapping tables in the converter module with tests.

**Choice:** Create named mapping tables and test representative values.

**Rationale:** `CardDef` intentionally exposes string literal unions. Isolating mappings keeps conversion explainable and lets unknown values fail with actionable messages or land in a controlled `UNKNOWN_<id>` fallback where appropriate.

### D5. Keep full and collectible generated outputs

**Context:** Deck tracker and card search benefit from complete card metadata, but deck building and collection UI often need collectible-only lists.

**Options:**

- Generate only full data.
- Generate only collectible data.
- Generate both.

**Choice:** Generate both `cards.all.<locale>.json` and `cards.collectible.<locale>.json`.

**Rationale:** This avoids forcing every consumer to repeat the same filter while still unlocking token/Battlegrounds/hero-power lookups for tracker flows.

### D6. Switch the default script but keep legacy download explicit

**Context:** Existing quickstart and CI currently call `pnpm cards:download`.

**Options:**

- Repoint `pnpm cards:download` to hsdata conversion.
- Add `pnpm cards:convert` and make quickstart/CI call that.
- Delete the download script.

**Choice:** Add `pnpm cards:convert` for hsdata and make it the default documented/CI flow. Keep `pnpm cards:download` as a legacy fallback unless implementation reveals it is unused.

**Rationale:** The command name should describe local conversion, and keeping download fallback lowers risk during migration.

## Risks / Trade-offs

- **[Unknown enum values]** → Add strict mapping tests and an explicit failure message including tag name, value, card id, and dbf id. Allow controlled passthrough only for fields where consumers can safely treat values as strings.
- **[Generated full dataset is much larger]** → Keep generated JSON ignored by git unless the repository policy changes; use fixtures in tests, not the full generated file.
- **[Converter memory growth]** → Parse one entity at a time and stream input chunks. Accumulate output cards in memory only after normalized `CardDef` objects are created; if this becomes too large, switch output writing to NDJSON or chunked JSON.
- **[Locale gaps]** → Fallback locale order is `requested -> enUS -> CardID`; tests cover missing `zhCN`.
- **[Strict parser rejects future XML quirks]** → This is desirable for data integrity; the error path should point to file and parser position.
- **[CI still sees stale XML]** → CI should verify `data/cards/hsdata/CardDefs.xml` exists and emit build metadata in `card-build.json`.

## Migration Plan

1. Add converter fixtures and tests using a small XML sample with localized strings, collectible and non-collectible cards, mechanics, and missing locale fallback.
2. Implement `scripts/convert-hsdata-cards.ts` and add `pnpm cards:convert`.
3. Generate `data/cards/generated/*.json` locally from `CardDefs.xml`.
4. Point desktop runtime data path at `data/cards/generated/cards.all.enUS.json` or a packaged equivalent, preserving fallback behavior if data is missing.
5. Update README, `data/cards/README.md`, `.gitignore`, and CI to use `pnpm cards:convert`.
6. Keep `pnpm cards:download` available for one change cycle as a fallback.

Rollback:

- Revert runtime path and CI/docs to `pnpm cards:download`.
- Keep converter code inert if generated hsdata output reveals unacceptable schema drift.

## Open Questions

- Should generated JSON files be committed for reproducible offline builds, or ignored like the existing downloaded JSON? Default recommendation: ignore generated JSON and commit only XML source policy/docs plus fixtures.
- Should desktop default to `cards.all.enUS.json` for better tracker coverage or `cards.collectible.enUS.json` for smaller startup data? Default recommendation: `cards.all.enUS.json`, because tracker flows need non-collectible entities.
- Do we need multi-class card support in `CardDef` immediately, or can current `cardClass` remain the primary class with a follow-up for full multi-class filtering?

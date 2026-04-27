## Why

The project currently depends on HearthstoneJSON `cards.collectible.<locale>.json` downloads, while the full official client dump now exists locally at `data/cards/hsdata/CardDefs.xml` (build `240818`). This change moves the card-data pipeline closer to the game client source of truth while preserving the existing `@hdt/hearthdb` API used by desktop, deck tracking, and card display flows.

This fits the card database track in `DEVELOPMENT_PLAN.md`: the existing card DB is already integrated, and this change narrows the source-data risk before deck management, HearthWatcher, and overlay work depend more heavily on complete card metadata.

## What Changes

- Add a deterministic local conversion pipeline from `data/cards/hsdata/CardDefs.xml` to generated JSON files under `data/cards/`.
- Replace the current HearthstoneJSON download-first refresh flow with an hsdata conversion flow for local development and CI.
- Preserve the existing `CardDef` shape consumed by `CardDb`, renderer IPC, card search, deck tracker card labels, and card-image hover UI.
- Convert all relevant full-data cards, not only collectible cards, while still allowing consumers to filter by `collectible`.
- Map XML tags such as `CARDNAME`, `COST`, `ATK`, `HEALTH`, `CARD_SET`, `CLASS`, `CARDTYPE`, `RARITY`, `CARDTEXT_INHAND`, `COLLECTIBLE`, and mechanics into stable TypeScript-friendly fields.
- Add validation so malformed XML, missing required tags, duplicate IDs/dbfIds, and unsupported enum values produce clear failures.
- Keep the existing HearthstoneJSON download script only as an explicit fallback or legacy utility if useful, not as the default data refresh path.

**BREAKING**: generated card JSON will no longer be limited to `cards.collectible.<locale>.json`; default runtime data should come from the converted hsdata artifact. Existing APIs should remain source-compatible.

## Non-goals

- Do not build a full XML runtime loader inside the desktop app; XML is converted ahead of runtime.
- Do not implement deck management, collection ownership sync, or card collection persistence.
- Do not add new card image hosting or local card-art caching.
- Do not solve every future locale/i18n UI concern; this change only emits enough localized fields to support the current database and likely zhCN display needs.
- Do not remove `@hdt/hearthdb` or replace `CardDb` search/indexing behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `card-data-pipeline`: Replace the default card data refresh source with local hsdata XML conversion, including deterministic output and validation.
- `card-database`: Allow `@hdt/hearthdb` to load the generated full-card dataset while preserving existing lookup/search contracts.

## Impact

- Affected code:
  - `scripts/` card data refresh tooling.
  - `data/cards/README.md` and `.gitignore` data artifact policy.
  - `packages/hearthdb/src/card-defs.ts`, `card-loader.ts`, `card-db.ts`, and related tests if the generated schema needs small extensions.
  - `apps/desktop/src/main/cards.ts` runtime data path.
  - CI steps that currently call `pnpm cards:download`.
- Affected generated files:
  - New generated JSON card data derived from `data/cards/hsdata/CardDefs.xml`.
- Dependencies:
  - May add an XML streaming parser dependency or a small Node.js XML parsing utility if the standard library is insufficient for a 100MB input.
- Risks:
  - XML enum values may include card classes/types/sets not covered by current string unions.
  - Full data includes non-collectible, hidden, token, battlegrounds, mercenaries, and tutorial cards; consumers must avoid assuming every card is deck-buildable.
  - CI should not depend on network access for card data refresh after this change.

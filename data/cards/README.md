# Card Data

This directory holds card definitions used by `@hdt/hearthdb` and the desktop
app.

## Default source: hsdata

`data/cards/hsdata/CardDefs.xml` is a local dump from HearthSim hsdata:

- `CardDefs.xml` — full card definitions extracted from the Hearthstone client
- `README.md` — upstream version/provenance

Current local dump:

- Hearthstone version: `35.2.2.240818`
- Build: `240818`

The `hsdata/` directory is ignored by git because it is a local source checkout
or dump. Update it from your local hsdata source, then regenerate runtime JSON:

```powershell
pnpm cards:convert
```

## Generated files

`pnpm cards:convert` writes generated JSON under `data/cards/generated/`:

- `cards.all.enUS.json`
- `cards.all.zhCN.json`
- `cards.collectible.enUS.json`
- `cards.collectible.zhCN.json`
- `card-build.json`

Generated JSON files are not committed to git by default; see the root
`.gitignore`. The desktop main process loads `cards.all.enUS.json` so deck
tracker flows can resolve non-collectible cards such as tokens and hero powers.

## Legacy fallback

`pnpm cards:download` still downloads collectible-only data from
[HearthstoneJSON](https://hearthstonejson.com/). It is kept as a fallback
utility, but local development and CI use `pnpm cards:convert`.

## License attribution

Card data is property of Blizzard Entertainment. HearthSim hsdata and
HearthstoneJSON provide extracted data snapshots for tooling. Check the upstream
projects for exact redistribution terms.

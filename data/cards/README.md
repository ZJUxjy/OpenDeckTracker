# Card Data

This directory holds card definitions used by `@hdt/hearthdb` and the desktop
app.

## Default source: hsdata

`data/cards/hsdata/CardDefs.xml` is a local dump from HearthSim hsdata:

- `CardDefs.xml` — full card definitions extracted from the Hearthstone client
- `README.md` — upstream version/provenance

Current local dump:

- Hearthstone version: `36.4.2.251332`
- Build: `251332`
- Upstream commit: `dee8a641ef8427cf853ca707c2e427e752a1e11f`

`source.json` pins the upstream commit, client version, build and XML SHA-256.
CI caches the generated data by this manifest and converter sources, so a new
release cannot silently reuse an old cache. Reproduce the pinned release with:

```powershell
pnpm cards:sync
```

To select the latest upstream release, run `pnpm cards:update`, review and commit
the changed `source.json`. Both commands validate the XML hash (when pinned),
build, unique card IDs and nonempty collectible/full datasets before switching
the generated directory. The previous directory is preserved as `.previous-*`.
Failed downloads or validation leave the existing generated data untouched.

The ignored `hsdata/` directory remains usable for offline/manual conversion
with `pnpm cards:convert`; it does not change the pinned release manifest.

## Desktop updates

Settings → Data & Sync → Card database shows the active version and lets users
check, download, or restore the previous version. Downloads live in the app's
user-data directory; the bundled data is preserved. A validated version becomes
active only after restart, so open matches keep one consistent database.

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
utility, but reproducible local development and CI use `pnpm cards:sync`.

## License attribution

Card data is property of Blizzard Entertainment. HearthSim hsdata and
HearthstoneJSON provide extracted data snapshots for tooling. Check the upstream
projects for exact redistribution terms.

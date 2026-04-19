# Card Data

This directory holds the local copy of card definitions downloaded from
[HearthstoneJSON](https://hearthstonejson.com/), maintained by HearthSim.

**Files in this directory are NOT committed to git** (see root `.gitignore`).
Both local development and CI must run the download script:

```powershell
pnpm cards:download
```

## Files produced

- `cards.collectible.enUS.json` — used by the desktop main process at runtime
- `cards.collectible.zhCN.json` — Chinese locale, reserved for future i18n change

Both files contain only **collectible** cards (cards that appear in your
collection and base heroes). For non-collectible cards (tokens, hero powers,
passive enchantments) you would need `cards.json`, which is **not** downloaded
by this script.

## License attribution

Card data is property of Blizzard Entertainment.
[HearthstoneJSON](https://hearthstonejson.com/) provides a redistributable JSON
snapshot per game build. See their [license](https://hearthstonejson.com/) for
exact redistribution terms.

## Refresh frequency

HearthstoneJSON publishes a new build a few hours after each Hearthstone
client patch. There is no automatic update — re-run `pnpm cards:download`
manually when you need the latest data.

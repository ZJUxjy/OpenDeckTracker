# Spike 0005 - HSGuru deck data pull notes

**Goal**: document the working path for pulling current Hearthstone meta
deck data from HSGuru, including legend-rank top archetypes and representative
deck-code variants.

**Spike date**: 2026-04-27

## Summary

HSGuru exposes the data we need through rendered HTML pages rather than a
stable public JSON API. The reliable approach is:

1. Read archetype popularity from the meta page:
   `https://www.hsguru.com/meta?rank=legend&sort_by=total`
2. For each archetype, read concrete deck variants from the decks page:
   `https://www.hsguru.com/decks?rank=legend&order_by=total&min_games=50&player_deck_archetype[]=<encoded archetype>`
3. Parse the HTML into a normalized JSON payload.

The current experimental implementation lives at
`data/hsguru-data-spider/src/fetch-legend-top20.mjs`.

The generated sample output is:
`data/hsguru-data-spider/data/2026-04-27-legend-top20-hsguru.json`.

## Pages And Parameters

### Archetype popularity

Use:

```text
https://www.hsguru.com/meta?rank=legend&sort_by=total
```

Important query parameters:

- `rank=legend`: restricts data to legend players.
- `sort_by=total`: sorts archetypes by popularity / total games.

The meta page contains rows like:

```text
Harold Rogue | 50.9 | 27.3% (233950) | ...
```

Useful fields:

- `archetype`: archetype name, e.g. `Harold Rogue`.
- `winrate`: archetype winrate.
- `popularityPercent`: percentage of games in the selected filter.
- `games`: total games for that archetype.
- `archetypeUrl`: detail page URL.

### Deck variants

Use:

```text
https://www.hsguru.com/decks?rank=legend&order_by=total&min_games=50&player_deck_archetype[]=<encoded archetype>
```

Important query parameters:

- `rank=legend`: same rank filter as the meta page.
- `order_by=total`: sorts concrete deck lists by games.
- `min_games=50`: lowers the default minimum so low-volume archetypes still
  return representative variants.
- `player_deck_archetype[]=...`: the correct archetype filter. Earlier guesses
  such as `archetype=...`, `archetypes=...`, or `deck_archetype=...` did not
  reliably filter the page.

Useful fields per variant:

- `deckId`: HSGuru deck id.
- `title`: displayed deck title. This may differ from the archetype name, e.g.
  a `Harold DK` archetype can contain variants named with extra rune prefixes.
- `deckUrl`: HSGuru deck page URL.
- `code`: Hearthstone deck code.
- `winrate`: variant winrate.
- `games`: total games for that exact list.

## Parsing Notes

The pages are server-rendered HTML. Do not assume a JSON API exists.

Archetype parsing:

- Split or scan `<tr>...</tr>` rows on the meta page.
- Find `/archetype/...` links inside each row.
- Extract the first winrate `<span>`.
- Extract popularity from text matching `NN.N% (GAMES)`.

Deck variant parsing:

- Split on `<div id="deck_stats-`.
- The deck id appears immediately after the split marker.
- The deck title appears in:
  `<a class="basic-black-text" href="/deck/<id>">...</a>`
- The deck code appears in a hidden span:
  `<span style="font-size: 0; line-size: 0; display: block">...</span>`
- Deck codes contain lower-case characters. Use `[A-Za-z0-9+/=]+`, not only
  uppercase.
- The winrate and `Games: N` values appear after the hidden `D0nkey` marker.

Avoid filtering parsed variants by exact title equality. HSGuru's archetype
filter already scopes the page, and exact title checks drop valid variants whose
deck title is more specific than the archetype label.

## Output Shape

The current JSON shape is:

```json
{
  "source": "hsguru",
  "fetchedAt": "2026-04-27T04:50:30.917Z",
  "rank": "legend",
  "archetypeSort": "total",
  "variantSort": "total",
  "metaUrl": "https://www.hsguru.com/meta?rank=legend&sort_by=total",
  "archetypes": [
    {
      "archetype": "Harold Rogue",
      "archetypeUrl": "https://www.hsguru.com/archetype/Harold%20Rogue?rank=legend",
      "winrate": 50.9,
      "popularityPercent": 27.3,
      "games": 233950,
      "variantsUrl": "https://www.hsguru.com/decks?rank=legend&order_by=total&min_games=50&player_deck_archetype[]=Harold%20Rogue",
      "variants": [
        {
          "deckId": 39285857,
          "title": "Harold Rogue",
          "deckUrl": "https://www.hsguru.com/deck/39285857",
          "code": "AAECA...",
          "winrate": 50.2,
          "games": 43449
        }
      ]
    }
  ]
}
```

## Verified Result

The final 2026-04-27 run successfully fetched:

- 20 legend-rank archetypes sorted by popularity.
- 99 deck variants total.
- Up to 5 variants per archetype.
- 19 archetypes with 5 variants.
- `Harold Warrior` with 4 variants, because HSGuru only returned 4 variants
  under the selected filters.

The top archetype in that run was:

```text
Harold Rogue - 27.3%, 233950 games, 5 variants
```

## Operational Guidance

- Set a browser-like `user-agent`; HSGuru returns normal HTML with it.
- Use request timeouts. The experimental script uses 45 seconds per request.
- Add small delays between archetype variant requests to avoid hammering the
  site. The experimental script waits 1 second between archetypes.
- Treat the HTML shape as unstable. If parsing returns zero archetypes or zero
  variants, inspect the latest page snippet before changing data assumptions.
- HSGuru publicly shows game counts, not unique player counts. Do not label
  `games` as player count.
- Prefer saving the exact source URLs in the output JSON for reproducibility.

## Known Limitations

- This is HTML scraping, not an official API integration.
- Data is only as current as HSGuru's rendered page at fetch time.
- The public pages expose total games and winrates, but not unique users.
- The `min_games=50` setting is a tradeoff: it improves variant coverage for
  smaller archetypes but may include lower-sample deck lists.
- HSGuru may change class names or page structure, which would require parser
  updates.

## Next Step

If this becomes production functionality, move the spike script into a typed
data-ingestion module with tests built from saved HTML fixtures. Keep the output
schema above stable for downstream consumers.

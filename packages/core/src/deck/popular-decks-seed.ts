/**
 * Hand-curated popular decks for the Deck Finder UI.
 *
 * Sourced from the HSGuru spike — see docs/spikes/0005-hsguru-data-pull.md
 * Snapshot: 2026-04-27T04:50:30.917Z (legend-rank, sorted by total games).
 *
 * MAINTENANCE: Hearthstone meta drifts every patch. Re-run
 * `data/hsguru-data-spider/src/fetch-legend-top20.mjs` to pull fresh
 * data, then `node node_modules/tsx/dist/cli.mjs
 * scripts/build-popular-decks-seed.ts` to regenerate this file.
 *
 * Source-of-truth for the Deck Finder. The renderer never imports
 * this file directly — it goes through the `popular-decks:list` IPC.
 */
import type { PopularDeck } from './deck-types';

export const POPULAR_DECKS_SEED: readonly PopularDeck[] = [
  { id: 'harold-rogue-39285857', name: 'Harold Rogue', class: 'ROGUE', format: 'Standard', archetype: 'Tempo', deckstring: 'AAECAaIHCsODB9GdB+ylB4aoB4eoB4ioB9C/B4rUB5vUB4jZBwr3nwT3gQeQgweMrQfHrgfZrweaswe0wQedxQfVxQcAAA==', winratePercent: 50.2, gamesCount: 43449, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'dragon-warrior-39274898', name: 'Dragon Warrior', class: 'WARRIOR', format: 'Standard', archetype: 'Midrange', deckstring: 'AAECAQcCi6AE0LIHDuPmBqr8Bqv8BuiHB9KXB7etB4+xB+yyB4S9B7XAB5XCB5vCB5zCB/nDBwAA', winratePercent: 56.6, gamesCount: 16975, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'merithra-druid-38956531', name: 'Merithra Druid', class: 'DRUID', format: 'Standard', archetype: 'Midrange', deckstring: 'AAECAZICCqn1BqGBB5KDB8ODB6+HB6yIB4KYB7iyB+DAB+LABwqunwSIgweqrwesrwfosQe+sgeEvQfXwAfYwAeT8QcAAA==', winratePercent: 52.7, gamesCount: 22008, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'no-minion-dh-38744796', name: 'No Minion DH', class: 'DEMONHUNTER', format: 'Standard', archetype: 'Combo', deckstring: 'AAECAea5Awa0lweKqgeSqgeTqgensQeUvwcM4fgF3v8G/oMHqocHtpcH550HnrEHobEHwLEH6LEHkr8Hlb8HAAA=', winratePercent: 55.8, gamesCount: 18868, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'harold-dk-39437319', name: 'Harold DK', class: 'DEATHKNIGHT', format: 'Standard', archetype: 'Tempo', deckstring: 'AAECAfHhBAzUngbV5QaSgwfDgweCmAf0qgeRqwfisQfQvwf2wQfqyQeb1AcJ2OUGgf0Gl4IHupUHj74Hjr8HtcAHmsUH0MUHAAA=', winratePercent: 49.3, gamesCount: 2476, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'control-priest-39284899', name: 'Control Priest', class: 'PRIEST', format: 'Standard', archetype: 'Control', deckstring: 'AAECAa0GBqiWB/ypB4CqB4SqB+SyB4O/BwzwnwTLoASg+wbD/waFhge2lAedrQeFvwebvweixAeyxQeW/AcAAA==', winratePercent: 47.9, gamesCount: 3210, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'quest-mage-39409443', name: 'Quest Mage', class: 'MAGE', format: 'Standard', archetype: 'Combo', deckstring: 'AAECAf0EAqebB/KyBw6b8gazhwfxkQewmwf6mwfVnQfRpgfLtgf5wweGxAeSxAeT2geG4AecgggAAA==', winratePercent: 48.9, gamesCount: 7187, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'harold-shaman-38605945', name: 'Harold Shaman', class: 'SHAMAN', format: 'Standard', archetype: 'Tempo', deckstring: 'AAECAaoICq+fBP2fBMODB4KYB9umB9+mB+WmB9C/B4LUB5vUBwrmlgf1rAexsAe8sQePvgfDwAfJwAf3wAf2wQfm/QcAAA==', winratePercent: 55.4, gamesCount: 5148, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'end-of-turnadin-38853066', name: 'End of Turnadin', class: 'PALADIN', format: 'Standard', archetype: 'Combo', deckstring: 'AAECAZ8FBvD+BsODB+6oB++oB/CoB+XBBwzJoAS6lgfLqQfErgf1rwe+sgfiwQfowQfqwQf2wQeDwgerxgcAAA==', winratePercent: 55.9, gamesCount: 11116, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'no-hand-hunter-38675288', name: 'No Hand Hunter', class: 'HUNTER', format: 'Standard', archetype: 'Aggro', deckstring: 'AAECAR8EmacHmqcHm6cHhMQHDamfBKqfBNOeBq+SB4WVB86bB+6fB5CnB5inB9SvB7TAB7nAB7vABwAA', winratePercent: 52.1, gamesCount: 2815, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'harold-egglock-38678571', name: 'Harold Egglock', class: 'WARLOCK', format: 'Standard', archetype: 'Tempo', deckstring: 'AAECAf0GBMSeBvWYB+ybB9edBw2PnwSRoATnoATrhAepiAeEmQfenQfgnQfhnQeTvgfXvgfYvgfgvgcAAA==', winratePercent: 49.2, gamesCount: 2962, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'aggro-paladin-39375805', name: 'Aggro Paladin', class: 'PALADIN', format: 'Standard', archetype: 'Aggro', deckstring: 'AAECAZ8FBM/+BrqWB8avB+XBBw2WoATJoATTngbUngbI/wb1gQeFlQfXlwfOmwf1rwe1wAf2wQeDwgcAAA==', winratePercent: 58.2, gamesCount: 2783, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'quest-warrior-39456079', name: 'Quest Warrior', class: 'WARRIOR', format: 'Standard', archetype: 'Combo', deckstring: 'AAECAQcKzp4GqfUG7o8HtpQH1JcHyqsH2LIHucMHhMQH/94HCoagBI7UBOiHB4uYB9WmB+qnB/yvB4+xB7DBB5zCBwAA', winratePercent: 43.1, gamesCount: 547, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'token-druid-39470012', name: 'Token Druid', class: 'DRUID', format: 'Standard', archetype: 'Aggro', deckstring: 'AAECAZICAq+HB+DABw6unwSB1ASIgweuhweSlweUlwfXlwe4nweqrwfXwAfYwAfbwAfswAf2wQcAAA==', winratePercent: 54.3, gamesCount: 4551, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'egg-warrior-38756500', name: 'Egg Warrior', class: 'WARRIOR', format: 'Standard', archetype: 'Aggro', deckstring: 'AAECAQcEw4MH9ZgHn5kH150HDYagBI7UBJzUBOPmBsyPB9OXB+CdB9WmB+qnB/yvB9CyB7DBB5zCBwAA', winratePercent: 53.7, gamesCount: 4065, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'harold-dh-39186003', name: 'Harold DH', class: 'DEMONHUNTER', format: 'Standard', archetype: 'Tempo', deckstring: 'AAECAea5Awi2nwSKqgeSqgeTqgeUvwfQvwfUyQeb1AcLs6AE4fgF3v8GqocHpYgHtJcHtpcHjb8Hkr8Hlb8H4L8HAAA=', winratePercent: 49.3, gamesCount: 850, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'rafaamlock-39235146', name: 'Rafaamlock', class: 'WARLOCK', format: 'Standard', archetype: 'Tempo', deckstring: 'AAECAf0GEMODB4KYB9edB4ilB4mlB4qlB5GlB5OlB5SlB5WlB5alB5elB5qlB9C/B/jTB5vUBwznoATfggepiAeEmQfenQfhnQeTvgfXvgfYvgfgvgfNvwf2wQcAAA==', winratePercent: 39, gamesCount: 326, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'quest-hunter-39266007', name: 'Quest Hunter', class: 'HUNTER', format: 'Standard', archetype: 'Combo', deckstring: 'AAECAR8GmKAEzZ4GkoMHrIgHqJcHu8AHDKmfBOD4Ba+SB8yWB9yWB96WB9eXB/2bB8iuB/qwB4SxB8GyBwAA', winratePercent: 52, gamesCount: 1169, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'harold-warrior-39289946', name: 'Harold Warrior', class: 'WARRIOR', format: 'Standard', archetype: 'Tempo', deckstring: 'AAECAQcGw4MH6IcH0L8HsMEHzskHm9QHDJ+fBIagBI7UBOPmBpKkB/yvB4+xB9CyB4++B6/BB5zCB6DFBwAA', winratePercent: 42.6, gamesCount: 101, author: 'hsguru', updatedAt: '2026-04-27' },
  { id: 'imbue-paladin-38594503', name: 'Imbue Paladin', class: 'PALADIN', format: 'Standard', archetype: 'Midrange', deckstring: 'AAECAZ8FBPD+BrSBB8ODB/KDBw2cnwTunwTJoATW+gah+wbP/gbv/gbI/wb3gQfAhwfCjwfDjwe2lAcAAA==', winratePercent: 43.5, gamesCount: 207, author: 'hsguru', updatedAt: '2026-04-27' },
];

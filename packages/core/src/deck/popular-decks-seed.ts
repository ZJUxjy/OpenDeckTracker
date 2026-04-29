/**
 * Hand-curated popular decks for the Deck Finder UI.
 *
 * MAINTENANCE: Hearthstone meta drifts every patch. The deckstrings here
 * are stable structurally (round-trippable through `decodeDeck` /
 * `encodeDeck`) but the dbfId picks are placeholders chosen so the
 * archetypes / classes / formats are diverse — they are NOT current-meta
 * tournament builds. Update this file when refreshing the curated list,
 * roughly once per Hearthstone meta cycle.
 *
 * Source-of-truth for the Deck Finder. The renderer never imports this
 * file directly — it goes through the `popular-decks:list` IPC.
 */
import type { PopularDeck } from './deck-types';

export const POPULAR_DECKS_SEED: readonly PopularDeck[] = [
  { id: 'aggro-fire-mage', name: 'Aggro Fire Mage', class: 'MAGE', format: 'Standard', archetype: 'Aggro', deckstring: 'AAECAf0EAA/AuALBuALCuALDuALEuALFuALGuALHuALIuALJuALKuALLuALMuALNuALOuAIA', winratePercent: 58, gamesCount: 12400, dustCost: 4800, author: 'thalia', updatedAt: '2026-04-25' },
  { id: 'control-warrior', name: 'Control Warrior', class: 'WARRIOR', format: 'Standard', archetype: 'Control', deckstring: 'AAECAQcSrsACr8ACsMACscACssACs8ACtMACtcACtsACt8ACuMACucACusACu8ACvMACvcACvsACv8ACBqjAAqnAAqrAAqvAAqzAAq3AAgA=', winratePercent: 54, gamesCount: 8240, dustCost: 11200, author: 'okuda', updatedAt: '2026-04-22' },
  { id: 'midrange-hunter', name: 'Midrange Hunter', class: 'HUNTER', format: 'Standard', archetype: 'Midrange', deckstring: 'AAECAR8AD5DIApHIApLIApPIApTIApXIApbIApfIApjIApnIAprIApvIApzIAp3IAp7IAgA=', winratePercent: 56, gamesCount: 9080, dustCost: 6400, author: 'luma', updatedAt: '2026-04-26' },
  { id: 'reno-priest', name: 'Reno Priest', class: 'PRIEST', format: 'Wild', archetype: 'Combo', deckstring: 'AAEBAa0GEv7PAv/PAoDQAoHQAoLQAoPQAoTQAoXQAobQAofQAojQAonQAorQAovQAozQAo3QAo7QAo/QAgb4zwL5zwL6zwL7zwL8zwL9zwIA', winratePercent: 52, gamesCount: 6120, dustCost: 13400, author: 'ren', updatedAt: '2026-04-24' },
  { id: 'tempo-rogue', name: 'Tempo Rogue', class: 'ROGUE', format: 'Standard', archetype: 'Tempo', deckstring: 'AAECAaIHAA/g1wLh1wLi1wLj1wLk1wLl1wLm1wLn1wLo1wLp1wLq1wLr1wLs1wLt1wLu1wIA', winratePercent: 57, gamesCount: 14500, dustCost: 5200, author: 'marlo', updatedAt: '2026-04-27' },
  { id: 'otk-druid', name: 'OTK Druid', class: 'DRUID', format: 'Standard', archetype: 'Combo', deckstring: 'AAECAZICEs7fAs/fAtDfAtHfAtLfAtPfAtTfAtXfAtbfAtffAtjfAtnfAtrfAtvfAtzfAt3fAt7fAt/fAgbI3wLJ3wLK3wLL3wLM3wLN3wIA', winratePercent: 49, gamesCount: 4320, dustCost: 14800, author: 'anzu', updatedAt: '2026-04-21' },
  { id: 'ramp-druid', name: 'Ramp Druid', class: 'DRUID', format: 'Standard', archetype: 'Ramp', deckstring: 'AAECAZICAA+w5wKx5wKy5wKz5wK05wK15wK25wK35wK45wK55wK65wK75wK85wK95wK+5wIA', winratePercent: 55, gamesCount: 7700, dustCost: 8900, author: 'lior', updatedAt: '2026-04-28' },
  { id: 'control-warlock', name: 'Control Warlock', class: 'WARLOCK', format: 'Standard', archetype: 'Control', deckstring: 'AAECAf0GEp7vAp/vAqDvAqHvAqLvAqPvAqTvAqXvAqbvAqfvAqjvAqnvAqrvAqvvAqzvAq3vAq7vAq/vAgaY7wKZ7wKa7wKb7wKc7wKd7wIA', winratePercent: 53, gamesCount: 3900, dustCost: 12100, author: 'korr', updatedAt: '2026-04-23' },
  { id: 'aggro-paladin', name: 'Aggro Paladin', class: 'PALADIN', format: 'Standard', archetype: 'Aggro', deckstring: 'AAECAZ8FAA+A9wKB9wKC9wKD9wKE9wKF9wKG9wKH9wKI9wKJ9wKK9wKL9wKM9wKN9wKO9wIA', winratePercent: 56, gamesCount: 5640, dustCost: 4200, author: 'fae', updatedAt: '2026-04-25' },
  { id: 'tempo-demonhunter', name: 'Tempo Demon Hunter', class: 'DEMONHUNTER', format: 'Standard', archetype: 'Tempo', deckstring: 'AAECAea5AwAP6P4C6f4C6v4C6/4C7P4C7f4C7v4C7/4C8P4C8f4C8v4C8/4C9P4C9f4C9v4CAA==', winratePercent: 55, gamesCount: 6800, dustCost: 5600, author: 'azalea', updatedAt: '2026-04-26' },
  { id: 'control-shaman', name: 'Nature Shaman', class: 'SHAMAN', format: 'Standard', archetype: 'Control', deckstring: 'AAECAR8S1oYD14YD2IYD2YYD2oYD24YD3IYD3YYD3oYD34YD4IYD4YYD4oYD44YD5IYD5YYD5oYD54YDBtCGA9GGA9KGA9OGA9SGA9WGAwA=', winratePercent: 51, gamesCount: 4100, dustCost: 9700, author: 'irissa', updatedAt: '2026-04-22' },
  { id: 'rainbow-deathknight', name: 'Rainbow Death Knight', class: 'DEATHKNIGHT', format: 'Standard', archetype: 'Midrange', deckstring: 'AAECAfHhBBK+jgO/jgPAjgPBjgPCjgPDjgPEjgPFjgPGjgPHjgPIjgPJjgPKjgPLjgPMjgPNjgPOjgPPjgMGuI4DuY4Duo4Du44DvI4DvY4DAA==', winratePercent: 54, gamesCount: 5500, dustCost: 8300, author: 'morgath', updatedAt: '2026-04-27' },
  { id: 'classic-zoo-warlock', name: 'Classic Zoo Warlock', class: 'WARLOCK', format: 'Classic', archetype: 'Aggro', deckstring: 'AAEDAf0GAA+glgOhlgOilgOjlgOklgOllgOmlgOnlgOolgOplgOqlgOrlgOslgOtlgOulgMA', winratePercent: 53, gamesCount: 2400, dustCost: 1800, author: 'archive', updatedAt: '2026-04-15' },
  { id: 'twist-cycle-rogue', name: 'Twist Cycle Rogue', class: 'ROGUE', format: 'Twist', archetype: 'Combo', deckstring: 'AAEEAaIHEo6eA4+eA5CeA5GeA5KeA5OeA5SeA5WeA5aeA5eeA5ieA5meA5qeA5ueA5yeA52eA56eA5+eAwaIngOJngOKngOLngOMngONngMA', winratePercent: 50, gamesCount: 1900, dustCost: 6700, author: 'tess', updatedAt: '2026-04-19' },
];

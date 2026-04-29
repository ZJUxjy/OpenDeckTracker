/* Throwaway one-shot: generate deterministic deckstrings for the
 * popular-decks seed file. Run via `node node_modules/tsx/dist/cli.mjs scripts/gen-popular-deckstrings.ts`.
 * NOT part of the build / app runtime. */
import { encodeDeck } from '../packages/hearthdb/src/deckstring/encoder';
import { DeckFormat } from '../packages/hearthdb/src/deckstring/types';

interface Entry {
  id: string;
  name: string;
  cls: string;
  hero: number;
  format: keyof typeof DeckFormat;
  archetype: string;
  // dbfId list (29 picks; the encoder repeats counts via the 1-of vs 2-of split).
  // For the seed we use opaque dbfId numbers — they don't have to map to real
  // cards for the IPC payload to render structurally.
  cards: Array<{ dbfId: number; count: number }>;
  winratePercent: number;
  gamesCount: number;
  dustCost: number;
  author: string;
  updatedAt: string;
}

// Heroes (HearthMirror-known dbfIds).
const HEROES = {
  WARRIOR: 7, SHAMAN: 31, ROGUE: 930, PALADIN: 671,
  HUNTER: 31, DRUID: 274, WARLOCK: 893, MAGE: 637,
  PRIEST: 813, DEMONHUNTER: 56550, DEATHKNIGHT: 78065,
} as const;

// dbfId placeholders. Real seed updates would replace with current-meta dbfIds.
function pad30(start: number): Array<{ dbfId: number; count: number }> {
  // 15 unique 2-of = 30 cards.
  return Array.from({ length: 15 }, (_, i) => ({ dbfId: start + i, count: 2 }));
}
function mix30(start: number): Array<{ dbfId: number; count: number }> {
  // 6 unique 2-of + 18 unique 1-of = 30 cards.
  const twoOf = Array.from({ length: 6 }, (_, i) => ({ dbfId: start + i, count: 2 }));
  const oneOf = Array.from({ length: 18 }, (_, i) => ({ dbfId: start + 6 + i, count: 1 }));
  return [...twoOf, ...oneOf];
}

const ENTRIES: Entry[] = [
  { id: 'aggro-fire-mage', name: 'Aggro Fire Mage', cls: 'MAGE', hero: HEROES.MAGE,
    format: 'Standard', archetype: 'Aggro',
    cards: pad30(40000),
    winratePercent: 58, gamesCount: 12400, dustCost: 4800,
    author: 'thalia', updatedAt: '2026-04-25' },
  { id: 'control-warrior', name: 'Control Warrior', cls: 'WARRIOR', hero: HEROES.WARRIOR,
    format: 'Standard', archetype: 'Control',
    cards: mix30(41000),
    winratePercent: 54, gamesCount: 8240, dustCost: 11200,
    author: 'okuda', updatedAt: '2026-04-22' },
  { id: 'midrange-hunter', name: 'Midrange Hunter', cls: 'HUNTER', hero: HEROES.HUNTER,
    format: 'Standard', archetype: 'Midrange',
    cards: pad30(42000),
    winratePercent: 56, gamesCount: 9080, dustCost: 6400,
    author: 'luma', updatedAt: '2026-04-26' },
  { id: 'reno-priest', name: 'Reno Priest', cls: 'PRIEST', hero: HEROES.PRIEST,
    format: 'Wild', archetype: 'Combo',
    cards: mix30(43000),
    winratePercent: 52, gamesCount: 6120, dustCost: 13400,
    author: 'ren', updatedAt: '2026-04-24' },
  { id: 'tempo-rogue', name: 'Tempo Rogue', cls: 'ROGUE', hero: HEROES.ROGUE,
    format: 'Standard', archetype: 'Tempo',
    cards: pad30(44000),
    winratePercent: 57, gamesCount: 14500, dustCost: 5200,
    author: 'marlo', updatedAt: '2026-04-27' },
  { id: 'otk-druid', name: 'OTK Druid', cls: 'DRUID', hero: HEROES.DRUID,
    format: 'Standard', archetype: 'Combo',
    cards: mix30(45000),
    winratePercent: 49, gamesCount: 4320, dustCost: 14800,
    author: 'anzu', updatedAt: '2026-04-21' },
  { id: 'ramp-druid', name: 'Ramp Druid', cls: 'DRUID', hero: HEROES.DRUID,
    format: 'Standard', archetype: 'Ramp',
    cards: pad30(46000),
    winratePercent: 55, gamesCount: 7700, dustCost: 8900,
    author: 'lior', updatedAt: '2026-04-28' },
  { id: 'control-warlock', name: 'Control Warlock', cls: 'WARLOCK', hero: HEROES.WARLOCK,
    format: 'Standard', archetype: 'Control',
    cards: mix30(47000),
    winratePercent: 53, gamesCount: 3900, dustCost: 12100,
    author: 'korr', updatedAt: '2026-04-23' },
  { id: 'aggro-paladin', name: 'Aggro Paladin', cls: 'PALADIN', hero: HEROES.PALADIN,
    format: 'Standard', archetype: 'Aggro',
    cards: pad30(48000),
    winratePercent: 56, gamesCount: 5640, dustCost: 4200,
    author: 'fae', updatedAt: '2026-04-25' },
  { id: 'tempo-demonhunter', name: 'Tempo Demon Hunter', cls: 'DEMONHUNTER', hero: HEROES.DEMONHUNTER,
    format: 'Standard', archetype: 'Tempo',
    cards: pad30(49000),
    winratePercent: 55, gamesCount: 6800, dustCost: 5600,
    author: 'azalea', updatedAt: '2026-04-26' },
  { id: 'control-shaman', name: 'Nature Shaman', cls: 'SHAMAN', hero: HEROES.SHAMAN,
    format: 'Standard', archetype: 'Control',
    cards: mix30(50000),
    winratePercent: 51, gamesCount: 4100, dustCost: 9700,
    author: 'irissa', updatedAt: '2026-04-22' },
  { id: 'rainbow-deathknight', name: 'Rainbow Death Knight', cls: 'DEATHKNIGHT', hero: HEROES.DEATHKNIGHT,
    format: 'Standard', archetype: 'Midrange',
    cards: mix30(51000),
    winratePercent: 54, gamesCount: 5500, dustCost: 8300,
    author: 'morgath', updatedAt: '2026-04-27' },
  { id: 'classic-zoo-warlock', name: 'Classic Zoo Warlock', cls: 'WARLOCK', hero: HEROES.WARLOCK,
    format: 'Classic', archetype: 'Aggro',
    cards: pad30(52000),
    winratePercent: 53, gamesCount: 2400, dustCost: 1800,
    author: 'archive', updatedAt: '2026-04-15' },
  { id: 'twist-cycle-rogue', name: 'Twist Cycle Rogue', cls: 'ROGUE', hero: HEROES.ROGUE,
    format: 'Twist', archetype: 'Combo',
    cards: mix30(53000),
    winratePercent: 50, gamesCount: 1900, dustCost: 6700,
    author: 'tess', updatedAt: '2026-04-19' },
];

const formatMap = { Wild: DeckFormat.Wild, Standard: DeckFormat.Standard, Classic: DeckFormat.Classic, Twist: DeckFormat.Twist };

console.log('// Generated by scripts/gen-popular-deckstrings.ts — do not hand-edit.');
console.log('export const POPULAR_DECKS_SEED_DATA = [');
for (const e of ENTRIES) {
  const ds = encodeDeck({
    format: formatMap[e.format],
    heroes: [e.hero],
    cards: e.cards,
  });
  console.log(`  { id: '${e.id}', name: '${e.name}', cls: '${e.cls}', format: '${e.format}', archetype: '${e.archetype}', deckstring: '${ds}', winratePercent: ${e.winratePercent}, gamesCount: ${e.gamesCount}, dustCost: ${e.dustCost}, author: '${e.author}', updatedAt: '${e.updatedAt}' },`);
}
console.log('];');

/* Throwaway one-shot: convert the HSGuru spike's JSON dataset into the
 * `packages/core/src/deck/popular-decks-seed.ts` source. Run via
 * `node node_modules/tsx/dist/cli.mjs scripts/build-popular-decks-seed.ts`.
 * NOT part of the build / app runtime.
 *
 * Replaces the earlier scripts/gen-popular-deckstrings.ts which generated
 * synthetic deckstrings — this one uses real legend-rank data from
 * data/hsguru-data-spider/data/2026-04-27-legend-top20-hsguru.json
 * (see docs/spikes/0005-hsguru-data-pull.md). */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Variant {
  deckId: number;
  title: string;
  deckUrl: string;
  code: string;
  winrate: number;
  games: number;
}

interface Archetype {
  archetype: string;
  archetypeUrl: string;
  winrate: number;
  popularityPercent: number;
  games: number;
  variants: Variant[];
}

interface Dataset {
  source: string;
  fetchedAt: string;
  archetypes: Archetype[];
}

const DATA_PATH = join(
  __dirname,
  '..',
  'data',
  'hsguru-data-spider',
  'data',
  '2026-04-27-legend-top20-hsguru.json',
);

// Map archetype-name suffix or contained word -> HeroClass.
// The HSGuru "archetype" field is a label like "Harold Rogue" / "End of Turnadin"
// / "No Minion DH" — usually class-suffixed but sometimes a custom name.
function classFromArchetype(name: string): string | null {
  const upper = name.toUpperCase();
  if (upper.includes('ROGUE')) return 'ROGUE';
  if (upper.includes('WARRIOR')) return 'WARRIOR';
  if (upper.includes('DRUID')) return 'DRUID';
  if (upper.endsWith('DH') || upper.endsWith('DEMON HUNTER') || upper.includes('DEMON HUNTER')) return 'DEMONHUNTER';
  if (upper.endsWith('DK') || upper.endsWith('DEATH KNIGHT') || upper.includes('DEATH KNIGHT')) return 'DEATHKNIGHT';
  if (upper.includes('PRIEST')) return 'PRIEST';
  if (upper.includes('MAGE')) return 'MAGE';
  if (upper.includes('SHAMAN')) return 'SHAMAN';
  if (upper.includes('PALADIN')) return 'PALADIN';
  if (upper.includes('TURNADIN')) return 'PALADIN';
  if (upper.includes('HUNTER')) return 'HUNTER';
  if (upper.includes('LOCK') || upper.includes('WARLOCK')) return 'WARLOCK';
  return null;
}

// Map archetype-name keyword -> PopularDeckArchetype enum.
function archetypeBucket(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('AGGRO') || upper.startsWith('EGG ') || upper.includes('TOKEN') || upper.includes('NO HAND')) return 'Aggro';
  if (upper.includes('CONTROL')) return 'Control';
  if (upper.includes('QUEST') || upper.includes('OTK') || upper.includes('TURNADIN') || upper.includes('NO MINION')) return 'Combo';
  if (upper.includes('RAMP')) return 'Ramp';
  if (upper.includes('DRAGON') || upper.includes('MERITHRA') || upper.includes('IMBUE')) return 'Midrange';
  // The Harold/Rafaam-style archetypes are tempo-leaning by HSGuru convention.
  if (upper.includes('HAROLD') || upper.includes('RAFAAM')) return 'Tempo';
  return 'Midrange';
}

function escapeForString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function kebabCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const ds: Dataset = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

const lines: string[] = [];
lines.push('/**');
lines.push(' * Hand-curated popular decks for the Deck Finder UI.');
lines.push(' *');
lines.push(' * Sourced from the HSGuru spike — see docs/spikes/0005-hsguru-data-pull.md');
lines.push(` * Snapshot: ${ds.fetchedAt} (legend-rank, sorted by total games).`);
lines.push(' *');
lines.push(' * MAINTENANCE: Hearthstone meta drifts every patch. Re-run');
lines.push(' * `data/hsguru-data-spider/src/fetch-legend-top20.mjs` to pull fresh');
lines.push(' * data, then `node node_modules/tsx/dist/cli.mjs');
lines.push(' * scripts/build-popular-decks-seed.ts` to regenerate this file.');
lines.push(' *');
lines.push(' * Source-of-truth for the Deck Finder. The renderer never imports');
lines.push(' * this file directly — it goes through the `popular-decks:list` IPC.');
lines.push(' */');
lines.push("import type { PopularDeck } from './deck-types';");
lines.push('');
lines.push('export const POPULAR_DECKS_SEED: readonly PopularDeck[] = [');

// Take ALL variants per archetype (the spike caps at 5 per archetype),
// sorted by games desc within each archetype, archetypes themselves
// in popularity order (input order).
let kept = 0;
const skipped: string[] = [];
const classCounts: Record<string, number> = {};
for (const a of ds.archetypes) {
  const cls = classFromArchetype(a.archetype);
  if (!cls) { skipped.push(`${a.archetype}: no class match`); continue; }
  if (a.variants.length === 0) { skipped.push(`${a.archetype}: no variants`); continue; }
  const archetype = archetypeBucket(a.archetype);
  const updatedAt = ds.fetchedAt.slice(0, 10);
  const ranked = [...a.variants].sort((x, y) => y.games - x.games);
  ranked.forEach((v, i) => {
    const id = kebabCase(`${a.archetype}-${v.deckId}`);
    // Suffix all but the most-played variant so the list shows distinct
    // names (cards do differ, just less popular tunings).
    const name = i === 0 ? a.archetype : `${a.archetype} v${i + 1}`;
    lines.push(`  { id: '${id}', name: '${escapeForString(name)}', class: '${cls}', format: 'Standard', archetype: '${archetype}', deckstring: '${v.code}', winratePercent: ${Math.round(v.winrate * 10) / 10}, gamesCount: ${v.games}, author: 'hsguru', updatedAt: '${updatedAt}' },`);
    kept++;
    classCounts[cls] = (classCounts[cls] ?? 0) + 1;
  });
}

lines.push('];');
lines.push('');

const OUT_PATH = join(__dirname, '..', 'packages', 'core', 'src', 'deck', 'popular-decks-seed.ts');
writeFileSync(OUT_PATH, lines.join('\n'));

console.log(`Wrote ${kept} entries to ${OUT_PATH}`);
console.log('Per-class counts:');
for (const [cls, n] of Object.entries(classCounts).sort((a, b) => b[1] - a[1])) {
  const flag = n < 5 ? ' ← BELOW 5' : '';
  console.log(`  ${cls.padEnd(15)} ${n}${flag}`);
}
if (skipped.length > 0) {
  console.log(`Skipped ${skipped.length}:`);
  for (const s of skipped) console.log(`  - ${s}`);
}

/**
 * HSGuru HTML parser. Extracts legend-rank archetype rows and per-archetype
 * deck variants from the raw HTML returned by hsguru.com. Pure: no I/O,
 * deterministic on input. Mirrors the spider implementation at
 * `data/hsguru-data-spider/src/fetch-legend-top20.mjs`; both are maintained
 * independently because the spider runs in a separate Node CLI environment.
 */

const BASE_URL = 'https://www.hsguru.com';

export interface HsguruArchetypeRow {
  archetype: string;
  archetypeUrl: string;
  winrate: number;
  popularityPercent: number;
  games: number;
}

export interface HsguruDeckVariant {
  deckId: number;
  title: string;
  deckUrl: string;
  code: string;
  winrate: number;
  games: number;
}

export function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function parseLegendArchetypes(html: string, limit = 20): HsguruArchetypeRow[] {
  const rows: HsguruArchetypeRow[] = [];
  const rowPattern = /<tr>([\s\S]*?)<\/tr>/g;

  for (const rowMatch of html.matchAll(rowPattern)) {
    const row = rowMatch[1] ?? '';
    const archetypeMatch = row.match(
      /<a[^>]+href="\/archetype\/([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/,
    );
    const winrateMatch = row.match(/<span>([\d.]+)<\/span>/);
    const popularityMatch = row.match(/<td>\s*([\d.]+)%\s*\((\d+)\)\s*<\/td>/);

    if (!archetypeMatch || !winrateMatch || !popularityMatch) continue;
    const slug = archetypeMatch[1] ?? '';
    const labelRaw = archetypeMatch[2] ?? '';
    const wr = winrateMatch[1] ?? '0';
    const pop = popularityMatch[1] ?? '0';
    const games = popularityMatch[2] ?? '0';

    rows.push({
      archetype: decodeHtml(labelRaw.trim()),
      archetypeUrl: `${BASE_URL}/archetype/${decodeHtml(slug)}`,
      winrate: Number(wr),
      popularityPercent: Number(pop),
      games: Number(games),
    });

    if (rows.length >= limit) break;
  }

  return rows;
}

export function parseDeckVariants(html: string, limit = 5): HsguruDeckVariant[] {
  const variants: HsguruDeckVariant[] = [];

  for (const block of html.split('<div id="deck_stats-').slice(1)) {
    const deckIdMatch = block.match(/^(\d+)"/);
    const titleMatch = block.match(
      /<a class="basic-black-text" href="\/deck\/(\d+)">\s*([^<]+?)\s*<\/a>/,
    );
    const codeMatch = block.match(
      /<span style="font-size: 0; line-size: 0; display: block">\s*([A-Za-z0-9+/=]+)\s*<\/span>/,
    );
    const donkeyIdx = block.indexOf('D0nkey');
    const statsBlock = donkeyIdx >= 0 ? block.slice(donkeyIdx) : '';
    const statsMatch = statsBlock.match(
      /<span>([\d.]+)<\/span>[\s\S]*?<div class="column tag">\s*Games:\s*(\d+)\s*<\/div>/,
    );

    if (!deckIdMatch || !titleMatch || !codeMatch || !statsMatch) continue;
    const deckIdStr = deckIdMatch[1] ?? '0';
    const title = titleMatch[2] ?? '';
    const code = codeMatch[1] ?? '';
    const wr = statsMatch[1] ?? '0';
    const games = statsMatch[2] ?? '0';

    variants.push({
      deckId: Number(deckIdStr),
      title: decodeHtml(title.trim()),
      deckUrl: `${BASE_URL}/deck/${deckIdStr}`,
      code: code.trim(),
      winrate: Number(wr),
      games: Number(games),
    });

    if (variants.length >= limit) break;
  }

  return variants;
}

export function buildDeckUrls(archetype: string): readonly string[] {
  const encoded = encodeURIComponent(archetype);
  return [
    `${BASE_URL}/decks?rank=legend&order_by=total&min_games=50&player_deck_archetype[]=${encoded}`,
    `${BASE_URL}/decks?rank=legend&order_by=total&archetype=${encoded}`,
    `${BASE_URL}/decks?rank=legend&order_by=total&archetypes=${encoded}`,
    `${BASE_URL}/decks?rank=legend&order_by=total&deck_archetype=${encoded}`,
    `${BASE_URL}/decks?rank=legend&order_by=total&deck_archetypes=${encoded}`,
    `${BASE_URL}/decks?rank=legend&order_by=total&selected_archetypes=${encoded}`,
  ];
}

export const HSGURU_BASE_URL = BASE_URL;
export const HSGURU_META_URL = `${BASE_URL}/meta?rank=legend&sort_by=total`;

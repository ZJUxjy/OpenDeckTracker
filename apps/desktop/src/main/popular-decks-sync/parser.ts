/**
 * HSGuru HTML parser. Extracts legend-rank archetype rows and per-archetype
 * deck variants from the raw HTML returned by hsguru.com. Pure: no I/O,
 * deterministic on input. Mirrors the spider implementation at
 * `data/hsguru-data-spider/src/fetch-legend-top20.mjs`; both are maintained
 * independently because the spider runs in a separate Node CLI environment.
 */

import type { MatchupHeroClass, PopularDeckClassMatchup } from '@hdt/core';

const BASE_URL = 'https://www.hsguru.com';

const CLASS_NAME_TO_HERO_CLASS: Readonly<Record<string, MatchupHeroClass>> = {
  'Death Knight': 'DEATHKNIGHT',
  'Demon Hunter': 'DEMONHUNTER',
  Druid: 'DRUID',
  Hunter: 'HUNTER',
  Mage: 'MAGE',
  Paladin: 'PALADIN',
  Priest: 'PRIEST',
  Rogue: 'ROGUE',
  Shaman: 'SHAMAN',
  Warlock: 'WARLOCK',
  Warrior: 'WARRIOR',
};

const CLASS_ROW_PATTERN =
  /(Death Knight|Demon Hunter|Druid|Hunter|Mage|Paladin|Priest|Rogue|Shaman|Warlock|Warrior)\s+(\d+(?:\.\d+)?)%?\s+([\d,]+)\s+\((\d+(?:\.\d+)?)%\)/g;
const TOTAL_ROW_PATTERN = /\bTotal\s+\d+(?:\.\d+)?%?\s+[\d,]+/i;

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

function htmlCellText(value: string): string {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMatchupCells(
  className: string,
  winrateText: string,
  gamesText: string,
): PopularDeckClassMatchup | undefined {
  const opponentClass = CLASS_NAME_TO_HERO_CLASS[className.trim()];
  const winrateMatch = winrateText.match(/(\d+(?:\.\d+)?)%?/);
  const gamesMatch = gamesText.match(/([\d,]+)\s+\((\d+(?:\.\d+)?)%\)/);

  if (!opponentClass || !winrateMatch || !gamesMatch) return undefined;

  return {
    opponentClass,
    winratePercent: Number(winrateMatch[1] ?? '0'),
    gamesCount: Number((gamesMatch[1] ?? '0').replace(/,/g, '')),
    popularityPercent: Number(gamesMatch[2] ?? '0'),
  };
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

export function parseDeckClassMatchups(html: string): PopularDeckClassMatchup[] {
  if (!html.includes('Class') || !html.includes('Winrate') || !html.includes('Total Games')) {
    return [];
  }

  const tableRows: PopularDeckClassMatchup[] = [];
  for (const tableMatch of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const table = tableMatch[1] ?? '';
    const tableText = htmlCellText(table);
    if (
      !tableText.includes('Class') ||
      !tableText.includes('Winrate') ||
      !tableText.includes('Total Games')
    ) {
      continue;
    }

    for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const row = rowMatch[1] ?? '';
      const cells = Array.from(row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi), (match) =>
        htmlCellText(match[1] ?? ''),
      );
      if (cells.length < 3) continue;

      const matchup = parseMatchupCells(cells[0] ?? '', cells[1] ?? '', cells[2] ?? '');
      if (matchup) tableRows.push(matchup);
    }
  }
  if (tableRows.length > 0) return tableRows;

  const text = decodeHtml(html)
    .replace(/<[^>]+>/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
  const headerMatch = text.match(/Class\s+Winrate\s+Total Games/i);
  if (!headerMatch || headerMatch.index === undefined) return [];

  const afterHeader = text.slice(headerMatch.index + headerMatch[0].length);
  const totalMatch = afterHeader.match(TOTAL_ROW_PATTERN);
  if (!totalMatch || totalMatch.index === undefined) return [];

  const matchupText = afterHeader.slice(0, totalMatch.index);

  const rows: PopularDeckClassMatchup[] = [];
  for (const match of matchupText.matchAll(CLASS_ROW_PATTERN)) {
    const className = match[1] ?? '';
    const opponentClass = CLASS_NAME_TO_HERO_CLASS[className];
    if (!opponentClass) continue;

    rows.push({
      opponentClass,
      winratePercent: Number(match[2] ?? '0'),
      gamesCount: Number((match[3] ?? '0').replace(/,/g, '')),
      popularityPercent: Number(match[4] ?? '0'),
    });
  }
  return rows;
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

/**
 * HSGuru HTML parser. Extracts legend-rank archetype rows and per-archetype
 * deck variants from the raw HTML returned by hsguru.com. Pure: no I/O,
 * deterministic on input. Mirrors the spider implementation at
 * `data/hsguru-data-spider/src/fetch-legend-top20.mjs`; both are maintained
 * independently because the spider runs in a separate Node CLI environment.
 */

import type { MatchupHeroClass, PopularDeckClassMatchup } from '@hdt/core';

const BASE_URL = 'https://www.hsguru.com';

export type HsguruFormat = 'standard' | 'wild';

const FORMAT_PARAM: Readonly<Record<HsguruFormat, number>> = {
  standard: 2,
  wild: 1,
};

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
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const rowMatch of html.matchAll(rowPattern)) {
    const row = rowMatch[1] ?? '';
    const cells = Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
      (match) => match[1] ?? '');
    const archetypeMatch = cells[0]?.match(
      /<a\b[^>]+href="\/archetype\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    // Read the data cells, not presentation-specific span/class markup.
    // HSGuru added Tailwind attributes to both rows and cells in September 2026.
    const winrateMatch = htmlCellText(cells[1] ?? '').match(/^(\d+(?:\.\d+)?)%?$/);
    const popularityMatch = htmlCellText(cells[2] ?? '')
      .match(/^(\d+(?:\.\d+)?)%\s*\(([\d,]+)\)$/);

    if (!archetypeMatch || !winrateMatch || !popularityMatch) continue;
    const slug = archetypeMatch[1] ?? '';
    const labelRaw = archetypeMatch[2] ?? '';
    const wr = winrateMatch[1] ?? '0';
    const pop = popularityMatch[1] ?? '0';
    const games = popularityMatch[2] ?? '0';

    rows.push({
      archetype: htmlCellText(labelRaw),
      archetypeUrl: `${BASE_URL}/archetype/${decodeHtml(slug)}`,
      winrate: Number(wr),
      popularityPercent: Number(pop),
      games: Number(games.replace(/,/g, '')),
    });

    if (rows.length >= limit) break;
  }

  return rows;
}

export function parseDeckVariants(html: string, limit = 5): HsguruDeckVariant[] {
  const variants: HsguruDeckVariant[] = [];

  for (const block of html.split('<div id="deck_stats-').slice(1)) {
    const deckIdMatch = block.match(/^(\d+)"/);
    if (!deckIdMatch) continue;

    const titleMatch = block.match(
      /<a class="basic-black-text" href="(?:https:\/\/www\.hsguru\.com)?\/deck\/(\d+)">\s*([^<]+?)\s*<\/a>/,
    );
    const code = extractDeckCode(block);
    const stats = extractDeckVariantStats(block);

    if (!titleMatch || !code || !stats) continue;
    const deckIdStr = deckIdMatch[1] ?? titleMatch[1] ?? '0';
    const title = titleMatch[2] ?? '';

    variants.push({
      deckId: Number(deckIdStr),
      title: decodeHtml(title.trim()),
      deckUrl: `${BASE_URL}/deck/${deckIdStr}`,
      code,
      winrate: stats.winrate,
      games: stats.games,
    });

    if (variants.length >= limit) break;
  }

  return variants;
}

/** Pull a deckstring from the variant block — HSGuru hides it in a
 *  zero-size span, a clipboard payload, or inline after the card list. */
function extractDeckCode(block: string): string | null {
  const hiddenSpan = block.match(
    /<span style="font-size: 0; line-size: 0; display: block">\s*([A-Za-z0-9+/=]+)\s*<\/span>/,
  );
  if (hiddenSpan?.[1]) return hiddenSpan[1].trim();

  const clipboard = block.match(/data-clipboard-text="[\s\S]*?(AAE[A-Za-z0-9+/=]+)/);
  if (clipboard?.[1]) return clipboard[1].trim();

  const inline = block.match(/(AAE[A-Za-z0-9+/=]{20,})/);
  return inline?.[1]?.trim() ?? null;
}

/** Winrate + games moved below the expanded card list; locate via the
 *  trailing `Games:` tag instead of the legacy D0nkey marker. */
function extractDeckVariantStats(block: string): { winrate: number; games: number } | null {
  const gamesMatch = block.match(/<div class="column tag">\s*Games:\s*([\d,]+)\s*<\/div>/i);
  if (!gamesMatch) return null;

  const games = Number((gamesMatch[1] ?? '0').replace(/,/g, ''));
  const gamesIdx = gamesMatch.index ?? block.length;
  const statsTail = block.slice(Math.max(0, gamesIdx - 1_500), gamesIdx + gamesMatch[0].length);

  const labeledWr = [
    ...statsTail.matchAll(
      /<span class="tw-text-center basic-black-text">\s*<span>([\d.]+)<\/span>/g,
    ),
  ].at(-1)?.[1];
  const genericWr = [...statsTail.matchAll(/<span>([\d.]+)<\/span>/g)].at(-1)?.[1];
  const winrateText = labeledWr ?? genericWr;
  if (!winrateText) return null;

  return { winrate: Number(winrateText), games };
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

export function buildMetaUrl(format: HsguruFormat = 'standard'): string {
  return `${BASE_URL}/meta?format=${FORMAT_PARAM[format]}&rank=legend&sort_by=total`;
}

export function buildDeckUrls(archetype: string, format: HsguruFormat = 'standard'): readonly string[] {
  const encoded = encodeURIComponent(archetype);
  const prefix = `${BASE_URL}/decks?format=${FORMAT_PARAM[format]}&rank=legend&order_by=total`;
  return [
    `${prefix}&min_games=50&player_deck_archetype[]=${encoded}`,
    `${prefix}&archetype=${encoded}`,
    `${prefix}&archetypes=${encoded}`,
    `${prefix}&deck_archetype=${encoded}`,
    `${prefix}&deck_archetypes=${encoded}`,
    `${prefix}&selected_archetypes=${encoded}`,
  ];
}

export const HSGURU_BASE_URL = BASE_URL;
export const HSGURU_META_URL = buildMetaUrl('standard');

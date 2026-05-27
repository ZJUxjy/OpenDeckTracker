import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDeckUrls,
  decodeHtml,
  parseDeckClassMatchups,
  parseDeckVariants,
  parseLegendArchetypes,
} from './parser';

const FIX_DIR = join(__dirname, '__fixtures__');
const META_HTML = readFileSync(join(FIX_DIR, 'hsguru-meta.html'), 'utf-8');
const ARCHETYPE_HTML = readFileSync(join(FIX_DIR, 'hsguru-archetype.html'), 'utf-8');
const DECK_DETAIL_HTML = readFileSync(join(FIX_DIR, 'hsguru-deck-detail.html'), 'utf-8');

describe('parseLegendArchetypes', () => {
  it('extracts archetype rows from the meta fixture', () => {
    const rows = parseLegendArchetypes(META_HTML);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const tempo = rows.find((r) => r.archetype === 'Tempo Rogue');
    expect(tempo).toBeDefined();
    expect(tempo?.winrate).toBe(52.3);
    expect(tempo?.games).toBe(43449);
    expect(tempo?.popularityPercent).toBeCloseTo(12.4, 1);
    expect(tempo?.archetypeUrl).toContain('hsguru.com/archetype/Tempo%20Rogue');
  });

  it('decodes HTML entities in the archetype label', () => {
    const rows = parseLegendArchetypes(META_HTML);
    const dragon = rows.find((r) => r.archetype.includes('&'));
    expect(dragon?.archetype).toBe('Dragon & Warrior');
  });

  it('returns empty array for empty input', () => {
    expect(parseLegendArchetypes('')).toEqual([]);
  });

  it('respects the limit parameter', () => {
    const rows = parseLegendArchetypes(META_HTML, 1);
    expect(rows).toHaveLength(1);
  });
});

describe('parseDeckVariants', () => {
  it('extracts deck variants from the archetype fixture', () => {
    const variants = parseDeckVariants(ARCHETYPE_HTML);
    expect(variants.length).toBeGreaterThanOrEqual(2);
    const first = variants[0]!;
    expect(first.deckId).toBe(39285857);
    expect(first.title).toBe('Tempo Rogue Variant');
    expect(first.code).toMatch(/^AAECA/);
    expect(first.winrate).toBe(50.2);
    expect(first.games).toBe(43449);
    expect(first.deckUrl).toBe('https://www.hsguru.com/deck/39285857');
  });

  it('skips broken blocks missing required fields', () => {
    const variants = parseDeckVariants(ARCHETYPE_HTML);
    expect(variants.every((v) => v.code.length > 0)).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(parseDeckVariants('')).toEqual([]);
  });
});

describe('parseDeckClassMatchups', () => {
  it('extracts opponent class matchup rows from the deck detail fixture', () => {
    const rows = parseDeckClassMatchups(DECK_DETAIL_HTML);
    expect(rows).toHaveLength(11);
    expect(rows[0]).toEqual({
      opponentClass: 'DEATHKNIGHT',
      winratePercent: 40,
      gamesCount: 5,
      popularityPercent: 2.2,
    });
    expect(rows.find((r) => r.opponentClass === 'WARLOCK')).toEqual({
      opponentClass: 'WARLOCK',
      winratePercent: 77.8,
      gamesCount: 9,
      popularityPercent: 3.9,
    });
  });

  it('skips the Total row', () => {
    const rows = parseDeckClassMatchups(DECK_DETAIL_HTML);
    expect(rows.map((r) => r.opponentClass)).not.toContain('NEUTRAL');
    expect(rows).toHaveLength(11);
  });

  it('returns an empty array when the class matchup table is absent', () => {
    expect(parseDeckClassMatchups('<html><body>No stats here</body></html>')).toEqual([]);
  });

  it('supports compact text-rendered HSGuru output', () => {
    const html = [
      'Class Winrate Total Games',
      'Druid 44.0 50 (21.6%)',
      'Warrior 33.3 9 (3.9%)',
      'Total 55.4 231',
    ].join('\n');
    expect(parseDeckClassMatchups(html)).toEqual([
      { opponentClass: 'DRUID', winratePercent: 44, gamesCount: 50, popularityPercent: 21.6 },
      { opponentClass: 'WARRIOR', winratePercent: 33.3, gamesCount: 9, popularityPercent: 3.9 },
    ]);
  });

  it('ignores class-shaped stats outside the matchup table', () => {
    const html = `
      <table>
        <thead><tr><th>Class</th><th>Winrate</th><th>Total Games</th></tr></thead>
        <tbody>
          <tr><td>Druid</td><td>44.0</td><td>50 (21.6%)</td></tr>
          <tr><td>Total</td><td>55.4</td><td>231</td></tr>
        </tbody>
      </table>
      <section>
        <h2>Related Decks</h2>
        <div>Token Druid 99.9 4,551 (3.9%)</div>
      </section>
    `;
    expect(parseDeckClassMatchups(html)).toEqual([
      { opponentClass: 'DRUID', winratePercent: 44, gamesCount: 50, popularityPercent: 21.6 },
    ]);
  });
});

describe('decodeHtml', () => {
  it('decodes the documented entity set', () => {
    expect(decodeHtml('&amp;&lt;&gt;&quot;&#39;')).toBe('&<>"\'');
  });
});

describe('buildDeckUrls', () => {
  it('encodes the archetype label and returns multiple candidate URLs', () => {
    const urls = buildDeckUrls('Tempo Rogue');
    expect(urls.length).toBeGreaterThan(1);
    expect(urls.every((u) => u.includes('Tempo%20Rogue'))).toBe(true);
  });
});

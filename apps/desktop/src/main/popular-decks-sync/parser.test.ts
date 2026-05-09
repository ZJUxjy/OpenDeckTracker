import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDeckUrls,
  decodeHtml,
  parseDeckVariants,
  parseLegendArchetypes,
} from './parser';

const FIX_DIR = join(__dirname, '__fixtures__');
const META_HTML = readFileSync(join(FIX_DIR, 'hsguru-meta.html'), 'utf-8');
const ARCHETYPE_HTML = readFileSync(join(FIX_DIR, 'hsguru-archetype.html'), 'utf-8');

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

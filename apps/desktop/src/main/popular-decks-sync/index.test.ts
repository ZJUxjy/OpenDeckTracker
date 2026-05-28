import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CardDef } from '@hdt/hearthdb';
import { decodeDeck } from '@hdt/hearthdb';
import {
  PopularDeckSyncOrchestrator,
  type SyncProgress,
} from './index';
import { saveCache, SYNCED_FILENAME } from './storage';

const ROGUE_DECKSTRING =
  'AAECAaIHCsODB9GdB+ylB4aoB4eoB4ioB9C/B4rUB5vUB4jZBwr3nwT3gQeQgweMrQfHrgfZrweaswe0wQedxQfVxQcAAA==';

const META_HTML = `
  <tr>
    <td><a href="/archetype/Tempo%20Rogue">Tempo Rogue</a></td>
    <td><span>50.2</span></td>
    <td>  10.0% (43449) </td>
  </tr>
`;

const TWO_ARCHETYPE_META_HTML = `
  ${META_HTML}
  <tr>
    <td><a href="/archetype/Control%20Priest">Control Priest</a></td>
    <td><span>49.8</span></td>
    <td>  8.0% (30000) </td>
  </tr>
`;

const ARCHETYPE_HTML = `
  <div id="deck_stats-39285857">
    <a class="basic-black-text" href="/deck/39285857">Harold Rogue</a>
    <span style="font-size: 0; line-size: 0; display: block">${ROGUE_DECKSTRING}</span>
    <div>D0nkey<span>50.2</span><div class="column tag">Games: 43449</div></div>
  </div>
`;

const TWO_VARIANT_ARCHETYPE_HTML = `
  ${ARCHETYPE_HTML}
  <div id="deck_stats-39285858">
    <a class="basic-black-text" href="/deck/39285858">Harold Rogue 2</a>
    <span style="font-size: 0; line-size: 0; display: block">${ROGUE_DECKSTRING}</span>
    <div>D0nkey<span>49.9</span><div class="column tag">Games: 30000</div></div>
  </div>
`;

const DECK_DETAIL_HTML = `
  Class Winrate Total Games
  Mage 60.0 10 (20.0%)
  Warrior 40.0 5 (10.0%)
  Total 53.3 15
`;

function fakeHeroCard(heroDbfId: number, cardClass: string): CardDef {
  return {
    id: `H${heroDbfId}`,
    dbfId: heroDbfId,
    name: 'TestHero',
    cost: 0,
    cardClass,
    set: 'TEST',
    type: 'HERO',
    collectible: true,
  } as CardDef;
}

function makeOrchestrator(opts: {
  cacheDir: string;
  metaHtml?: string;
  archetypeHtml?: string;
  fetchSpy?: ReturnType<typeof vi.fn>;
}) {
  const heroDbfId = decodeDeck(ROGUE_DECKSTRING).heroes[0]!;
  const lookup = (dbfId: number): CardDef | null =>
    dbfId === heroDbfId ? fakeHeroCard(heroDbfId, 'ROGUE') : null;
  const fetchImpl =
    opts.fetchSpy ??
    vi.fn(async (url: string) => {
      if (url.includes('/meta?')) {
        return new Response(opts.metaHtml ?? META_HTML, { status: 200 });
      }
      if (url.includes('/deck/39285857')) {
        return new Response(DECK_DETAIL_HTML, { status: 200 });
      }
      return new Response(opts.archetypeHtml ?? ARCHETYPE_HTML, { status: 200 });
    });
  return new PopularDeckSyncOrchestrator({
    fetchImpl,
    getCardLookup: () => lookup,
    cacheDir: opts.cacheDir,
    delay: async () => undefined,
    now: () => new Date('2026-05-09T12:00:00Z'),
  });
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pds-orch-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('PopularDeckSyncOrchestrator.startSync', () => {
  it('returns ok with fetchedAt + count and writes synced.json', async () => {
    const orch = makeOrchestrator({ cacheDir: dir });
    const progress: SyncProgress[] = [];
    const result = await orch.startSync((p) => progress.push(p));
    expect(result).toEqual({
      ok: true,
      fetchedAt: '2026-05-09T12:00:00.000Z',
      count: 1,
    });
    expect(existsSync(join(dir, SYNCED_FILENAME))).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, SYNCED_FILENAME), 'utf-8'));
    expect(onDisk.decks).toHaveLength(1);
    expect(onDisk.decks[0].class).toBe('ROGUE');
  });

  it('fetches deck detail pages and persists class matchups', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('/meta?')) return new Response(META_HTML, { status: 200 });
      if (url.includes('/deck/39285857')) {
        return new Response(DECK_DETAIL_HTML, { status: 200 });
      }
      return new Response(ARCHETYPE_HTML, { status: 200 });
    });
    const orch = makeOrchestrator({ cacheDir: dir, fetchSpy });
    const result = await orch.startSync(() => undefined);
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://www.hsguru.com/deck/39285857',
      expect.any(Object),
    );
    const onDisk = JSON.parse(readFileSync(join(dir, SYNCED_FILENAME), 'utf-8'));
    expect(onDisk.schemaVersion).toBe(2);
    expect(onDisk.decks[0].classMatchups).toEqual([
      { opponentClass: 'MAGE', winratePercent: 60, gamesCount: 10, popularityPercent: 20 },
      { opponentClass: 'WARRIOR', winratePercent: 40, gamesCount: 5, popularityPercent: 10 },
    ]);
  });

  it('reuses cached class matchups for unchanged HSGuru deck ids', async () => {
    const cachedMatchups = [
      { opponentClass: 'MAGE' as const, winratePercent: 55.5, gamesCount: 22, popularityPercent: 7.5 },
    ];
    await saveCache(dir, {
      schemaVersion: 2,
      fetchedAt: '2026-05-08T12:00:00.000Z',
      decks: [{
        id: 'tempo-rogue-39285857',
        name: 'Harold Rogue',
        class: 'ROGUE',
        format: 'Standard',
        archetype: 'Tempo',
        deckstring: ROGUE_DECKSTRING,
        winratePercent: 50.2,
        gamesCount: 43449,
        author: 'hsguru',
        updatedAt: '2026-05-08',
        classMatchups: cachedMatchups,
      }],
    });

    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('/meta?')) return new Response(META_HTML, { status: 200 });
      if (url.includes('/deck/39285857')) throw new Error('detail should be reused');
      return new Response(ARCHETYPE_HTML, { status: 200 });
    });
    const orch = makeOrchestrator({ cacheDir: dir, fetchSpy });
    await orch.loadCacheOnce();

    const result = await orch.startSync(() => undefined);

    expect(result.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalledWith(
      'https://www.hsguru.com/deck/39285857',
      expect.any(Object),
    );
    const onDisk = JSON.parse(readFileSync(join(dir, SYNCED_FILENAME), 'utf-8'));
    expect(onDisk.decks[0].classMatchups).toEqual(cachedMatchups);
  });

  it('fetches deck detail pages with bounded parallelism', async () => {
    let inFlightDetails = 0;
    let maxInFlightDetails = 0;
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('/meta?')) return new Response(META_HTML, { status: 200 });
      if (url.includes('/deck/')) {
        inFlightDetails++;
        maxInFlightDetails = Math.max(maxInFlightDetails, inFlightDetails);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlightDetails--;
        return new Response(DECK_DETAIL_HTML, { status: 200 });
      }
      return new Response(TWO_VARIANT_ARCHETYPE_HTML, { status: 200 });
    });
    const orch = makeOrchestrator({ cacheDir: dir, fetchSpy });

    const result = await orch.startSync(() => undefined);

    expect(result).toEqual({
      ok: true,
      fetchedAt: '2026-05-09T12:00:00.000Z',
      count: 2,
    });
    expect(maxInFlightDetails).toBeGreaterThan(1);
  });

  it('fetches archetype variant pages with bounded parallelism', async () => {
    let inFlightVariants = 0;
    let maxInFlightVariants = 0;
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('/meta?')) return new Response(TWO_ARCHETYPE_META_HTML, { status: 200 });
      if (url.includes('/deck/')) return new Response(DECK_DETAIL_HTML, { status: 200 });
      inFlightVariants++;
      maxInFlightVariants = Math.max(maxInFlightVariants, inFlightVariants);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlightVariants--;
      return new Response(ARCHETYPE_HTML, { status: 200 });
    });
    const orch = makeOrchestrator({ cacheDir: dir, fetchSpy });

    const result = await orch.startSync(() => undefined);

    expect(result).toEqual({
      ok: true,
      fetchedAt: '2026-05-09T12:00:00.000Z',
      count: 2,
    });
    expect(maxInFlightVariants).toBeGreaterThan(1);
  });

  it('keeps the deck when its detail page fetch fails', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('/meta?')) return new Response(META_HTML, { status: 200 });
      if (url.includes('/deck/39285857')) throw new Error('detail failed');
      return new Response(ARCHETYPE_HTML, { status: 200 });
    });
    const orch = makeOrchestrator({ cacheDir: dir, fetchSpy });
    const result = await orch.startSync(() => undefined);
    expect(result).toEqual({
      ok: true,
      fetchedAt: '2026-05-09T12:00:00.000Z',
      count: 1,
    });
    const onDisk = JSON.parse(readFileSync(join(dir, SYNCED_FILENAME), 'utf-8'));
    expect(onDisk.decks[0].id).toBe('tempo-rogue-39285857');
    expect(onDisk.decks[0].classMatchups).toBeUndefined();
  });

  it('emits progress events for every phase in order', async () => {
    const orch = makeOrchestrator({ cacheDir: dir });
    const phases: string[] = [];
    await orch.startSync((p) => phases.push(p.phase));
    expect(phases).toContain('meta');
    expect(phases).toContain('variants');
    expect(phases).toContain('details');
    expect(phases).toContain('persist');
    expect(phases.indexOf('meta')).toBeLessThan(phases.indexOf('variants'));
    expect(phases.indexOf('variants')).toBeLessThan(phases.indexOf('details'));
    expect(phases.indexOf('details')).toBeLessThan(phases.indexOf('persist'));
    expect(phases[phases.length - 1]).toBe('persist');
  });

  it('rejects concurrent calls with already-syncing', async () => {
    const orch = makeOrchestrator({ cacheDir: dir });
    const first = orch.startSync(() => undefined);
    const second = await orch.startSync(() => undefined);
    expect(second).toEqual({ ok: false, error: 'already-syncing' });
    await first;
  });

  it('returns parse-failed when meta yields zero archetypes (no cache write)', async () => {
    const orch = makeOrchestrator({ cacheDir: dir, metaHtml: '<html>nothing</html>' });
    const result = await orch.startSync(() => undefined);
    expect(result).toEqual({ ok: false, error: 'parse-failed' });
    expect(existsSync(join(dir, SYNCED_FILENAME))).toBe(false);
  });

  it('returns parse-failed when no variants are extracted', async () => {
    const orch = makeOrchestrator({
      cacheDir: dir,
      archetypeHtml: '<html>no decks</html>',
    });
    const result = await orch.startSync(() => undefined);
    expect(result).toEqual({ ok: false, error: 'parse-failed' });
    expect(existsSync(join(dir, SYNCED_FILENAME))).toBe(false);
  });

  it('returns network-failed when fetch throws non-abort error', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const orch = makeOrchestrator({ cacheDir: dir, fetchSpy });
    const result = await orch.startSync(() => undefined);
    expect(result).toEqual({ ok: false, error: 'network-failed' });
  });

  it('exposes lastFetchedAt via getStatus after success', async () => {
    const orch = makeOrchestrator({ cacheDir: dir });
    await orch.startSync(() => undefined);
    expect(orch.getStatus()).toEqual({
      inFlight: false,
      lastFetchedAt: '2026-05-09T12:00:00.000Z',
    });
  });

  it('notifies snapshot listeners on success', async () => {
    const orch = makeOrchestrator({ cacheDir: dir });
    const cb = vi.fn();
    const off = orch.onSnapshotChange(cb);
    await orch.startSync(() => undefined);
    expect(cb).toHaveBeenCalledOnce();
    off();
  });

  it('returns card-db-not-ready when CardDb lookup unavailable', async () => {
    const orch = new PopularDeckSyncOrchestrator({
      fetchImpl: vi.fn(),
      getCardLookup: () => null,
      cacheDir: dir,
      delay: async () => undefined,
    });
    const result = await orch.startSync(() => undefined);
    expect(result).toEqual({ ok: false, error: 'card-db-not-ready' });
  });
});

describe('PopularDeckSyncOrchestrator.loadCacheOnce', () => {
  it('returns null when no cache exists', async () => {
    const orch = makeOrchestrator({ cacheDir: dir });
    expect(await orch.loadCacheOnce()).toBeNull();
    expect(orch.getStatus().lastFetchedAt).toBeNull();
  });

  it('populates lastFetchedAt from existing cache', async () => {
    const orch = makeOrchestrator({ cacheDir: dir });
    await orch.startSync(() => undefined);
    const orch2 = makeOrchestrator({ cacheDir: dir });
    const loaded = await orch2.loadCacheOnce();
    expect(loaded?.fetchedAt).toBe('2026-05-09T12:00:00.000Z');
    expect(orch2.getStatus().lastFetchedAt).toBe('2026-05-09T12:00:00.000Z');
  });
});

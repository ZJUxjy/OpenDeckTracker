import { describe, expect, it, vi } from 'vitest';
import type { CardDef } from '@hdt/hearthdb';
import { decodeDeck } from '@hdt/hearthdb';
import { createHsguruProvider } from './hsguru-provider';
import type { PopularDeckProviderContext, SyncProgress } from './provider-types';

const ROGUE_DECKSTRING =
  'AAECAaIHCsODB9GdB+ylB4aoB4eoB4ioB9C/B4rUB5vUB4jZBwr3nwT3gQeQgweMrQfHrgfZrweaswe0wQedxQfVxQcAAA==';

const META_HTML = `
  <tr>
    <td><a href="/archetype/Tempo%20Rogue">Tempo Rogue</a></td>
    <td><span>50.2</span></td>
    <td>  10.0% (43449) </td>
  </tr>
`;

const ARCHETYPE_HTML = `
  <div id="deck_stats-39285857">
    <a class="basic-black-text" href="/deck/39285857">Harold Rogue</a>
    <span style="font-size: 0; line-size: 0; display: block">${ROGUE_DECKSTRING}</span>
    <div>D0nkey<span>50.2</span><div class="column tag">Games: 43449</div></div>
  </div>
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

function makeContext(opts: {
  fetchImpl?: PopularDeckProviderContext['fetchImpl'];
  metaHtml?: string;
  archetypeHtml?: string;
  progress?: SyncProgress[];
} = {}): PopularDeckProviderContext {
  const heroDbfId = decodeDeck(ROGUE_DECKSTRING).heroes[0]!;
  const fetchImpl =
    opts.fetchImpl ??
    vi.fn(async (url: string) => {
      if (url.includes('/meta?')) {
        return new Response(opts.metaHtml ?? META_HTML, { status: 200 });
      }
      return new Response(opts.archetypeHtml ?? ARCHETYPE_HTML, { status: 200 });
    });

  return {
    fetchImpl,
    delay: async () => undefined,
    findByDbfId: (dbfId: number) =>
      dbfId === heroDbfId ? fakeHeroCard(heroDbfId, 'ROGUE') : null,
    fetchedAt: '2026-05-09T12:00:00.000Z',
    archetypeLimit: 20,
    variantLimit: 5,
    progressCb: (progress) => opts.progress?.push(progress),
    signal: new AbortController().signal,
  };
}

describe('createHsguruProvider', () => {
  it('syncs HSGuru decks and returns ok source diagnostics', async () => {
    const progress: SyncProgress[] = [];
    const result = await createHsguruProvider().sync(makeContext({ progress }));

    expect(result.decks).toHaveLength(1);
    expect(result.decks[0]).toMatchObject({
      id: 'tempo-rogue-39285857',
      name: 'Harold Rogue',
      class: 'ROGUE',
      author: 'hsguru',
      updatedAt: '2026-05-09',
    });
    expect(result.source).toEqual({
      id: 'hsguru',
      label: 'HSGuru',
      enabled: true,
      status: 'ok',
      fetchedAt: '2026-05-09T12:00:00.000Z',
      deckCount: 1,
    });
    expect(progress.map((p) => p.phase)).toEqual(
      expect.arrayContaining(['meta', 'variants', 'transform']),
    );
  });

  it('throws parse-failed when the meta page yields no archetypes', async () => {
    await expect(
      createHsguruProvider().sync(makeContext({ metaHtml: '<html>nothing</html>' })),
    ).rejects.toMatchObject({ code: 'parse-failed' });
  });

  it('throws network-failed when fetch throws a non-abort error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    await expect(
      createHsguruProvider().sync(makeContext({ fetchImpl })),
    ).rejects.toMatchObject({ code: 'network-failed' });
  });
});

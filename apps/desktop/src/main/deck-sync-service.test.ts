import { describe, expect, it, vi } from 'vitest';
import type { Deck as LiveDeck } from '@hdt/hearthmirror';
import { createDeckSyncService } from './deck-sync-service';
import type { DeckDetail, DeckStore } from './deck-store';
import { NonCollectibleSnapshotError } from './deck-store';

function liveDeck(overrides: Partial<LiveDeck> = {}): LiveDeck {
  return {
    id: 1,
    name: 'Live Deck',
    hero: 'HERO_05',
    formatType: 2,
    deckType: 0,
    seasonId: 0,
    cardbackId: 0,
    createDateMicrosec: 0,
    cards: [{ cardId: 'CARD_A', count: 2, premium: 0 }],
    ...overrides,
  };
}

function makeStore(initial: DeckDetail[] = []): DeckStore {
  const records = new Map<string, DeckDetail>();
  const byLiveId = new Map<number, string>();
  for (const d of initial) {
    records.set(d.id, d);
    if (d.liveDeckId !== null && d.liveDeckId !== undefined) {
      byLiveId.set(d.liveDeckId, d.id);
    }
  }
  return {
    list: vi.fn(() => Array.from(records.values()).map((d) => ({ ...d, cardCount: 0 }))),
    getById: vi.fn((id: string) => records.get(id) ?? null),
    create: vi.fn(() => {
      throw new Error('not used');
    }),
    update: vi.fn(() => {
      throw new Error('not used');
    }),
    duplicate: vi.fn(() => {
      throw new Error('not used');
    }),
    delete: vi.fn(),
    setSortIndex: vi.fn(),
    saveFromLive: vi.fn((live, lookup) => {
      const offenders = (live.cards as { cardId: string }[]).filter(
        (c) => {
          const info = lookup(c.cardId);
          return info === null || (!info.collectible && info.validInLiveDeck !== true);
        },
      );
      if (offenders.length > 0) {
        throw new NonCollectibleSnapshotError(offenders.map((c) => c.cardId));
      }
      const liveId = live.liveDeckId ?? null;
      const existingId = liveId !== null ? byLiveId.get(liveId) : undefined;
      if (existingId !== undefined) {
        const existing = records.get(existingId)!;
        const updated: DeckDetail = {
          ...existing,
          name: live.name,
          format: live.format,
          class: live.class,
          cards: live.cards.map((c: { cardId: string; count: number }) => ({ ...c })),
          version: existing.version + 1,
        };
        records.set(existingId, updated);
        return updated;
      }
      const id = `synced-${liveId ?? records.size + 1}`;
      const created: DeckDetail = {
        id,
        name: live.name,
        class: live.class,
        format: live.format,
        cards: live.cards.map((c: { cardId: string; count: number }) => ({ ...c })),
        version: 1,
        notes: '',
        tags: [],
        createdAt: 0,
        updatedAt: 0,
        source: 'hearthstone-live',
        liveDeckId: liveId,
      };
      records.set(id, created);
      if (liveId !== null) byLiveId.set(liveId, id);
      return created;
    }),
    findByLiveDeckId: vi.fn((liveDeckId: number) => {
      const id = byLiveId.get(liveDeckId);
      return id !== undefined ? (records.get(id) ?? null) : null;
    }),
    listVersions: vi.fn(() => []),
    schemaVersion: vi.fn(() => 1),
    close: vi.fn(),
  };
}

describe('deck-sync-service', () => {
  it('syncs each live deck via saveFromLive', async () => {
    const store = makeStore();
    const svc = createDeckSyncService({
      store,
      getLiveDecks: async () => [liveDeck({ id: 1 }), liveDeck({ id: 2, name: 'Other' })],
      resolveHeroClass: () => 'HUNTER',
      collectibleLookup: () => ({ collectible: true }),
    });

    const result = await svc.syncOnce();

    expect(result.synced).toBe(2);
    expect(store.saveFromLive).toHaveBeenCalledTimes(2);
  });

  it('retries an empty live deck list before syncing', async () => {
    const store = makeStore();
    const reads: Array<readonly LiveDeck[] | null> = [[], [liveDeck({ id: 7 })]];
    const getLiveDecks = vi.fn(async () => reads.shift() ?? null);
    const svc = createDeckSyncService({
      store,
      getLiveDecks,
      resolveHeroClass: () => 'HUNTER',
      collectibleLookup: () => ({ collectible: true }),
      liveReadRetryDelaysMs: [0],
    });

    const result = await svc.syncOnce();

    expect(getLiveDecks).toHaveBeenCalledTimes(2);
    expect(result.source).toBe('live');
    expect(result.synced).toBe(1);
    expect(store.saveFromLive).toHaveBeenCalledTimes(1);
  });

  it('skips token-only decks without aborting the rest', async () => {
    const store = makeStore();
    const svc = createDeckSyncService({
      store,
      getLiveDecks: async () => [
        liveDeck({ id: 1, cards: [{ cardId: 'TOKEN_X', count: 1, premium: 0 }] }),
        liveDeck({ id: 2 }),
      ],
      resolveHeroClass: () => 'HUNTER',
      collectibleLookup: (cardId) => ({ collectible: !cardId.startsWith('TOKEN_') }),
    });

    const result = await svc.syncOnce();

    expect(result.synced).toBe(1);
    expect(result.skippedNonCollectible).toBe(1);
  });

  it('syncs Fabled bundle cards that are valid live deck entries', async () => {
    const store = makeStore();
    const svc = createDeckSyncService({
      store,
      getLiveDecks: async () => [
        liveDeck({
          id: 9,
          name: 'Companion Hunter',
          hero: 'HERO_05aq',
          cards: [
            { cardId: 'CARD_A', count: 28, premium: 0 },
            { cardId: 'TIME_609t1', count: 1, premium: 0 },
            { cardId: 'TIME_609t2', count: 1, premium: 0 },
          ],
        }),
      ],
      resolveHeroClass: () => 'HUNTER',
      collectibleLookup: (cardId) => ({
        collectible: cardId === 'CARD_A',
        validInLiveDeck: cardId === 'TIME_609t1' || cardId === 'TIME_609t2',
      }),
    });

    const result = await svc.syncOnce();

    expect(result.synced).toBe(1);
    expect(result.skippedNonCollectible).toBe(0);
    expect(store.saveFromLive).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Companion Hunter',
        cards: [
          { cardId: 'CARD_A', count: 28 },
          { cardId: 'TIME_609t1', count: 1 },
          { cardId: 'TIME_609t2', count: 1 },
        ],
      }),
      expect.any(Function),
    );
  });

  it('upserts a previously synced deck instead of creating duplicates', async () => {
    const initial: DeckDetail = {
      id: 'synced-1',
      name: 'Old Live Deck',
      class: 'HUNTER',
      format: 'Standard',
      cards: [{ cardId: 'CARD_A', count: 1 }],
      version: 1,
      notes: '',
      tags: [],
      createdAt: 0,
      updatedAt: 0,
      source: 'hearthstone-live',
      liveDeckId: 1,
    };
    const store = makeStore([initial]);
    const svc = createDeckSyncService({
      store,
      getLiveDecks: async () => [liveDeck({ id: 1, name: 'New Live Deck' })],
      resolveHeroClass: () => 'HUNTER',
      collectibleLookup: () => ({ collectible: true }),
    });

    await svc.syncOnce();

    expect(store.list().length).toBe(1);
    const updated = store.getById('synced-1');
    expect(updated?.name).toBe('New Live Deck');
  });

  it('does nothing when getLiveDecks returns null', async () => {
    const store = makeStore();
    const svc = createDeckSyncService({
      store,
      getLiveDecks: async () => null,
      resolveHeroClass: () => 'HUNTER',
      collectibleLookup: () => ({ collectible: true }),
    });

    const result = await svc.syncOnce();
    expect(result.synced).toBe(0);
    expect(store.saveFromLive).not.toHaveBeenCalled();
  });

  it('skips decks with an unrecognized hero portrait', async () => {
    const store = makeStore();
    const svc = createDeckSyncService({
      store,
      getLiveDecks: async () => [liveDeck({ hero: 'HERO_999' })],
      resolveHeroClass: () => null,
      collectibleLookup: () => ({ collectible: true }),
    });

    const result = await svc.syncOnce();
    expect(result.synced).toBe(0);
    expect(result.skippedUnknownClass).toBe(1);
  });

  it('infers the deck class from cards when the hero portrait is unrecognized', async () => {
    const store = makeStore();
    const svc = createDeckSyncService({
      store,
      getLiveDecks: async () => [
        liveDeck({
          hero: 'UNKNOWN_HUNTER_SKIN',
          cards: [
            { cardId: 'HUNTER_CARD', count: 2, premium: 0 },
            { cardId: 'NEUTRAL_CARD', count: 2, premium: 0 },
          ],
        }),
      ],
      resolveHeroClass: () => null,
      resolveCardClass: (cardId) => {
        if (cardId === 'HUNTER_CARD') return 'HUNTER';
        if (cardId === 'NEUTRAL_CARD') return 'NEUTRAL';
        return null;
      },
      collectibleLookup: () => ({ collectible: true }),
    });

    const result = await svc.syncOnce();

    expect(result.synced).toBe(1);
    expect(result.skippedUnknownClass).toBe(0);
    expect(store.saveFromLive).toHaveBeenCalledWith(
      expect.objectContaining({ class: 'HUNTER' }),
      expect.any(Function),
    );
  });

  it('does not infer a class when card-class evidence is tied', async () => {
    const store = makeStore();
    const svc = createDeckSyncService({
      store,
      getLiveDecks: async () => [
        liveDeck({
          hero: 'UNKNOWN_HERO',
          cards: [
            { cardId: 'HUNTER_CARD', count: 1, premium: 0 },
            { cardId: 'WARRIOR_CARD', count: 1, premium: 0 },
          ],
        }),
      ],
      resolveHeroClass: () => null,
      resolveCardClass: (cardId) => {
        if (cardId === 'HUNTER_CARD') return 'HUNTER';
        if (cardId === 'WARRIOR_CARD') return 'WARRIOR';
        return null;
      },
      collectibleLookup: () => ({ collectible: true }),
    });

    const result = await svc.syncOnce();

    expect(result.synced).toBe(0);
    expect(result.skippedUnknownClass).toBe(1);
    expect(store.saveFromLive).not.toHaveBeenCalled();
  });
});

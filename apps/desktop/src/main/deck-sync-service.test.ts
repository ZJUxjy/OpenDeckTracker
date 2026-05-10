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
    saveFromLive: vi.fn((live) => {
      const offenders = (live.cards as { cardId: string }[]).filter(
        (c) => c.cardId.startsWith('TOKEN_'),
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

  it('skips token-only decks without aborting the rest', async () => {
    const store = makeStore();
    const svc = createDeckSyncService({
      store,
      getLiveDecks: async () => [
        liveDeck({ id: 1, cards: [{ cardId: 'TOKEN_X', count: 1, premium: 0 }] }),
        liveDeck({ id: 2 }),
      ],
      resolveHeroClass: () => 'HUNTER',
      collectibleLookup: () => ({ collectible: true }),
    });

    const result = await svc.syncOnce();

    expect(result.synced).toBe(1);
    expect(result.skippedNonCollectible).toBe(1);
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
});

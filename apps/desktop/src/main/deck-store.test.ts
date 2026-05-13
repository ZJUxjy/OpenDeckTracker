import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type DeckCard,
  NonCollectibleSnapshotError,
} from './deck-store';
import { createDeckStore } from './deck-store';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hdt-decks-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const dbPath = (): string => join(dir, 'decks.db');

interface FakeCardInfo {
  cardId: string;
  class: string;
  rarity: string;
  type: string;
  collectible: boolean;
  validInLiveDeck?: boolean;
}

function makeCardLookup(cards: FakeCardInfo[]) {
  const map = new Map(cards.map((c) => [c.cardId, c]));
  return (cardId: string): FakeCardInfo | null => map.get(cardId) ?? null;
}

describe('createDeckStore', () => {
  it('first open creates decks.db and list() returns []', () => {
    const store = createDeckStore(dbPath());
    try {
      expect(store.list()).toEqual([]);
      expect(existsSync(dbPath())).toBe(true);
    } finally {
      store.close();
    }
  });

  it('schema version is recorded on first open', () => {
    const store = createDeckStore(dbPath());
    try {
      expect(store.schemaVersion()).toBe(1);
    } finally {
      store.close();
    }
  });

  it('create() then list() returns the new deck summary', () => {
    const store = createDeckStore(dbPath());
    try {
      const created = store.create({
        name: 'My Druid',
        class: 'DRUID',
        format: 'Standard',
        cards: [
          { cardId: 'D_C_0', count: 2 },
          { cardId: 'D_C_1', count: 1 },
        ],
      });
      const summaries = store.list();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({
        id: created.id,
        name: 'My Druid',
        class: 'DRUID',
        format: 'Standard',
        version: 1,
        cardCount: 3,
      });
    } finally {
      store.close();
    }
  });

  it('getById() returns full detail with the original cards', () => {
    const store = createDeckStore(dbPath());
    try {
      const cards: DeckCard[] = [
        { cardId: 'A', count: 2 },
        { cardId: 'B', count: 1 },
      ];
      const created = store.create({ name: 'X', class: 'MAGE', format: 'Wild', cards });
      const detail = store.getById(created.id);
      expect(detail).not.toBeNull();
      expect(detail?.cards).toEqual(cards);
      expect(detail?.version).toBe(1);
      expect(detail?.notes).toBe('');
      expect(detail?.tags).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('getById() returns null for an unknown id', () => {
    const store = createDeckStore(dbPath());
    try {
      expect(store.getById('does-not-exist')).toBeNull();
    } finally {
      store.close();
    }
  });

  it('update with changed card list bumps version and appends to deck_versions', () => {
    const store = createDeckStore(dbPath());
    try {
      const a = store.create({
        name: 'V',
        class: 'PRIEST',
        format: 'Standard',
        cards: [{ cardId: 'A', count: 2 }],
      });
      const updated = store.update(a.id, {
        cards: [{ cardId: 'A', count: 1 }, { cardId: 'B', count: 1 }],
      });
      expect(updated.version).toBe(2);
      expect(store.listVersions(a.id).map((v) => v.version)).toEqual([1, 2]);
    } finally {
      store.close();
    }
  });

  it('update with rename only does NOT bump version but refreshes updatedAt', async () => {
    const store = createDeckStore(dbPath());
    try {
      const a = store.create({ name: 'Old', class: 'DRUID', format: 'Standard' });
      // brief delay so updatedAt can change
      await new Promise((r) => setTimeout(r, 5));
      const updated = store.update(a.id, { name: 'New' });
      expect(updated.version).toBe(1);
      expect(updated.name).toBe('New');
      expect(updated.updatedAt).toBeGreaterThanOrEqual(a.updatedAt);
    } finally {
      store.close();
    }
  });

  it('update with insertion-order-only change does NOT bump version', () => {
    const store = createDeckStore(dbPath());
    try {
      const a = store.create({
        name: 'O',
        class: 'WARRIOR',
        format: 'Standard',
        cards: [
          { cardId: 'A', count: 2 },
          { cardId: 'B', count: 1 },
        ],
      });
      const updated = store.update(a.id, {
        cards: [
          { cardId: 'B', count: 1 },
          { cardId: 'A', count: 2 },
        ],
      });
      expect(updated.version).toBe(1);
    } finally {
      store.close();
    }
  });

  it('duplicate creates a new id with v1 and a "(copy)" suffix', () => {
    const store = createDeckStore(dbPath());
    try {
      const a = store.create({
        name: 'Dup',
        class: 'PALADIN',
        format: 'Standard',
        cards: [{ cardId: 'A', count: 1 }],
      });
      const copy = store.duplicate(a.id);
      expect(copy.id).not.toBe(a.id);
      expect(copy.name).toContain('(copy)');
      expect(copy.version).toBe(1);
      expect(copy.cards).toEqual(a.cards);
    } finally {
      store.close();
    }
  });

  it('delete is idempotent', () => {
    const store = createDeckStore(dbPath());
    try {
      const a = store.create({ name: 'D', class: 'HUNTER', format: 'Standard' });
      store.delete(a.id);
      expect(store.getById(a.id)).toBeNull();
      expect(() => store.delete(a.id)).not.toThrow();
    } finally {
      store.close();
    }
  });

  it('setSortIndex updates the row without bumping version', () => {
    const store = createDeckStore(dbPath());
    try {
      const a = store.create({ name: 'S', class: 'ROGUE', format: 'Standard' });
      store.setSortIndex(a.id, 7);
      const detail = store.getById(a.id);
      expect(detail?.sortIndex).toBe(7);
      expect(detail?.version).toBe(1);
    } finally {
      store.close();
    }
  });

  it('saveFromLive snapshots a collectible-only live deck', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
        { cardId: 'B', class: 'NEUTRAL', rarity: 'RARE', type: 'MINION', collectible: true },
      ]);
      const created = store.saveFromLive(
        {
          name: 'Live Druid',
          class: 'DRUID',
          format: 'Standard',
          cards: [
            { cardId: 'A', count: 2 },
            { cardId: 'B', count: 1 },
          ],
        },
        lookup,
      );
      expect(created.cards).toEqual([
        { cardId: 'A', count: 2 },
        { cardId: 'B', count: 1 },
      ]);
      expect(created.name).toBe('Live Druid');
    } finally {
      store.close();
    }
  });

  it('saveFromLive marks records with hearthstone-live source and liveDeckId', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
      ]);
      const created = store.saveFromLive(
        {
          name: 'Live Druid',
          class: 'DRUID',
          format: 'Standard',
          cards: [{ cardId: 'A', count: 2 }],
          liveDeckId: 42,
        },
        lookup,
      );
      expect(created.source).toBe('hearthstone-live');
      expect(created.liveDeckId).toBe(42);

      const summary = store.list().find((d) => d.id === created.id);
      expect(summary?.source).toBe('hearthstone-live');
      expect(summary?.liveDeckId).toBe(42);
    } finally {
      store.close();
    }
  });

  it('manual decks created via create() do not carry live-sync metadata', () => {
    const store = createDeckStore(dbPath());
    try {
      const created = store.create({
        name: 'Manual',
        class: 'DRUID',
        format: 'Standard',
        cards: [{ cardId: 'A', count: 1 }],
      });
      expect(created.source).toBeUndefined();
      expect(created.liveDeckId).toBeUndefined();
    } finally {
      store.close();
    }
  });

  it('saveFromLive without liveDeckId creates app-managed deck', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
      ]);
      const created = store.saveFromLive(
        {
          name: 'Manual Live',
          class: 'DRUID',
          format: 'Standard',
          cards: [{ cardId: 'A', count: 1 }],
        },
        lookup,
      );
      expect(created.source).toBeUndefined();
      expect(created.liveDeckId).toBeUndefined();
    } finally {
      store.close();
    }
  });

  it('saveFromLive upserts unchanged liveDeckId without version bump', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
      ]);
      const input = {
        name: 'Live A',
        class: 'DRUID' as const,
        format: 'Standard' as const,
        cards: [{ cardId: 'A', count: 1 }],
        liveDeckId: 11,
      };
      const first = store.saveFromLive(input, lookup);
      const second = store.saveFromLive(input, lookup);

      expect(second.id).toBe(first.id);
      expect(second.version).toBe(first.version);
    } finally {
      store.close();
    }
  });

  it('saveFromLive bumps version when live card list changes', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
        { cardId: 'B', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
      ]);
      const first = store.saveFromLive(
        {
          name: 'Live A',
          class: 'DRUID',
          format: 'Standard',
          cards: [{ cardId: 'A', count: 1 }],
          liveDeckId: 12,
        },
        lookup,
      );
      const second = store.saveFromLive(
        {
          name: 'Live A',
          class: 'DRUID',
          format: 'Standard',
          cards: [{ cardId: 'A', count: 1 }, { cardId: 'B', count: 1 }],
          liveDeckId: 12,
        },
        lookup,
      );

      expect(second.id).toBe(first.id);
      expect(second.version).toBe(first.version + 1);
    } finally {
      store.close();
    }
  });

  it('saveFromLive upserts live-synced rows by liveDeckId', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
        { cardId: 'B', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
      ]);
      const first = store.saveFromLive(
        {
          name: 'Live A',
          class: 'DRUID',
          format: 'Standard',
          cards: [{ cardId: 'A', count: 1 }],
          liveDeckId: 7,
        },
        lookup,
      );
      const second = store.saveFromLive(
        {
          name: 'Live A v2',
          class: 'DRUID',
          format: 'Standard',
          cards: [{ cardId: 'A', count: 1 }, { cardId: 'B', count: 2 }],
          liveDeckId: 7,
        },
        lookup,
      );

      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Live A v2');
      expect(second.version).toBe(2);
      expect(store.list()).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it('saveFromLive reattaches new liveDeckId by content fingerprint when exactly one live-synced row matches', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
        { cardId: 'B', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
      ]);
      const cards = [
        { cardId: 'A', count: 2 },
        { cardId: 'B', count: 1 },
      ];
      const first = store.saveFromLive(
        {
          name: 'Live A',
          class: 'DRUID',
          format: 'Standard',
          cards,
          liveDeckId: 100,
        },
        lookup,
      );
      const second = store.saveFromLive(
        {
          name: 'Live A renamed',
          class: 'DRUID',
          format: 'Standard',
          cards,
          liveDeckId: 200,
        },
        lookup,
      );

      expect(second.id).toBe(first.id);
      expect(store.findByLiveDeckId(200)?.id).toBe(first.id);
      expect(store.findByLiveDeckId(100)).toBeNull();
      expect(second.version).toBe(first.version);
    } finally {
      store.close();
    }
  });

  it('saveFromLive does NOT reattach when more than one live-synced row matches the fingerprint', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
        { cardId: 'B', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
      ]);
      const cards = [
        { cardId: 'A', count: 2 },
        { cardId: 'B', count: 1 },
      ];
      // Construct two distinct live-synced rows that share the same
      // fingerprint. Reattach normally collapses identical content under
      // one row, so we create row B with different cards first, then
      // upsert it to match — leaving us in an ambiguous state.
      const first = store.saveFromLive(
        { name: 'Live A', class: 'DRUID', format: 'Standard', cards, liveDeckId: 301 },
        lookup,
      );
      const seedB = store.saveFromLive(
        {
          name: 'Live B seed',
          class: 'DRUID',
          format: 'Standard',
          cards: [{ cardId: 'A', count: 1 }],
          liveDeckId: 302,
        },
        lookup,
      );
      const second = store.saveFromLive(
        { name: 'Live B', class: 'DRUID', format: 'Standard', cards, liveDeckId: 302 },
        lookup,
      );
      expect(second.id).toBe(seedB.id);

      const third = store.saveFromLive(
        { name: 'Live C', class: 'DRUID', format: 'Standard', cards, liveDeckId: 303 },
        lookup,
      );

      expect(third.id).not.toBe(first.id);
      expect(third.id).not.toBe(second.id);
      expect(store.findByLiveDeckId(301)?.id).toBe(first.id);
      expect(store.findByLiveDeckId(302)?.id).toBe(second.id);
      expect(store.findByLiveDeckId(303)?.id).toBe(third.id);
    } finally {
      store.close();
    }
  });

  it('saveFromLive does NOT reattach against app-managed rows', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
        { cardId: 'B', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
      ]);
      const cards = [
        { cardId: 'A', count: 2 },
        { cardId: 'B', count: 1 },
      ];
      const manual = store.create({
        name: 'Manual',
        class: 'DRUID',
        format: 'Standard',
        cards,
      });
      const live = store.saveFromLive(
        { name: 'Live A', class: 'DRUID', format: 'Standard', cards, liveDeckId: 500 },
        lookup,
      );

      expect(store.findByLiveDeckId(500)?.id).toBe(live.id);
      expect(live.id).not.toBe(manual.id);
      const reloaded = store.getById(manual.id);
      expect(reloaded?.id).toBe(manual.id);
      expect(reloaded?.source).toBeUndefined();
      expect(reloaded?.liveDeckId).toBeUndefined();
    } finally {
      store.close();
    }
  });

  it('findByLiveDeckId returns null when no live-synced record matches', () => {
    const store = createDeckStore(dbPath());
    try {
      expect(store.findByLiveDeckId(99)).toBeNull();
    } finally {
      store.close();
    }
  });

  it('saveFromLive throws NonCollectibleSnapshotError for a non-collectible card', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'DRUID', rarity: 'COMMON', type: 'SPELL', collectible: true },
        { cardId: 'TOKEN', class: 'NEUTRAL', rarity: 'COMMON', type: 'MINION', collectible: false },
      ]);
      expect(() =>
        store.saveFromLive(
          {
            name: 'Bad',
            class: 'DRUID',
            format: 'Standard',
            cards: [
              { cardId: 'A', count: 1 },
              { cardId: 'TOKEN', count: 1 },
            ],
          },
          lookup,
        ),
      ).toThrow(NonCollectibleSnapshotError);
    } finally {
      store.close();
    }
  });

  it('saveFromLive accepts non-collectible cards that are valid in live decks', () => {
    const store = createDeckStore(dbPath());
    try {
      const lookup = makeCardLookup([
        { cardId: 'A', class: 'HUNTER', rarity: 'COMMON', type: 'SPELL', collectible: true },
        {
          cardId: 'TIME_609t1',
          class: 'HUNTER',
          rarity: 'LEGENDARY',
          type: 'MINION',
          collectible: false,
          validInLiveDeck: true,
        },
      ]);

      const created = store.saveFromLive(
        {
          name: 'Fabled Hunter',
          class: 'HUNTER',
          format: 'Standard',
          cards: [
            { cardId: 'A', count: 28 },
            { cardId: 'TIME_609t1', count: 1 },
          ],
        },
        lookup,
      );

      expect(created.cards).toEqual([
        { cardId: 'A', count: 28 },
        { cardId: 'TIME_609t1', count: 1 },
      ]);
    } finally {
      store.close();
    }
  });

  it('integrity guard renames a corrupt decks.db and starts fresh', () => {
    writeFileSync(dbPath(), Buffer.from('this is not a sqlite file'));
    const store = createDeckStore(dbPath());
    try {
      expect(store.list()).toEqual([]);
      const files = readdirSync(dir);
      expect(files).toContain('decks.db');
      expect(files.some((f) => f.startsWith('decks.corrupt-') && f.endsWith('.db'))).toBe(true);
    } finally {
      store.close();
    }
  });

  it('healthy file is reused across opens', () => {
    const first = createDeckStore(dbPath());
    const created = first.create({ name: 'Persist', class: 'SHAMAN', format: 'Standard' });
    first.close();

    const second = createDeckStore(dbPath());
    try {
      expect(second.getById(created.id)?.name).toBe('Persist');
    } finally {
      second.close();
    }
  });
});

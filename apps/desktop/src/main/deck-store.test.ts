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

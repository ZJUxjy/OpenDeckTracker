import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDeckStore } from './deck-store';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hdt-decks-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function newStore() {
  return createDeckStore(join(dir, 'decks.db'));
}

describe('DeckStore active deck', () => {
  it('returns null before any active deck is set', () => {
    const store = newStore();
    try {
      expect(store.getActiveDeckId()).toBeNull();
    } finally {
      store.close();
    }
  });

  it('persists the active deck id', () => {
    const store = newStore();
    try {
      store.setActiveDeckId('deck-123');
      expect(store.getActiveDeckId()).toBe('deck-123');
    } finally {
      store.close();
    }
  });

  it('clears the active deck id with null', () => {
    const store = newStore();
    try {
      store.setActiveDeckId('deck-123');
      store.setActiveDeckId(null);
      expect(store.getActiveDeckId()).toBeNull();
    } finally {
      store.close();
    }
  });
});

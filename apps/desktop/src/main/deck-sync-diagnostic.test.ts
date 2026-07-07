import { describe, expect, it, vi } from 'vitest';
import type { CollectionDiagnostic, Deck as LiveDeck } from '@hdt/hearthmirror';
import { readDeckSyncUnavailableDiagnostic } from './deck-sync-diagnostic';

function liveDeck(overrides: Partial<LiveDeck> = {}): LiveDeck {
  return {
    id: 9,
    name: 'Edited Deck',
    hero: 'HERO_05',
    formatType: 2,
    deckType: 0,
    seasonId: 0,
    cardbackId: 0,
    createDateMicrosec: 0,
    cards: [
      { cardId: 'CARD_A', count: 2, premium: 0 },
      { cardId: 'CARD_B', count: 1, premium: 0 },
    ],
    ...overrides,
  };
}

describe('deck-sync diagnostics', () => {
  it('summarizes HearthMirror runtime and edited deck state', async () => {
    const collectionDiagnostic: CollectionDiagnostic = {
      listSize: 100,
      parsed: 99,
      nonZeroDbfid: 99,
      nullPtrs: 1,
      fieldMisses: 0,
      sampleClass: 'CollectibleCard',
      elapsedMs: 12,
    };
    const mirror = {
      isAlive: vi.fn(async () => true),
      getBoundPid: vi.fn(async () => 1234),
      getReinitCount: vi.fn(async () => 2),
      getEditedDeck: vi.fn(async () => liveDeck()),
      getCollectionDiagnostic: vi.fn(async () => collectionDiagnostic),
    };

    const diagnostic = await readDeckSyncUnavailableDiagnostic(mirror);

    expect(diagnostic).toEqual({
      mirrorAlive: true,
      runtimeBoundPid: 1234,
      runtimeReinitCount: 2,
      editedDeck: {
        id: 9,
        name: 'Edited Deck',
        hero: 'HERO_05',
        formatType: 2,
        deckType: 0,
        cardSlots: 2,
        cardCount: 3,
      },
      collectionDiagnostic,
    });
  });

  it('captures diagnostic read errors without throwing', async () => {
    const mirror = {
      isAlive: vi.fn(async () => {
        throw new Error('attach failed');
      }),
      getBoundPid: vi.fn(async () => 0),
      getReinitCount: vi.fn(async () => 1),
      getEditedDeck: vi.fn(async () => null),
      getCollectionDiagnostic: vi.fn(async () => null),
    };

    const diagnostic = await readDeckSyncUnavailableDiagnostic(mirror);

    expect(diagnostic.runtimeBoundPid).toBe(0);
    expect(diagnostic.runtimeReinitCount).toBe(1);
    expect(diagnostic.editedDeck).toBeNull();
    expect(diagnostic.collectionDiagnostic).toBeNull();
    expect(diagnostic.error).toContain('isAlive: attach failed');
  });
});

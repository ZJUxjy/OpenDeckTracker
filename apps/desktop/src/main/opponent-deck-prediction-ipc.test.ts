import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    invoke: (channel: string, ...args: unknown[]) => handlers.get(channel)?.({}, ...args),
  };
  const BrowserWindow = {
    getAllWindows: () => [] as unknown[],
  };
  return { ipcMain, BrowserWindow };
});

import { decodeDeck } from '@hdt/hearthdb';
import * as electron from 'electron';
import type {
  DeckTrackerSnapshot,
  OpponentCardRecord,
  OpponentDeckPrediction,
  PopularDeckEnriched,
} from '@hdt/core';
import {
  PREDICTION_GET_CHANNEL,
  PREDICTION_UPDATE_CHANNEL,
  registerOpponentDeckPredictionIpc,
  computePredictions,
} from './opponent-deck-prediction-ipc';

// Real (small) deckstrings won't decode without a real CardDb. Tests
// inject a CardDb stub that maps known dbfIds → cardIds.
import { encodeDeck, DeckFormat, type CardDb, type CardDef } from '@hdt/hearthdb';

function fakeCardDb(map: Record<number, { id: string; cardClass?: string }>): CardDb {
  return {
    findByDbfId: (dbfId: number): CardDef | null => {
      const m = map[dbfId];
      if (!m) return null;
      return {
        id: m.id,
        dbfId,
        name: m.id,
        cost: 0,
        cardClass: m.cardClass ?? 'MAGE',
        set: 'TEST',
        type: 'SPELL',
        collectible: true,
      } as CardDef;
    },
    findById: () => null,
    search: () => [],
  } as unknown as CardDb;
}

function record(over: Partial<OpponentCardRecord> & Pick<OpponentCardRecord, 'entityId' | 'cardId'>): OpponentCardRecord {
  return {
    zone: 'PLAY',
    order: over.entityId,
    created: false,
    ...over,
  };
}

function snapshot(over: Partial<DeckTrackerSnapshot>): DeckTrackerSnapshot {
  return {
    phase: 'IN_MATCH',
    matchInfo: null,
    deck: null,
    pendingDeckSelection: null,
    friendlyHand: [],
    friendlyHandExtras: [],
    opposingHandCount: 0,
    opponent: { revealed: [], graveyard: [] },
    opponentClass: null,
    friendlyGraveyard: [],
    friendlyDeckCount: 0,
    friendlyEffects: [],
    opposingEffects: [],
    boardAttack: { friendly: 0, opposing: 0 },
    boardAttackToFace: { friendly: 0, opposing: 0 },
    friendlyHero: null,
    opposingHero: null,
    playerClass: null,
    error: null,
    updatedAt: 0,
    ...over,
  };
}

const FIREBALL_DBFID = 315;
const ARCANE_INTELLECT_DBFID = 555;
const FIREBALL_CARD_ID = 'CS2_029';
const ARCANE_INTELLECT_CARD_ID = 'CS2_023';

const cardDb = fakeCardDb({
  [FIREBALL_DBFID]: { id: FIREBALL_CARD_ID },
  [ARCANE_INTELLECT_DBFID]: { id: ARCANE_INTELLECT_CARD_ID },
});

const MAGE_DECKSTRING = encodeDeck({
  format: DeckFormat.Standard,
  heroes: [637],
  cards: [
    { dbfId: FIREBALL_DBFID, count: 2 },
    { dbfId: ARCANE_INTELLECT_DBFID, count: 2 },
  ],
});

function popularDeck(over: Partial<PopularDeckEnriched> & { id: string }): PopularDeckEnriched {
  return {
    id: over.id,
    name: over.name ?? over.id,
    class: over.class ?? 'MAGE',
    format: over.format ?? 'Standard',
    archetype: over.archetype ?? 'Tempo',
    deckstring: over.deckstring ?? MAGE_DECKSTRING,
    winratePercent: over.winratePercent ?? 50,
    gamesCount: over.gamesCount ?? 1000,
    author: 'hsguru',
    updatedAt: '2026-05-09',
    manaCurve: over.manaCurve ?? [0, 0, 0, 0, 0, 0, 0, 0],
    keyCards: over.keyCards ?? [],
    cardNames: over.cardNames ?? [],
    deckCardList: over.deckCardList ?? [],
    dustCost: over.dustCost ?? 0,
  };
}

const POPULAR_DECKS: readonly PopularDeckEnriched[] = [
  popularDeck({ id: 'mage-fb', class: 'MAGE' }),
  popularDeck({ id: 'rogue-tempo', class: 'ROGUE' }),
];

let dispose: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  dispose?.();
  dispose = null;
});

describe('opponent-deck-prediction IPC', () => {
  it('registers the get-channel handler', () => {
    const triggers = new Set<(s: DeckTrackerSnapshot) => void>();
    dispose = registerOpponentDeckPredictionIpc({
      getSnapshot: () => null,
      getPopularDecks: () => POPULAR_DECKS,
      getCardDb: () => cardDb,
      onSnapshotChange: (cb) => {
        triggers.add(cb);
        return () => triggers.delete(cb);
      },
      getWindows: () => [],
    });
    const handle = vi.mocked(electron.ipcMain.handle);
    expect(handle.mock.calls.some((c) => c[0] === PREDICTION_GET_CHANNEL)).toBe(true);
  });

  it('returns [] when opponent has no revealed cards', async () => {
    dispose = registerOpponentDeckPredictionIpc({
      getSnapshot: () => snapshot({}),
      getPopularDecks: () => POPULAR_DECKS,
      getCardDb: () => cardDb,
      onSnapshotChange: () => () => undefined,
      getWindows: () => [],
    });
    const result = await (electron.ipcMain as unknown as {
      invoke: (channel: string) => Promise<OpponentDeckPrediction[]>;
    }).invoke(PREDICTION_GET_CHANNEL);
    expect(result).toEqual([]);
  });

  it('returns predictions filtered by class + format from match info', async () => {
    dispose = registerOpponentDeckPredictionIpc({
      getSnapshot: () =>
        snapshot({
          opponent: {
            revealed: [record({ entityId: 1, cardId: FIREBALL_CARD_ID })],
            graveyard: [],
          },
          opponentClass: 'MAGE',
          matchInfo: { formatType: 2 } as DeckTrackerSnapshot['matchInfo'],
        }),
      getPopularDecks: () => POPULAR_DECKS,
      getCardDb: () => cardDb,
      onSnapshotChange: () => () => undefined,
      getWindows: () => [],
    });
    const result = await (electron.ipcMain as unknown as {
      invoke: (channel: string) => Promise<OpponentDeckPrediction[]>;
    }).invoke(PREDICTION_GET_CHANNEL);
    expect(result).toHaveLength(1);
    expect(result[0]!.deck.id).toBe('mage-fb');
    expect(result[0]!.score).toBe(1);
  });

  it('idempotent: same snapshot + cache returns identical results', async () => {
    const snap = snapshot({
      opponent: {
        revealed: [record({ entityId: 1, cardId: FIREBALL_CARD_ID })],
        graveyard: [],
      },
      opponentClass: 'MAGE',
    });
    dispose = registerOpponentDeckPredictionIpc({
      getSnapshot: () => snap,
      getPopularDecks: () => POPULAR_DECKS,
      getCardDb: () => cardDb,
      onSnapshotChange: () => () => undefined,
      getWindows: () => [],
    });
    const a = await (electron.ipcMain as unknown as {
      invoke: (channel: string) => Promise<OpponentDeckPrediction[]>;
    }).invoke(PREDICTION_GET_CHANNEL);
    const b = await (electron.ipcMain as unknown as {
      invoke: (channel: string) => Promise<OpponentDeckPrediction[]>;
    }).invoke(PREDICTION_GET_CHANNEL);
    expect(a).toEqual(b);
  });

  it('broadcasts predictions on snapshot change', () => {
    let triggerSnapshot: ((s: DeckTrackerSnapshot) => void) | null = null;
    const sentPayloads: unknown[] = [];
    const win = {
      isDestroyed: () => false,
      webContents: {
        send: (channel: string, payload: unknown) => {
          if (channel === PREDICTION_UPDATE_CHANNEL) sentPayloads.push(payload);
        },
      },
    };
    dispose = registerOpponentDeckPredictionIpc({
      getSnapshot: () => null,
      getPopularDecks: () => POPULAR_DECKS,
      getCardDb: () => cardDb,
      onSnapshotChange: (cb) => {
        triggerSnapshot = cb;
        return () => undefined;
      },
      getWindows: () => [win as unknown as ReturnType<typeof Object>],
    });
    expect(triggerSnapshot).not.toBeNull();
    triggerSnapshot!(
      snapshot({
        opponent: {
          revealed: [record({ entityId: 1, cardId: FIREBALL_CARD_ID })],
          graveyard: [],
        },
        opponentClass: 'MAGE',
      }),
    );
    expect(sentPayloads).toHaveLength(1);
    const predictions = sentPayloads[0] as OpponentDeckPrediction[];
    expect(predictions).toHaveLength(1);
    expect(predictions[0]!.deck.id).toBe('mage-fb');
  });

  it('dispose unsubscribes and removes handler', () => {
    let snapshotUnsub: (() => void) | null = null;
    const local = registerOpponentDeckPredictionIpc({
      getSnapshot: () => null,
      getPopularDecks: () => POPULAR_DECKS,
      getCardDb: () => cardDb,
      onSnapshotChange: () => {
        const unsub = vi.fn();
        snapshotUnsub = unsub;
        return unsub;
      },
      getWindows: () => [],
    });
    local();
    expect(snapshotUnsub).not.toBeNull();
    expect(snapshotUnsub).toHaveBeenCalledOnce();
    const remove = vi.mocked(electron.ipcMain.removeHandler);
    expect(remove.mock.calls.some((c) => c[0] === PREDICTION_GET_CHANNEL)).toBe(true);
  });
});

describe('computePredictions (helper)', () => {
  const lookupBuilder = {
    get: (deckstring: string) => {
      // Decode using real codec + fake CardDb
      const bp = decodeDeckHelper(deckstring);
      if (!bp) return null;
      const counts = new Map<string, number>();
      for (const e of bp.cards) {
        const def = cardDb.findByDbfId(e.dbfId);
        if (!def) continue;
        counts.set(def.id, (counts.get(def.id) ?? 0) + e.count);
      }
      return counts;
    },
  };

  it('returns [] when popular decks list is empty', () => {
    const result = computePredictions(
      snapshot({
        opponent: {
          revealed: [record({ entityId: 1, cardId: FIREBALL_CARD_ID })],
          graveyard: [],
        },
        opponentClass: 'MAGE',
      }),
      [],
      cardDb,
      lookupBuilder as unknown as Parameters<typeof computePredictions>[3],
    );
    expect(result).toEqual([]);
  });
});

function decodeDeckHelper(deckstring: string): { cards: { dbfId: number; count: number }[] } | null {
  try {
    const bp = decodeDeck(deckstring);
    return { cards: bp.cards };
  } catch {
    return null;
  }
}

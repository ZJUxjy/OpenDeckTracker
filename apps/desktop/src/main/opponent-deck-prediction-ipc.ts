import { BrowserWindow, ipcMain } from 'electron';
import {
  predictOpponentDecks,
  type DeckTrackerSnapshot,
  type Format,
  type OpponentDeckPrediction,
  type PopularDeckEnriched,
} from '@hdt/core';
import { decodeDeck, type CardDb } from '@hdt/hearthdb';

export const PREDICTION_GET_CHANNEL = 'opponent-deck-prediction:get';
export const PREDICTION_UPDATE_CHANNEL = 'opponent-deck-prediction:update';

export interface OpponentDeckPredictionDeps {
  getSnapshot: () => DeckTrackerSnapshot | null;
  getPopularDecks: () => readonly PopularDeckEnriched[];
  getCardDb: () => CardDb | null;
  /**
   * Subscribe to deck-tracker snapshots; called once per tick. The host
   * wires this to `onDeckTrackerSnapshotChange`. Returns an unsubscribe.
   */
  onSnapshotChange: (cb: (snapshot: DeckTrackerSnapshot) => void) => () => void;
  /**
   * Optional override for tests; defaults to `BrowserWindow.getAllWindows`.
   */
  getWindows?: () => Pick<BrowserWindow, 'webContents' | 'isDestroyed'>[];
}

const FORMAT_BY_NUMBER: Readonly<Record<number, Format>> = {
  1: 'Wild',
  2: 'Standard',
  3: 'Classic',
  4: 'Twist',
};

interface DeckCardLookupCacheEntry {
  decks: readonly PopularDeckEnriched[];
  cardDb: CardDb | null;
  cache: Map<string, ReadonlyMap<string, number> | null>;
}

/**
 * Build (and memoise) a `deckstring → Map<cardId, count>` lookup keyed
 * to the current popular-decks list + CardDb identity. When either
 * changes we throw away the cache so a fresh sync's deckstrings get
 * re-decoded against the right CardDb.
 */
function makeCachedLookup(): {
  get: (deckstring: string, decks: readonly PopularDeckEnriched[], cardDb: CardDb | null) => ReadonlyMap<string, number> | null;
} {
  let entry: DeckCardLookupCacheEntry | null = null;
  return {
    get(deckstring, decks, cardDb) {
      if (entry === null || entry.decks !== decks || entry.cardDb !== cardDb) {
        entry = { decks, cardDb, cache: new Map() };
      }
      const cached = entry.cache.get(deckstring);
      if (cached !== undefined) return cached;
      const result = decodeDeckToCardIdMap(deckstring, cardDb);
      entry.cache.set(deckstring, result);
      return result;
    },
  };
}

function decodeDeckToCardIdMap(
  deckstring: string,
  cardDb: CardDb | null,
): ReadonlyMap<string, number> | null {
  if (!cardDb) return null;
  let blueprint;
  try {
    blueprint = decodeDeck(deckstring);
  } catch {
    return null;
  }
  const counts = new Map<string, number>();
  for (const entry of blueprint.cards) {
    const card = cardDb.findByDbfId(entry.dbfId);
    if (!card) continue;
    counts.set(card.id, (counts.get(card.id) ?? 0) + entry.count);
  }
  return counts;
}

function formatFromMatchInfo(snapshot: DeckTrackerSnapshot): Format | null {
  const formatType = snapshot.matchInfo?.formatType;
  if (typeof formatType !== 'number') return null;
  return FORMAT_BY_NUMBER[formatType] ?? null;
}

export function computePredictions(
  snapshot: DeckTrackerSnapshot | null,
  popularDecks: readonly PopularDeckEnriched[],
  cardDb: CardDb | null,
  cachedLookup: ReturnType<typeof makeCachedLookup>,
): OpponentDeckPrediction[] {
  if (!snapshot) return [];
  if (snapshot.opponent.revealed.length === 0) return [];
  if (popularDecks.length === 0) return [];

  return predictOpponentDecks({
    observedCards: snapshot.opponent.revealed.map((r) => ({
      cardId: r.cardId,
      created: r.created,
    })),
    opponentClass: snapshot.opponentClass,
    format: formatFromMatchInfo(snapshot),
    candidates: popularDecks,
    deckCardLookup: (deckstring) => cachedLookup.get(deckstring, popularDecks, cardDb),
  });
}

/**
 * Wire opponent-deck-prediction IPC: a request/response `:get` channel
 * and a fire-on-snapshot-change `:update` push. Returns a `dispose()`
 * that removes the handler and unsubscribes the snapshot listener.
 */
export function registerOpponentDeckPredictionIpc(
  deps: OpponentDeckPredictionDeps,
): () => void {
  const cachedLookup = makeCachedLookup();
  const getWindows = deps.getWindows ?? (() => BrowserWindow.getAllWindows());

  ipcMain.handle(PREDICTION_GET_CHANNEL, () =>
    computePredictions(deps.getSnapshot(), deps.getPopularDecks(), deps.getCardDb(), cachedLookup),
  );

  const unsubscribe = deps.onSnapshotChange((snapshot) => {
    const predictions = computePredictions(
      snapshot,
      deps.getPopularDecks(),
      deps.getCardDb(),
      cachedLookup,
    );
    for (const win of getWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(PREDICTION_UPDATE_CHANNEL, predictions);
      }
    }
  });

  return () => {
    unsubscribe();
    ipcMain.removeHandler(PREDICTION_GET_CHANNEL);
  };
}

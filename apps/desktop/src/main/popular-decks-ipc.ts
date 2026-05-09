import { ipcMain } from 'electron';
import { POPULAR_DECKS_SEED, type PopularDeck, type PopularDeckEnriched } from '@hdt/core';
import type { CardDb } from '@hdt/hearthdb';
import { computeCardNames, computeDustCost, computeKeyCards, computeManaCurve } from './popular-decks-derived';

const EMPTY_CURVE: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0];

export type PopularDecksSource = 'synced' | 'seed';

export interface PopularDecksListResult {
  decks: PopularDeckEnriched[];
  source: PopularDecksSource;
  fetchedAt: string | null;
}

export interface PopularDecksDataSource {
  /** Synced cache, or null when no valid cache exists. */
  getSyncedDecks: () => { decks: readonly PopularDeck[]; fetchedAt: string } | null;
  getCardDb: () => CardDb | null;
}

/**
 * Compute the popular-decks list result (synced cache when present, seed
 * otherwise) with enrichment applied. Pulled out of the IPC handler so
 * the opponent-deck-prediction module can read the same enriched list
 * without going through IPC.
 *
 * Memoised on `(baseDecks identity, cardDb identity)` so consecutive
 * calls in the same sync window don't re-decode all deckstrings.
 */
let cachedEnriched: {
  baseDecks: readonly PopularDeck[];
  cardDb: CardDb | null;
  result: PopularDecksListResult;
} | null = null;

export function getPopularDecksList(source: PopularDecksDataSource): PopularDecksListResult {
  const synced = source.getSyncedDecks();
  const baseDecks: readonly PopularDeck[] = synced?.decks ?? POPULAR_DECKS_SEED;
  const sourceLabel: PopularDecksSource = synced ? 'synced' : 'seed';
  const fetchedAt: string | null = synced ? synced.fetchedAt : null;
  const cardDb = source.getCardDb();

  if (cachedEnriched && cachedEnriched.baseDecks === baseDecks && cachedEnriched.cardDb === cardDb) {
    // The cache is keyed by reference; if the synced snapshot changed
    // the baseDecks identity will differ. Override the source label /
    // fetchedAt because those are cheap and could shift even when the
    // underlying decks reference is stable (defensive).
    return { ...cachedEnriched.result, source: sourceLabel, fetchedAt };
  }

  let result: PopularDecksListResult;
  if (!cardDb) {
    result = {
      decks: baseDecks.map((d) => ({
        ...d,
        manaCurve: EMPTY_CURVE,
        keyCards: [],
        cardNames: [],
        dustCost: 0,
      })),
      source: sourceLabel,
      fetchedAt,
    };
  } else {
    const lookup = (dbfId: number) => cardDb.findByDbfId(dbfId) ?? null;
    result = {
      decks: baseDecks.map((d) => ({
        ...d,
        manaCurve: computeManaCurve(d.deckstring, lookup),
        keyCards: computeKeyCards(d.deckstring, lookup),
        cardNames: computeCardNames(d.deckstring, lookup),
        dustCost: computeDustCost(d.deckstring, lookup),
      })),
      source: sourceLabel,
      fetchedAt,
    };
  }
  cachedEnriched = { baseDecks, cardDb, result };
  return result;
}

export function registerPopularDecksIpc(source: PopularDecksDataSource): void {
  ipcMain.handle('popular-decks:list', (): PopularDecksListResult => getPopularDecksList(source));
}

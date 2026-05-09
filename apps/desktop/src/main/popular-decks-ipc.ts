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

export function registerPopularDecksIpc(source: PopularDecksDataSource): void {
  ipcMain.handle('popular-decks:list', (): PopularDecksListResult => {
    const synced = source.getSyncedDecks();
    const baseDecks: readonly PopularDeck[] = synced?.decks ?? POPULAR_DECKS_SEED;
    const sourceLabel: PopularDecksSource = synced ? 'synced' : 'seed';
    const fetchedAt: string | null = synced ? synced.fetchedAt : null;

    const cardDb = source.getCardDb();
    if (!cardDb) {
      return {
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
    }
    const lookup = (dbfId: number) => cardDb.findByDbfId(dbfId) ?? null;
    return {
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
  });
}

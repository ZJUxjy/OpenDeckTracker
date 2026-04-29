import { ipcMain } from 'electron';
import { POPULAR_DECKS_SEED, type PopularDeckEnriched } from '@hdt/core';
import type { CardDb } from '@hdt/hearthdb';
import { computeCardNames, computeKeyCards, computeManaCurve } from './popular-decks-derived';

const EMPTY_CURVE: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0];

export function registerPopularDecksIpc(getCardDb: () => CardDb | null): void {
  ipcMain.handle('popular-decks:list', (): readonly PopularDeckEnriched[] => {
    const cardDb = getCardDb();
    if (!cardDb) {
      return POPULAR_DECKS_SEED.map((d) => ({
        ...d,
        manaCurve: EMPTY_CURVE,
        keyCards: [],
        cardNames: [],
      }));
    }
    const lookup = (dbfId: number) => cardDb.findByDbfId(dbfId) ?? null;
    return POPULAR_DECKS_SEED.map((d) => ({
      ...d,
      manaCurve: computeManaCurve(d.deckstring, lookup),
      keyCards: computeKeyCards(d.deckstring, lookup),
      cardNames: computeCardNames(d.deckstring, lookup),
    }));
  });
}

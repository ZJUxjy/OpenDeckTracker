import type { Deck as LiveDeck } from '@hdt/hearthmirror';
import type { Format, HeroClass } from '@hdt/core';
import {
  NonCollectibleSnapshotError,
  type DeckStore,
  type SaveFromLiveCardLookup,
} from './deck-store';

export interface DeckSyncResult {
  /**
   * `'live'` when HearthMirror returned a (possibly empty) deck array,
   * `'unavailable'` when `getDecks()` returned null (Hearthstone not
   * running / CollectionManager not initialized), or `'error'` when
   * `getLiveDecks` threw. The sync host maps these to the broader
   * `LiveDeckSyncResult.source` set.
   */
  source: 'live' | 'unavailable' | 'error';
  /** Number of live decks the service successfully synced this run. */
  synced: number;
  /** Number of live decks skipped because they had non-collectible cards. */
  skippedNonCollectible: number;
  /** Number of live decks skipped because the hero card had no class mapping. */
  skippedUnknownClass: number;
  /** Populated when `source === 'error'`. */
  error?: string;
}

export interface DeckSyncDependencies {
  store: DeckStore;
  /**
   * Returns the live decks currently visible to HearthMirror. Returning
   * `null` means HearthMirror is unavailable; the sync service treats it
   * as "do nothing" rather than wiping app-managed records.
   */
  getLiveDecks: () => Promise<readonly LiveDeck[] | null>;
  /** Resolve a hero portrait card id (e.g. `HERO_05`) into a `HeroClass`. */
  resolveHeroClass: (cardId: string) => HeroClass | null;
  /** Card collectibility lookup forwarded into `DeckStore.saveFromLive`. */
  collectibleLookup: SaveFromLiveCardLookup;
}

const FORMAT_BY_TYPE: Record<number, Format> = {
  1: 'Wild',
  2: 'Standard',
  3: 'Classic',
  4: 'Twist',
};

export function createDeckSyncService(deps: DeckSyncDependencies): {
  syncOnce: () => Promise<DeckSyncResult>;
} {
  return {
    async syncOnce(): Promise<DeckSyncResult> {
      const result: DeckSyncResult = {
        source: 'live',
        synced: 0,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
      };

      let live: readonly LiveDeck[] | null = null;
      try {
        live = await deps.getLiveDecks();
      } catch (err) {
        console.warn('[deck-sync] getLiveDecks failed', err);
        result.source = 'error';
        result.error = err instanceof Error ? err.message : String(err);
        return result;
      }
      if (live === null) {
        result.source = 'unavailable';
        return result;
      }

      for (const liveDeck of live) {
        const heroClass = deps.resolveHeroClass(liveDeck.hero);
        if (heroClass === null) {
          result.skippedUnknownClass += 1;
          continue;
        }

        const format = FORMAT_BY_TYPE[liveDeck.formatType] ?? 'Standard';

        try {
          deps.store.saveFromLive(
            {
              name: liveDeck.name,
              class: heroClass,
              format,
              cards: liveDeck.cards.map((c) => ({ cardId: c.cardId, count: c.count })),
              liveDeckId: liveDeck.id,
            },
            deps.collectibleLookup,
          );
          result.synced += 1;
        } catch (err) {
          if (err instanceof NonCollectibleSnapshotError) {
            result.skippedNonCollectible += 1;
            continue;
          }
          console.error('[deck-sync] saveFromLive failed', err);
        }
      }

      return result;
    },
  };
}

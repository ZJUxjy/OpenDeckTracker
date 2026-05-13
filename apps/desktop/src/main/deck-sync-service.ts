import type { Deck as LiveDeck } from '@hdt/hearthmirror';
import type { DeckCard, Format, HeroClass } from '@hdt/core';
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
  /**
   * Resolve a main-deck card id into a player class. Used as a fallback when
   * the reflected hero portrait is an unknown skin card.
   */
  resolveCardClass?: (cardId: string) => HeroClass | null;
  /** Card collectibility lookup forwarded into `DeckStore.saveFromLive`. */
  collectibleLookup: SaveFromLiveCardLookup;
  /**
   * Hearthstone may report an empty m_decks map briefly while the collection
   * scene is still hydrating. Retry empty reads before treating them as real.
   */
  liveReadRetryDelaysMs?: readonly number[];
}

const DEFAULT_LIVE_READ_RETRY_DELAYS_MS = [250, 750, 1_500] as const;

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
        live = await readLiveDecks(deps);
      } catch (err) {
        console.warn('[deck-sync] getLiveDecks failed', err);
        result.source = 'error';
        result.error = err instanceof Error ? err.message : String(err);
        return result;
      }
      if (live === null) {
        console.log('[deck-sync] live decks unavailable');
        result.source = 'unavailable';
        return result;
      }
      console.log('[deck-sync] live decks read', {
        count: live.length,
        decks: live.map((deck) => ({
          id: deck.id,
          name: deck.name,
          hero: deck.hero,
          formatType: deck.formatType,
          deckType: deck.deckType,
          cardSlots: deck.cards.length,
          cardCount: deck.cards.reduce((sum, card) => sum + card.count, 0),
        })),
      });

      for (const liveDeck of live) {
        const heroClass = resolveLiveDeckClass(liveDeck, deps);
        console.log('[deck-sync] inspect live deck', {
          id: liveDeck.id,
          name: liveDeck.name,
          hero: liveDeck.hero,
          resolvedClass: heroClass,
          formatType: liveDeck.formatType,
          deckType: liveDeck.deckType,
          cardSlots: liveDeck.cards.length,
          cardCount: liveDeck.cards.reduce((sum, card) => sum + card.count, 0),
        });
        if (heroClass === null) {
          console.warn('[deck-sync] skip deck: unknown class', {
            id: liveDeck.id,
            name: liveDeck.name,
            hero: liveDeck.hero,
          });
          result.skippedUnknownClass += 1;
          continue;
        }

        const format = FORMAT_BY_TYPE[liveDeck.formatType] ?? 'Standard';

        const cards = liveDeck.cards.map((c) => ({ cardId: c.cardId, count: c.count }));
        const liveDeckOnlyCardIds = findLiveDeckOnlyCardIds(cards, deps.collectibleLookup);
        if (liveDeckOnlyCardIds.length > 0) {
          console.log('[deck-sync] allow live-deck-only cards', {
            id: liveDeck.id,
            name: liveDeck.name,
            cardIds: liveDeckOnlyCardIds,
          });
        }

        try {
          deps.store.saveFromLive(
            {
              name: liveDeck.name,
              class: heroClass,
              format,
              cards,
              liveDeckId: liveDeck.id,
            },
            deps.collectibleLookup,
          );
          console.log('[deck-sync] saved live deck', {
            id: liveDeck.id,
            name: liveDeck.name,
            class: heroClass,
            format,
          });
          result.synced += 1;
        } catch (err) {
          if (err instanceof NonCollectibleSnapshotError) {
            console.warn('[deck-sync] skip deck: non-collectible cards', {
              id: liveDeck.id,
              name: liveDeck.name,
              cardIds: err.cardIds,
            });
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

function resolveLiveDeckClass(
  liveDeck: LiveDeck,
  deps: DeckSyncDependencies,
): HeroClass | null {
  const heroClass = deps.resolveHeroClass(liveDeck.hero);
  if (heroClass !== null) return heroClass;
  if (deps.resolveCardClass === undefined) return null;

  const classWeights = new Map<HeroClass, number>();
  for (const slot of liveDeck.cards) {
    const cls = deps.resolveCardClass(slot.cardId);
    if (cls === null || cls === 'NEUTRAL') continue;
    classWeights.set(cls, (classWeights.get(cls) ?? 0) + Math.max(1, slot.count));
  }

  let best: { cls: HeroClass; weight: number } | null = null;
  let tied = false;
  for (const [cls, weight] of classWeights) {
    if (best === null || weight > best.weight) {
      best = { cls, weight };
      tied = false;
    } else if (weight === best.weight) {
      tied = true;
    }
  }
  return tied ? null : best?.cls ?? null;
}

async function readLiveDecks(
  deps: DeckSyncDependencies,
): Promise<readonly LiveDeck[] | null> {
  const delays = deps.liveReadRetryDelaysMs ?? DEFAULT_LIVE_READ_RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt += 1) {
    const live = await deps.getLiveDecks();
    if (live === null || live.length > 0 || attempt >= delays.length) {
      return live;
    }
    await sleep(delays[attempt]!);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findLiveDeckOnlyCardIds(
  cards: readonly DeckCard[],
  lookup: SaveFromLiveCardLookup,
): string[] {
  const ids: string[] = [];
  for (const card of cards) {
    const info = lookup(card.cardId);
    if (info !== null && !info.collectible && info.validInLiveDeck === true) {
      ids.push(card.cardId);
    }
  }
  return ids;
}

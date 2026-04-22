import { useEffect, useState } from 'react';
import type { CardDef } from '@hdt/hearthdb';

const CARD_CACHE = new Map<string, CardDef | null>();
const PENDING = new Map<string, Promise<CardDef | null>>();

/**
 * Look up a card definition by cardId via the IPC-exposed
 * `window.hdt.cards.findById`. Caches at module level so repeated
 * lookups across components and renders don't re-roundtrip the IPC.
 *
 * Returns:
 *   - `undefined` while the lookup is in flight (renders use the cardId
 *     as a fallback display).
 *   - `null` when the cardId is not in the database (unknown card).
 *   - `CardDef` on success.
 */
export function useCardDef(cardId: string): CardDef | null | undefined {
  const [def, setDef] = useState<CardDef | null | undefined>(() =>
    CARD_CACHE.get(cardId),
  );

  useEffect(() => {
    if (cardId === '') {
      setDef(null);
      return;
    }
    if (CARD_CACHE.has(cardId)) {
      setDef(CARD_CACHE.get(cardId));
      return;
    }
    let pending = PENDING.get(cardId);
    if (!pending) {
      const api = window.hdt?.cards;
      if (!api) {
        setDef(null);
        return;
      }
      pending = api.findById(cardId).then((result) => {
        CARD_CACHE.set(cardId, result);
        PENDING.delete(cardId);
        return result;
      });
      PENDING.set(cardId, pending);
    }
    let alive = true;
    void pending.then((result) => {
      if (alive) setDef(result);
    });
    return () => {
      alive = false;
    };
  }, [cardId]);

  return def;
}

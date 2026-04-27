import { useEffect, useState } from 'react';
import type { CardDef } from '@hdt/hearthdb';
import { useLocale } from '../i18n';

const CARD_CACHE = new Map<string, CardDef | null>();
const PENDING = new Map<string, Promise<CardDef | null>>();

function cacheKey(cardId: string, locale: string): string {
  return `${locale}:${cardId}`;
}

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
  const locale = useLocale();
  const key = cacheKey(cardId, locale);
  const [def, setDef] = useState<CardDef | null | undefined>(() =>
    CARD_CACHE.get(key),
  );

  useEffect(() => {
    if (cardId === '') {
      setDef(null);
      return;
    }
    if (CARD_CACHE.has(key)) {
      setDef(CARD_CACHE.get(key));
      return;
    }
    let pending = PENDING.get(key);
    if (!pending) {
      const api = window.hdt?.cards;
      if (!api) {
        setDef(null);
        return;
      }
      pending = api.findById(cardId, locale).then((result) => {
        CARD_CACHE.set(key, result);
        PENDING.delete(key);
        return result;
      });
      PENDING.set(key, pending);
    }
    let alive = true;
    void pending.then((result) => {
      if (alive) setDef(result);
    });
    return () => {
      alive = false;
    };
  }, [cardId, key, locale]);

  return def;
}

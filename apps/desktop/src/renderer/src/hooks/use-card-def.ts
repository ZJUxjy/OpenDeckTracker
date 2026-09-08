import { useCallback, useEffect, useState } from 'react';
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
export function useCardLookup(cardId: string) {
  const locale = useLocale();
  const key = cacheKey(cardId, locale);
  const [result, setResult] = useState<{ key: string; card: CardDef | null | undefined; error: boolean }>(
    () => ({ key, card: CARD_CACHE.get(key), error: false }),
  );
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (cardId === '') {
      setResult({ key, card: null, error: false });
      return;
    }
    if (CARD_CACHE.has(key)) {
      setResult({ key, card: CARD_CACHE.get(key), error: false });
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setResult({ key, card: undefined, error: false });
    function lookup(retries: number) {
      if (CARD_CACHE.has(key)) {
        setResult({ key, card: CARD_CACHE.get(key), error: false });
        return;
      }
      const api = window.hdt?.cards;
      if (!api) { setResult({ key, card: null, error: false }); return; }
      let pending = PENDING.get(key);
      if (!pending) {
        pending = Promise.resolve().then(() => api.findById(cardId, locale)).then(card => {
          CARD_CACHE.set(key, card);
          return card;
        }).finally(() => { PENDING.delete(key); });
        PENDING.set(key, pending);
      }
      void pending.then(card => {
        if (alive) setResult({ key, card, error: false });
      }).catch(() => {
        if (!alive) return;
        setResult({ key, card: undefined, error: true });
        if (retries < 2) timer = setTimeout(() => lookup(retries + 1), 500 * (retries + 1));
      });
    }
    lookup(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [cardId, key, locale, attempt]);

  return { card: result.key === key ? result.card : CARD_CACHE.get(key),
    error: result.key === key && result.error, retry };
}

export function useCardDef(cardId: string): CardDef | null | undefined {
  return useCardLookup(cardId).card;
}

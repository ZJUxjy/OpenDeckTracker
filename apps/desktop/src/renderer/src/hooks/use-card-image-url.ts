import { useMemo } from 'react';

const PRIMARY_LOCALE = 'zhCN';
const FALLBACK_LOCALE = 'enUS';
const SIZE = '256x';
const BASE_URL = 'https://art.hearthstonejson.com/v1/render/latest';

/**
 * In-flight dedup cache: prevents concurrent fetches for the same cardId
 * from creating multiple HTTP requests.
 */
const resolvedUrls = new Map<string, string>();

function buildUrl(cardId: string, locale: string): string {
  return `${BASE_URL}/${locale}/${SIZE}/${cardId}.png`;
}

export function getCardImageUrl(cardId: string): {
  primary: string;
  fallback: string;
} {
  return {
    primary: buildUrl(cardId, PRIMARY_LOCALE),
    fallback: buildUrl(cardId, FALLBACK_LOCALE),
  };
}

/**
 * Hook that returns the card image URL for a given cardId.
 * Uses zhCN as primary locale, enUS as fallback.
 * Maintains a module-level cache for in-flight dedup.
 */
export function useCardImageUrl(cardId: string): {
  primary: string;
  fallback: string;
} {
  return useMemo(() => {
    // Check cache first
    const cached = resolvedUrls.get(cardId);
    if (cached) {
      // If we know the fallback works, use it
      if (cached === 'fallback') {
        return {
          primary: buildUrl(cardId, FALLBACK_LOCALE),
          fallback: buildUrl(cardId, FALLBACK_LOCALE),
        };
      }
    }
    return getCardImageUrl(cardId);
  }, [cardId]);
}

/**
 * Mark that a cardId's primary URL failed and fallback should be used.
 */
export function markFallback(cardId: string): void {
  resolvedUrls.set(cardId, 'fallback');
}

/**
 * Mark that a cardId loaded successfully with the given URL.
 */
export function markSuccess(cardId: string, url: string): void {
  if (url.includes(`/${PRIMARY_LOCALE}/`)) {
    resolvedUrls.set(cardId, 'primary');
  } else {
    resolvedUrls.set(cardId, 'fallback');
  }
}

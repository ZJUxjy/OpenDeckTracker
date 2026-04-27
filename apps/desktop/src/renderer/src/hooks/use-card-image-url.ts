import { useEffect, useMemo, useState } from 'react';
import { useLocale, type AppLocale } from '../i18n';

const FALLBACK_LOCALE = 'enUS';
const DEFAULT_APP_LOCALE_FOR_CARD_IMAGES: AppLocale = 'zh-CN';
const SIZE = '256x';
const BASE_URL = 'https://art.hearthstonejson.com/v1/render/latest';

/**
 * In-flight dedup cache: prevents concurrent fetches for the same cardId
 * from creating multiple HTTP requests.
 */
const resolvedUrls = new Map<string, string>();
const cachedImageUrls = new Map<string, string>();

function toHearthstoneLocale(appLocale: AppLocale): 'enUS' | 'zhCN' {
  return appLocale === 'zh-CN' ? 'zhCN' : 'enUS';
}

function cacheKey(cardId: string, appLocale: AppLocale): string {
  return `${appLocale}:${cardId}`;
}

function buildUrl(cardId: string, locale: string): string {
  return `${BASE_URL}/${locale}/${SIZE}/${cardId}.png`;
}

export function getCardImageUrl(
  cardId: string,
  appLocale: AppLocale = DEFAULT_APP_LOCALE_FOR_CARD_IMAGES,
): {
  primary: string;
  fallback: string;
} {
  const primaryLocale = toHearthstoneLocale(appLocale);
  return {
    primary: buildUrl(cardId, primaryLocale),
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
  const appLocale = useLocale();
  const key = cacheKey(cardId, appLocale);
  const [cachedUrl, setCachedUrl] = useState(() => cachedImageUrls.get(key) ?? null);

  useEffect(() => {
    let alive = true;
    const existing = cachedImageUrls.get(key);
    if (existing) {
      setCachedUrl(existing);
      return () => {
        alive = false;
      };
    }

    const cardImagesApi = window.hdt?.cardImages;
    if (!cardImagesApi) {
      setCachedUrl(null);
      return () => {
        alive = false;
      };
    }

    setCachedUrl(null);
    void cardImagesApi.get(cardId, appLocale)
      .then((cached) => {
        if (!alive || !cached?.url) return;
        cachedImageUrls.set(key, cached.url);
        setCachedUrl(cached.url);
      })
      .catch(() => {
        if (alive) setCachedUrl(null);
      });

    return () => {
      alive = false;
    };
  }, [appLocale, cardId, key]);

  return useMemo(() => {
    if (cachedUrl) {
      return {
        primary: cachedUrl,
        fallback: cachedUrl,
      };
    }

    // Check cache first
    const cached = resolvedUrls.get(key);
    if (cached) {
      // If we know the fallback works, use it
      if (cached === 'fallback') {
        return {
          primary: buildUrl(cardId, FALLBACK_LOCALE),
          fallback: buildUrl(cardId, FALLBACK_LOCALE),
        };
      }
    }
    return getCardImageUrl(cardId, appLocale);
  }, [appLocale, cardId, cachedUrl, key]);
}

/**
 * Mark that a cardId's primary URL failed and fallback should be used.
 */
export function markFallback(
  cardId: string,
  appLocale: AppLocale = DEFAULT_APP_LOCALE_FOR_CARD_IMAGES,
): void {
  resolvedUrls.set(cacheKey(cardId, appLocale), 'fallback');
}

/**
 * Mark that a cardId loaded successfully with the given URL.
 */
export function markSuccess(
  cardId: string,
  url: string,
  appLocale: AppLocale = DEFAULT_APP_LOCALE_FOR_CARD_IMAGES,
): void {
  const key = cacheKey(cardId, appLocale);
  if (url.includes(`/${toHearthstoneLocale(appLocale)}/`)) {
    resolvedUrls.set(key, 'primary');
  } else {
    resolvedUrls.set(key, 'fallback');
  }
}

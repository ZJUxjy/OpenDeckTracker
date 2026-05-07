import { useEffect, useState } from 'react';
import { markFallback, markSuccess, useCardImageUrl } from '../hooks/use-card-image-url';
import { useLocale } from '../i18n';

/**
 * Standalone renderer for the floating card-preview tooltip window.
 * The route loads at #/card-preview; the BrowserWindow is positioned
 * by the main process next to whichever overlay panel triggered the
 * hover.
 *
 * Two modes:
 *   - single (`card-preview:set-card`): one card image. Used by deck
 *     row hover.
 *   - pool   (`card-preview:set-pool`): N cards side-by-side. Used by
 *     the Animal Companion pool row hover so the user sees the 3
 *     beasts at full size like in-game.
 *
 * Whichever IPC fires last wins; main resizes the window to fit.
 */
export function CardPreviewView() {
  const [cardId, setCardId] = useState<string | null>(null);
  const [pool, setPool] = useState<readonly string[] | null>(null);

  useEffect(() => {
    const offCard = window.hdt?.cardPreview?.onSetCard?.((next) => {
      setCardId(next);
      setPool(null);
    });
    const offPool = window.hdt?.cardPreview?.onSetPool?.((next) => {
      setPool(next);
      setCardId(null);
    });
    return () => {
      offCard?.();
      offPool?.();
    };
  }, []);

  if (pool && pool.length > 0) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-transparent select-none p-2">
        <div className="flex items-stretch justify-center gap-3 w-full h-full px-4 py-3 rounded-xl border border-border bg-bg-2/95 backdrop-blur-sm shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
          {pool.map((id, i) => (
            <div
              key={`${id}-${i}`}
              className="flex-1 min-w-0 h-full flex items-center justify-center"
            >
              <CardImage cardId={id} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!cardId) {
    return <div className="w-screen h-screen bg-transparent" />;
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-transparent select-none">
      <CardImage cardId={cardId} />
    </div>
  );
}

/**
 * Inner image renderer. Fills its parent (which sets the bounding box).
 *
 * Flicker mitigation: when the cardId changes, preload the new image
 * via `new Image()` BEFORE swapping the visible <img src>. The user
 * keeps seeing the previous card until the new one is decoded, then
 * the swap is atomic with no fade — instant feel.
 */
function CardImage({ cardId }: { cardId: string }) {
  const locale = useLocale();
  const { primary, fallback } = useCardImageUrl(cardId);
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setErrored(false);

    const preload = (url: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image failed to load'));
        img.src = url;
      });

    void (async () => {
      try {
        await preload(primary);
        if (!cancelled) {
          markSuccess(cardId, primary, locale);
          setDisplayedSrc(primary);
        }
      } catch {
        try {
          await preload(fallback);
          if (!cancelled) {
            markFallback(cardId, locale);
            setDisplayedSrc(fallback);
          }
        } catch {
          if (!cancelled) setErrored(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cardId, primary, fallback, locale]);

  if (errored || displayedSrc === null) {
    return <div className="w-full h-full bg-transparent" />;
  }

  return (
    <img
      src={displayedSrc}
      alt={cardId}
      draggable={false}
      className="max-w-full max-h-full object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
    />
  );
}

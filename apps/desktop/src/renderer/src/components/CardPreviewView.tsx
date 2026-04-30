import { useEffect, useState } from 'react';
import { markFallback, markSuccess, useCardImageUrl } from '../hooks/use-card-image-url';
import { useLocale } from '../i18n';

/**
 * Standalone renderer for the floating card-preview tooltip window.
 * The route loads at #/card-preview; the BrowserWindow is positioned
 * by the main process next to whichever overlay panel triggered the
 * hover. This component just listens for `card-preview:set-card`
 * pushes from main and renders the matching card image.
 *
 * Flicker mitigation: when the cardId changes, preload the new image
 * via `new Image()` BEFORE swapping the visible <img src>. The user
 * keeps seeing the previous card until the new one is decoded, then
 * the swap is atomic with no fade — instant feel.
 */
export function CardPreviewView() {
  const [cardId, setCardId] = useState<string | null>(null);

  useEffect(() => {
    const off = window.hdt?.cardPreview?.onSetCard?.((next) => setCardId(next));
    return () => {
      off?.();
    };
  }, []);

  if (!cardId) {
    return <div className="w-screen h-screen bg-transparent" />;
  }

  return <CardImage cardId={cardId} />;
}

function CardImage({ cardId }: { cardId: string }) {
  const locale = useLocale();
  const { primary, fallback } = useCardImageUrl(cardId);
  // The src actually attached to the visible <img>. We only swap it
  // AFTER the next image has been preloaded, so the user never sees
  // the image element go blank between cards.
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
          if (!cancelled) {
            setErrored(true);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cardId, primary, fallback, locale]);

  // On the very first preview ever, displayedSrc is null and there's
  // nothing to show — render a transparent placeholder. After that we
  // KEEP the previous image visible while the next one preloads.
  if (errored || displayedSrc === null) {
    return <div className="w-screen h-screen bg-transparent" />;
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-transparent select-none">
      <img
        src={displayedSrc}
        alt={cardId}
        draggable={false}
        className="max-w-full max-h-full object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}

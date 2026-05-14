import { useEffect, useRef, useState } from 'react';
import { markFallback, markSuccess, useCardImageUrl } from '../hooks/use-card-image-url';
import { useCardDef } from '../hooks/use-card-def';
import { useGlassMouseFollow } from '../hooks/use-glass-mouse-follow';
import { useLocale } from '../i18n';

interface ExtraPreviewPayload {
  title: string;
  lines: readonly string[];
}

const POOL_PREVIEW_MAX_COLUMNS = 4;
const POOL_PREVIEW_CARD_WIDTH = 230;
const POOL_PREVIEW_CARD_HEIGHT = 330;
const POOL_PREVIEW_GAP = 14;

/**
 * Standalone renderer for the floating card-preview tooltip window.
 * The route loads at #/card-preview; the BrowserWindow is positioned
 * by the main process next to whichever overlay panel triggered the
 * hover.
 *
 * Two modes:
 *   - single (`card-preview:set-card`): one card image. Used by deck
 *     row hover.
 *   - pool   (`card-preview:set-pool`): N cards in a max-four-column
 *     grid. Used by card pools so the user sees related cards at full
 *     size like in-game.
 *   - extra  (`card-preview:set-extra`): text-only enhanced tracker
 *     context for cards whose extra display is a counter rather than
 *     a card pool.
 *
 * Whichever IPC fires last wins; main resizes the window to fit.
 */
export function CardPreviewView() {
  const [cardId, setCardId] = useState<string | null>(null);
  const [pool, setPool] = useState<readonly string[] | null>(null);
  const [extra, setExtra] = useState<ExtraPreviewPayload | null>(null);
  const poolGlassRef = useRef<HTMLDivElement | null>(null);
  useGlassMouseFollow(poolGlassRef);

  useEffect(() => {
    const offCard = window.hdt?.cardPreview?.onSetCard?.((next) => {
      setCardId(next);
      setPool(null);
      setExtra(null);
    });
    const offPool = window.hdt?.cardPreview?.onSetPool?.((next) => {
      setPool(next);
      setCardId(null);
      setExtra(null);
    });
    const offExtra = window.hdt?.cardPreview?.onSetExtra?.((next) => {
      setExtra(next);
      setCardId(null);
      setPool(null);
    });
    return () => {
      offCard?.();
      offPool?.();
      offExtra?.();
    };
  }, []);

  if (pool && pool.length > 0) {
    const columnCount = Math.min(pool.length, POOL_PREVIEW_MAX_COLUMNS);

    return (
      <div className="w-screen h-screen flex items-center justify-center bg-transparent select-none p-2">
        <div
          ref={poolGlassRef}
          data-testid="card-preview-pool"
          className="macos-glass grid place-content-center w-full h-full rounded-2xl overflow-hidden"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, ${POOL_PREVIEW_CARD_WIDTH}px)`,
            gridAutoRows: `${POOL_PREVIEW_CARD_HEIGHT}px`,
            gap: `${POOL_PREVIEW_GAP}px`,
          }}
        >
          {pool.map((id, i) => (
            <div
              key={`${id}-${i}`}
              className="min-w-0 min-h-0 h-full w-full flex items-stretch justify-center"
              style={{
                width: POOL_PREVIEW_CARD_WIDTH,
                height: POOL_PREVIEW_CARD_HEIGHT,
              }}
            >
              <PoolCardPreview cardId={id} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (extra && extra.lines.length > 0) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-transparent select-none p-3">
        <ExtraPreviewPanel payload={extra} />
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

function ExtraPreviewPanel({ payload }: { payload: ExtraPreviewPayload }) {
  return (
    <div className="macos-glass w-full max-w-[360px] rounded-xl border border-border px-4 py-3 text-text-primary shadow-elevated">
      <div className="text-sm font-bold leading-tight text-text-primary">
        {payload.title}
      </div>
      <div className="mt-3 space-y-2">
        {payload.lines.map((line, index) => (
          <div
            key={`${index}:${line}`}
            className="rounded-md border border-border-hairline bg-surface-popover/80 px-3 py-2 text-[13px] leading-snug text-text-secondary"
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function PoolCardPreview({ cardId }: { cardId: string }) {
  const def = useCardDef(cardId);
  const name = def?.name ?? cardId;

  return (
    <div
      className="min-w-0 min-h-0 h-full w-full flex items-center justify-center"
      aria-label={name}
      title={name}
    >
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

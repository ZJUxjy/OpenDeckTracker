import { useState, useEffect, useCallback } from 'react';
import { markFallback, markSuccess, useCardImageUrl } from '../hooks/use-card-image-url';
import { useLocale, useTranslation } from '../i18n';

interface CardImagePopoverProps {
  cardId: string;
  anchorRect: DOMRect;
  onClose: () => void;
  placement?: 'left' | 'right';
}

export function CardImagePopover({
  cardId,
  anchorRect,
  onClose,
  placement = 'left',
}: CardImagePopoverProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { primary, fallback } = useCardImageUrl(cardId);
  const [src, setSrc] = useState(primary);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSrc(primary);
    setError(false);
    setLoading(true);
  }, [cardId, primary]);

  const handleImageError = useCallback(() => {
    if (src !== fallback) {
      markFallback(cardId, locale);
      setLoading(true);
      setSrc(fallback);
    } else {
      setError(true);
      setLoading(false);
    }
  }, [src, cardId, fallback, locale]);

  const handleImageLoad = useCallback(() => {
    markSuccess(cardId, src, locale);
    setLoading(false);
    setError(false);
  }, [cardId, locale, src]);

  // Position the 256×386 popover so it stays inside the hosting window's
  // pixel bounds. In an in-game overlay the host window is only ~320 px
  // wide, so a popover beside the panel would clip — clamp to fit.
  const POP_W = 256;
  const POP_H = 386;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const spaceRight = winW - anchorRect.right;
  const spaceLeft = anchorRect.left;
  const preferRight = placement === 'right' || spaceRight >= spaceLeft;
  let left: number;
  if (preferRight) {
    left = Math.min(anchorRect.right + 8, winW - POP_W - 4);
  } else {
    left = Math.max(4, anchorRect.left - POP_W - 8);
  }
  // Final safety clamp: never let the popover extend outside the window.
  left = Math.min(Math.max(4, left), Math.max(4, winW - POP_W - 4));
  const top = Math.max(8, Math.min(anchorRect.top - 60, winH - POP_H - 8));

  return (
    <div
      className="fixed z-50"
      style={{ top: `${top}px`, left: `${left}px` }}
      onMouseLeave={onClose}
    >
      <div className="w-[256px] bg-white/5 rounded-lg shadow-2xl border border-border overflow-hidden">
        {loading && (
          <div className="h-[386px] flex items-center justify-center text-text-dim text-xs">
            {t('cardImage.loading')}
          </div>
        )}
        {error && (
          <div className="h-[386px] flex items-center justify-center text-text-dim text-xs">
            {t('cardImage.unavailable')}
          </div>
        )}
        <img
          src={src}
          alt={cardId}
          onError={handleImageError}
          onLoad={handleImageLoad}
          className={clsx_(loading || error ? 'hidden' : 'block')}
          draggable={false}
        />
      </div>
    </div>
  );
}

function clsx_(...args: (string | false | undefined)[]) {
  return args.filter(Boolean).join(' ');
}

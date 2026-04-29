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

  // Default position: left of the local deck panel. Opponent panel can request right side.
  const top = Math.max(8, Math.min(anchorRect.top - 80, window.innerHeight - 420));
  const right = window.innerWidth - anchorRect.left + 8;
  const left = anchorRect.right + 8;

  return (
    <div
      className="fixed z-50"
      style={placement === 'right' ? { top: `${top}px`, left: `${left}px` } : { top: `${top}px`, right: `${right}px` }}
      onMouseLeave={onClose}
    >
      <div className="w-[256px] bg-bg-2 rounded-lg shadow-2xl border border-border overflow-hidden">
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

import { useCallback, useEffect, useRef } from 'react';

/**
 * Hover handlers that drive the floating card-preview tooltip window.
 * Computes screen-relative anchor coordinates from the row element's
 * window-relative DOMRect plus `window.screenX/Y`, picks which side of
 * the panel to place the preview on (always away from the screen
 * center, so a panel on the right of the screen pops the preview to
 * the left and vice versa), and forwards via `window.hdt.cardPreview.*`.
 */
export function useCardPreview(): {
  onRowEnter: (cardId: string, el: HTMLElement) => void;
  onRowLeave: () => void;
} {
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onRowEnter = useCallback((cardId: string, el: HTMLElement) => {
    if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      const api = window.hdt?.cardPreview;
      if (!api) return;
      const rect = el.getBoundingClientRect();
      const screenX = window.screenX + rect.left;
      const screenY = window.screenY + rect.top;
      const winCenterX = window.screenX + window.innerWidth / 2;
      const screenWidth = window.screen.width;
      // If the panel is on the RIGHT half of the desktop, push preview LEFT.
      const side: 'left' | 'right' = winCenterX > screenWidth / 2 ? 'left' : 'right';
      void api.show(cardId, {
        x: Math.round(screenX),
        y: Math.round(screenY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        side,
      });
    }, 250);
  }, []);

  const onRowLeave = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    void window.hdt?.cardPreview?.hide?.();
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        clearTimeout(hoverTimerRef.current);
      }
      void window.hdt?.cardPreview?.hide?.();
    };
  }, []);

  return { onRowEnter, onRowLeave };
}

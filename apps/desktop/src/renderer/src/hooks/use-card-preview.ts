import { useCallback, useEffect, useRef } from 'react';

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
  side: 'left' | 'right';
}

const PREVIEW_WIDTH = 280;
const PREVIEW_GAP = 8;

function computeAnchor(el: HTMLElement): AnchorRect {
  const rect = el.getBoundingClientRect();
  const screenX = window.screenX + rect.left;
  const screenY = window.screenY + rect.top;
  const screenRight = window.screenX + rect.right;
  const screenInfo = window.screen as Screen & { availLeft?: number };
  const displayLeft = Number.isFinite(screenInfo.availLeft) ? screenInfo.availLeft! : 0;
  const displayRight = displayLeft + (screenInfo.availWidth || screenInfo.width);
  const spaceLeft = screenX - displayLeft;
  const spaceRight = displayRight - screenRight;
  const required = PREVIEW_WIDTH + PREVIEW_GAP;
  const side: 'left' | 'right' =
    spaceRight >= required && spaceRight >= spaceLeft ? 'right' : 'left';
  return {
    x: Math.round(screenX),
    y: Math.round(screenY),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    side,
  };
}

/**
 * Hover handlers that drive the floating card-preview tooltip window.
 * Two modes:
 *   - `onRowEnter(cardId, el)` shows ONE card next to the row (used by
 *     deck rows).
 *   - `onPoolEnter(cardIds, el)` shows N cards side-by-side (used by
 *     the Animal Companion pool row).
 *
 * `onRowLeave` hides whichever preview is currently visible. The pool
 * variant skips the hover delay since the pool row is large and the
 * intent is unambiguous; deck rows keep the 250ms delay so brushing
 * the cursor over multiple rows doesn't churn the preview window.
 */
export function useCardPreview(): {
  onRowEnter: (cardId: string, el: HTMLElement) => void;
  onPoolEnter: (cardIds: readonly string[], el: HTMLElement) => void;
  onRowLeave: () => void;
} {
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHover = (): void => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const onRowEnter = useCallback((cardId: string, el: HTMLElement) => {
    clearHover();
    hoverTimerRef.current = setTimeout(() => {
      const api = window.hdt?.cardPreview;
      if (!api) return;
      void api.show(cardId, computeAnchor(el));
    }, 250);
  }, []);

  const onPoolEnter = useCallback((cardIds: readonly string[], el: HTMLElement) => {
    clearHover();
    if (cardIds.length === 0) return;
    const api = window.hdt?.cardPreview;
    if (!api?.showPool) return;
    void api.showPool(cardIds, computeAnchor(el));
  }, []);

  const onRowLeave = useCallback(() => {
    clearHover();
    void window.hdt?.cardPreview?.hide?.();
  }, []);

  useEffect(() => {
    return () => {
      clearHover();
      void window.hdt?.cardPreview?.hide?.();
    };
  }, []);

  return { onRowEnter, onPoolEnter, onRowLeave };
}

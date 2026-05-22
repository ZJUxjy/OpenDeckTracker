import { useCallback, useEffect } from 'react';
import { getStaticHoverPoolCardIds } from '../lib/card-preview-specials';

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
  side: 'left' | 'right';
}

const PREVIEW_WIDTH = 280;
const PREVIEW_GAP = 8;

export type RowPreviewRequest =
  | string
  | {
      cardId: string;
      poolCardIds?: readonly string[];
      extra?: {
        title: string;
        lines: readonly string[];
      };
    };

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
 *   - `onRowEnter(cardId, el)` shows ONE card next to the row.
 *   - `onRowEnter({ cardId, poolCardIds }, el)` shows the hovered card
 *     plus a separate enhanced-card pool.
 *   - `onRowEnter({ cardId, extra }, el)` shows the hovered card plus
 *     separate text enhanced context.
 *   - `onPoolEnter(cardIds, el)` shows N cards side-by-side (used by
 *     the Animal Companion pool row).
 *
 * `onRowLeave` hides whichever preview is currently visible. Preview
 * fires synchronously on mouseenter — the earlier 250ms anti-flicker
 * delay was removed at user request. Mouseleave still calls
 * `api.hide()` so the preview tracks the cursor without lag.
 */
export function useCardPreview(): {
  onRowEnter: (request: RowPreviewRequest, el: HTMLElement) => void;
  onPoolEnter: (cardIds: readonly string[], el: HTMLElement) => void;
  onRowLeave: () => void;
} {
  const onRowEnter = useCallback((request: RowPreviewRequest, el: HTMLElement) => {
    const api = window.hdt?.cardPreview;
    if (!api) return;
    const cardId = typeof request === 'string' ? request : request.cardId;
    const requestedPoolCardIds = typeof request === 'string' ? [] : (request.poolCardIds ?? []);
    const extra = typeof request === 'string' ? null : (request.extra ?? null);
    const anchor = computeAnchor(el);
    if (requestedPoolCardIds.length > 0) {
      if (api.showEnhancedPool) {
        void api.showEnhancedPool(cardId, requestedPoolCardIds, anchor);
        return;
      }
      if (api.showPool) {
        void api.showPool(requestedPoolCardIds, anchor);
        return;
      }
    }
    if (extra && extra.lines.length > 0 && api.showEnhancedExtra) {
      void api.showEnhancedExtra(cardId, extra, anchor);
      return;
    }
    if (extra && extra.lines.length > 0 && api.showExtra) {
      void api.showExtra(extra, anchor);
      return;
    }
    const staticPoolCardIds = getStaticHoverPoolCardIds(cardId);
    if (staticPoolCardIds.length > 0) {
      if (api.showEnhancedPool) {
        void api.showEnhancedPool(cardId, staticPoolCardIds, anchor);
        return;
      }
      if (api.showPool) {
        void api.showPool(staticPoolCardIds, anchor);
        return;
      }
      return;
    }
    void api.show(cardId, anchor);
  }, []);

  const onPoolEnter = useCallback((cardIds: readonly string[], el: HTMLElement) => {
    if (cardIds.length === 0) return;
    const api = window.hdt?.cardPreview;
    if (!api?.showPool) return;
    void api.showPool(cardIds, computeAnchor(el));
  }, []);

  const onRowLeave = useCallback(() => {
    void window.hdt?.cardPreview?.hide?.();
  }, []);

  useEffect(() => {
    return () => {
      void window.hdt?.cardPreview?.hide?.();
    };
  }, []);

  return { onRowEnter, onPoolEnter, onRowLeave };
}

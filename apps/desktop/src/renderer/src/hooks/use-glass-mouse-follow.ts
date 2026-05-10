import { useEffect, type RefObject } from 'react';

/**
 * Mouse-follow specular highlight for Liquid Glass surfaces.
 *
 * Attaches a `mousemove` listener to the target element and updates
 * `--glass-mx` / `--glass-my` CSS custom properties (in pixels,
 * relative to the element's bounding box). The corresponding CSS
 * paints a radial-gradient ::before pseudo anchored at those coords,
 * so the highlight tracks the cursor as it moves over the panel.
 *
 * On `mouseleave` the variables are parked off-screen so the
 * highlight fades to nothing.
 *
 * Throttled via requestAnimationFrame to avoid layout thrash on
 * fast pointer movement.
 */
export function useGlassMouseFollow<T extends HTMLElement>(
  ref: RefObject<T | null>,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined' || !window.requestAnimationFrame) return;

    let rafId = 0;
    let pendingX = 0;
    let pendingY = 0;
    let scheduled = false;

    const flush = (): void => {
      el.style.setProperty('--glass-mx', `${pendingX}px`);
      el.style.setProperty('--glass-my', `${pendingY}px`);
      scheduled = false;
    };

    const onMove = (e: MouseEvent): void => {
      const rect = el.getBoundingClientRect();
      pendingX = e.clientX - rect.left;
      pendingY = e.clientY - rect.top;
      if (scheduled) return;
      scheduled = true;
      rafId = window.requestAnimationFrame(flush);
    };

    const onLeave = (): void => {
      // Park off-screen so the radial gradient fades out cleanly.
      el.style.setProperty('--glass-mx', '-200px');
      el.style.setProperty('--glass-my', '-200px');
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [ref]);
}

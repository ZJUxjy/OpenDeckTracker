import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { GameProgressNarrationFrame } from '@hdt/core';
import { useTranslation } from '../i18n';

const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

// Mirror the main-process narration host buffer so the panel never grows
// unbounded during a long match.
const MAX_FRAMES = 200;

/**
 * In-game live narration feed. Seeds from the main-process recent buffer
 * (`gameProgressNarration:get-recent`) then appends frames pushed live
 * over `gameProgressNarration:frame`. The buffer clears on the main side
 * when a new game starts, so a fresh match begins from an empty list.
 */
export function LiveNarrationPanel(): ReactElement {
  const { t } = useTranslation();
  const [frames, setFrames] = useState<GameProgressNarrationFrame[]>([]);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const api = window.hdt?.gameProgressNarration;
    if (!api) return;
    let cancelled = false;

    const merge = (
      prev: GameProgressNarrationFrame[],
      incoming: readonly GameProgressNarrationFrame[],
    ): GameProgressNarrationFrame[] => {
      const seen = new Set(prev.map((f) => f.sequence));
      const next = [...prev];
      for (const frame of incoming) {
        if (seen.has(frame.sequence)) continue;
        seen.add(frame.sequence);
        next.push(frame);
      }
      return next.length > MAX_FRAMES ? next.slice(next.length - MAX_FRAMES) : next;
    };

    void api.getRecent().then((recent) => {
      if (!cancelled) setFrames((prev) => merge(prev, recent));
    });

    const unsubscribe = api.subscribe((frame) => {
      setFrames((prev) => merge(prev, [frame]));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Keep the newest line in view as frames stream in.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [frames]);

  return (
    <div
      className="live-narration-panel w-full h-full flex flex-col bg-overlay-surface"
      data-testid="live-narration-panel"
    >
      <div className="shrink-0 px-3 py-2 border-b border-border text-xs uppercase tracking-wider text-text-dim">
        {t('tracker.narrationTitle')}
      </div>
      <ul
        ref={listRef}
        style={NO_DRAG}
        className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1 text-xs"
      >
        {frames.length === 0 ? (
          <li data-testid="live-narration-empty" className="text-text-mute">
            {t('tracker.narrationEmpty')}
          </li>
        ) : (
          frames.map((frame) => (
            <li
              key={`${frame.sourceEventIndex}-${frame.sequence}`}
              data-testid="live-narration-frame"
              className="flex items-start gap-2 rounded border border-border bg-overlay px-2 py-1"
            >
              <span className="w-8 shrink-0 font-mono text-text-mute">#{frame.sequence}</span>
              <span className="text-text">{frame.text}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

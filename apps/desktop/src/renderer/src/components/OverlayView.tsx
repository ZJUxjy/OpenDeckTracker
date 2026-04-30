import { LiveDeckPanel } from './LiveDeckPanel';

/**
 * Player overlay route. The hosting BrowserWindow is sized to the panel,
 * pinned to the left edge of the Hearthstone window — so the panel fills
 * its window entirely, with no fullscreen-transparent wrapper.
 */
export function OverlayView() {
  return (
    <div className="w-full h-full">
      <LiveDeckPanel compact />
    </div>
  );
}

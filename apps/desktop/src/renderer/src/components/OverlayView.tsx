import { LiveDeckPanel } from './LiveDeckPanel';
import { OpponentCardsPanel } from './OpponentCardsPanel';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';

export function OverlayView() {
  const opponent = useDeckTrackerStore((s) => s.snapshot?.opponent);

  return (
    <div className="flex-1 relative w-full h-full bg-transparent overflow-hidden select-none pointer-events-none">
      <div className="absolute top-10 left-10 h-[calc(100%-5rem)] pointer-events-auto">
        <OpponentCardsPanel
          revealed={opponent?.revealed ?? []}
          graveyard={opponent?.graveyard ?? []}
        />
      </div>
      <div className="absolute top-10 right-10 h-[calc(100%-5rem)] pointer-events-auto">
        <LiveDeckPanel compact />
      </div>
    </div>
  );
}

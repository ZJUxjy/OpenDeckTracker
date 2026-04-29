import { LiveDeckPanel } from './LiveDeckPanel';

export function OverlayView() {
  return (
    <div className="flex-1 relative w-full h-full bg-transparent overflow-hidden select-none pointer-events-none">
      <div className="absolute top-10 left-10 h-[calc(100%-5rem)] pointer-events-auto">
        <LiveDeckPanel compact />
      </div>
    </div>
  );
}

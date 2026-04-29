import { Activity, Clock, Hand, Layers, Radio, Trophy } from 'lucide-react';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useHearthWatcherStore } from '../stores/hearthwatcher-store';
import type { HearthWatcherStatusKind } from '@hdt/hearthwatcher';

function rankLabel(
  standard: {
    legendRank: number;
    starLevel: number;
  } | null | undefined,
): string {
  if (!standard) return 'Unavailable';
  if (standard.legendRank > 0) return `Legend ${standard.legendRank}`;
  if (standard.starLevel > 0) return `Star ${standard.starLevel}`;
  return 'Unranked';
}

const WATCHER_COLORS: Record<HearthWatcherStatusKind, string> = {
  ready: 'text-green',
  'waiting-for-lines': 'text-amber',
  'missing-log': 'text-red',
  'parser-error': 'text-red',
  lag: 'text-amber',
  'rotation-or-truncation': 'text-text-dim',
};

export function Dashboard() {
  const snapshot = useDeckTrackerStore((s) => s.snapshot);
  const { medalInfo } = useHearthMirrorStatus();
  const watcherStatus = useHearthWatcherStore((s) => s.status);
  const deck = snapshot?.deck ?? null;
  const totalOriginal = deck?.original.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const totalRemaining = deck?.remaining.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const phase = snapshot?.phase ?? 'IDLE';

  return (
    <div className="flex-1 bg-bg flex flex-col overflow-y-auto">
      <div className="bg-bg-2 px-8 py-8 border-b border-border">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-accent-dim text-accent text-xs font-bold px-2 py-1 rounded border border-accent/20 uppercase tracking-widest">
                Deck Tracker
              </span>
              <span className="text-text-dim text-sm">Phase: {phase}</span>
            </div>
            <h1 className="text-4xl font-black text-text tracking-tight mb-3">
              {deck ? deck.name || 'Unnamed Deck' : 'No Active Deck'}
            </h1>
            <div className="flex items-center text-text-dim text-sm gap-4">
              <span className="flex items-center">
                <Trophy size={14} className="mr-1 text-amber" />
                Rank: {rankLabel(medalInfo?.standard)}
              </span>
              <span className="flex items-center">
                <Clock size={14} className="mr-1 text-text-dim" />
                {snapshot ? new Date(snapshot.updatedAt).toLocaleTimeString() : 'Waiting for game'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-bg-2 p-5 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-text-dim text-sm font-semibold uppercase tracking-wider">
              Cards Left
            </span>
            <Layers size={18} className="text-accent" />
          </div>
          <div className="text-3xl font-black text-text">
            {totalRemaining}
            <span className="text-base text-text-mute font-semibold"> / {totalOriginal}</span>
          </div>
        </div>

        <div className="bg-bg-2 p-5 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-text-dim text-sm font-semibold uppercase tracking-wider">
              Hand
            </span>
            <Hand size={18} className="text-text-dim" />
          </div>
          <div className="text-3xl font-black text-text">
            {snapshot?.friendlyHand.length ?? 0}
          </div>
        </div>

        <div className="bg-bg-2 p-5 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-text-dim text-sm font-semibold uppercase tracking-wider">
              Status
            </span>
            <Activity size={18} className={deck ? 'text-green' : 'text-text-mute'} />
          </div>
          <div className="text-3xl font-black text-text">
            {deck ? 'Live' : 'Idle'}
          </div>
        </div>

        <div className="bg-bg-2 p-5 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-text-dim text-sm font-semibold uppercase tracking-wider">
              Watcher
            </span>
            <Radio size={18} className={watcherStatus ? WATCHER_COLORS[watcherStatus.kind] ?? 'text-text-mute' : 'text-text-mute'} />
          </div>
          <div className={`text-sm font-bold ${watcherStatus ? WATCHER_COLORS[watcherStatus.kind] ?? 'text-text-mute' : 'text-text-mute'}`}>
            {watcherStatus?.kind ?? 'disconnected'}
          </div>
        </div>
      </div>
    </div>
  );
}

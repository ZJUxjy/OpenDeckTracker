import { Activity, Clock, Hand, Layers, Trophy } from 'lucide-react';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';

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

export function Dashboard() {
  const snapshot = useDeckTrackerStore((s) => s.snapshot);
  const { medalInfo } = useHearthMirrorStatus();
  const deck = snapshot?.deck ?? null;
  const totalOriginal = deck?.original.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const totalRemaining = deck?.remaining.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const phase = snapshot?.phase ?? 'IDLE';

  return (
    <div className="flex-1 bg-[#0E0E14] flex flex-col overflow-y-auto">
      <div className="bg-[#1C1C24] px-8 py-8 border-b border-[#2A2A35]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-orange-500/10 text-orange-400 text-xs font-bold px-2 py-1 rounded border border-orange-500/20 uppercase tracking-widest">
                Deck Tracker
              </span>
              <span className="text-slate-400 text-sm">Phase: {phase}</span>
            </div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-3">
              {deck ? deck.name || 'Unnamed Deck' : 'No Active Deck'}
            </h1>
            <div className="flex items-center text-slate-400 text-sm gap-4">
              <span className="flex items-center">
                <Trophy size={14} className="mr-1 text-yellow-500" />
                Rank: {rankLabel(medalInfo?.standard)}
              </span>
              <span className="flex items-center">
                <Clock size={14} className="mr-1 text-blue-500" />
                {snapshot ? new Date(snapshot.updatedAt).toLocaleTimeString() : 'Waiting for game'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1C1C24] p-5 rounded-xl border border-[#2A2A35]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider">
              Cards Left
            </span>
            <Layers size={18} className="text-orange-400" />
          </div>
          <div className="text-3xl font-black text-white">
            {totalRemaining}
            <span className="text-base text-slate-500 font-semibold"> / {totalOriginal}</span>
          </div>
        </div>

        <div className="bg-[#1C1C24] p-5 rounded-xl border border-[#2A2A35]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider">
              Hand
            </span>
            <Hand size={18} className="text-blue-400" />
          </div>
          <div className="text-3xl font-black text-white">
            {snapshot?.friendlyHand.length ?? 0}
          </div>
        </div>

        <div className="bg-[#1C1C24] p-5 rounded-xl border border-[#2A2A35]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider">
              Status
            </span>
            <Activity size={18} className={deck ? 'text-emerald-400' : 'text-slate-500'} />
          </div>
          <div className="text-3xl font-black text-white">
            {deck ? 'Live' : 'Idle'}
          </div>
        </div>
      </div>
    </div>
  );
}

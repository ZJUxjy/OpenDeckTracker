import type { MatchInfo, MedalInfo } from '@hdt/hearthmirror';

/** Use the same game/format mapping as match history; unknown data stays unknown. */
export function matchPresentation(info: MatchInfo | null | undefined, medals: MedalInfo | null) {
  if (info?.missionId && info.missionId > 0) return { modeKey: 'reliability.mode.adventure', medal: null };
  const format = ({ 1: 'wild', 2: 'standard', 3: 'classic', 4: 'twist' } as const)[info?.formatType ?? 0];
  if (info && (info.gameType === 3 || info.gameType === 4) && format) {
    return { modeKey: `reliability.mode.${format}`, medal: info.gameType === 3 ? medals?.[format] : null };
  }
  return { modeKey: 'reliability.mode.unknown', medal: null };
}

import { describe, expect, it } from 'vitest';
import type { MatchInfo, MedalInfo } from '@hdt/hearthmirror';
import { matchPresentation } from '../src/lib/match-presentation';

const info = { gameType: 3, formatType: 1, missionId: 0 } as MatchInfo;
const medals = { standard: { legendRank: 42 }, wild: { legendRank: 7 } } as MedalInfo;
describe('match mode and rank', () => {
  it('uses the matching ladder and does not invent a standard match', () => {
    expect(matchPresentation(info, medals)).toEqual({ modeKey: 'reliability.mode.wild', medal: medals.wild });
    expect(matchPresentation(null, medals)).toEqual({ modeKey: 'reliability.mode.unknown', medal: null });
    expect(matchPresentation({ ...info, gameType: 999 }, medals).modeKey).toBe('reliability.mode.unknown');
  });
  it('does not attach ranked medals to casual or adventure games', () => {
    expect(matchPresentation({ ...info, gameType: 4 }, medals).medal).toBeNull();
    expect(matchPresentation({ ...info, missionId: 12 }, medals)).toEqual({ modeKey: 'reliability.mode.adventure', medal: null });
  });
});

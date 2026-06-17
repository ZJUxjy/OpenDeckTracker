import { describe, expect, it } from 'vitest';
import { resolvePhaseSignals } from './phase-signals';

const noLog = { matchActive: false, inPlay: false, gameOver: false };

describe('resolvePhaseSignals', () => {
  it('uses mirror signals when present (Windows path)', () => {
    const r = resolvePhaseSignals(
      { hasMatchInfo: true, hasDeckState: true, isGameOver: false, isSpectating: false },
      noLog,
    );
    expect(r).toEqual({ hasMatchInfo: true, hasDeckState: true, isGameOver: false, isSpectating: false });
  });

  it('fills from log signals when mirror is absent (mac path)', () => {
    const r = resolvePhaseSignals(
      { hasMatchInfo: false, hasDeckState: false, isGameOver: false, isSpectating: false },
      { matchActive: true, inPlay: true, gameOver: false },
    );
    expect(r.hasMatchInfo).toBe(true);
    expect(r.hasDeckState).toBe(true);
  });

  it('log.gameOver ORs into isGameOver', () => {
    const r = resolvePhaseSignals(
      { hasMatchInfo: false, hasDeckState: false, isGameOver: false, isSpectating: false },
      { matchActive: false, inPlay: false, gameOver: true },
    );
    expect(r.isGameOver).toBe(true);
  });

  it('never lets log downgrade a true mirror signal', () => {
    const r = resolvePhaseSignals(
      { hasMatchInfo: true, hasDeckState: true, isGameOver: false, isSpectating: false },
      { matchActive: false, inPlay: false, gameOver: false },
    );
    expect(r.hasMatchInfo).toBe(true);
    expect(r.hasDeckState).toBe(true);
  });
});

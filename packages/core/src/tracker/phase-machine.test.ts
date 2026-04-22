import { describe, expect, it } from 'vitest';
import { nextPhase } from './phase-machine';
import type { PhaseSignals } from './phase-machine';

const sig = (overrides: Partial<PhaseSignals> = {}): PhaseSignals => ({
  hasMatchInfo: false,
  hasDeckState: false,
  isGameOver: false,
  isSpectating: false,
  ...overrides,
});

describe('nextPhase', () => {
  it('IDLE → IDLE when no match info', () => {
    expect(nextPhase('IDLE', sig())).toBe('IDLE');
  });

  it('IDLE → PRE_MATCH when match info appears', () => {
    expect(nextPhase('IDLE', sig({ hasMatchInfo: true }))).toBe('PRE_MATCH');
  });

  it('PRE_MATCH → IN_MATCH when deck state appears', () => {
    expect(nextPhase('PRE_MATCH', sig({ hasMatchInfo: true, hasDeckState: true }))).toBe('IN_MATCH');
  });

  it('PRE_MATCH stays put while waiting for deck state', () => {
    expect(nextPhase('PRE_MATCH', sig({ hasMatchInfo: true }))).toBe('PRE_MATCH');
  });

  it('PRE_MATCH → IDLE if match info disappears', () => {
    expect(nextPhase('PRE_MATCH', sig())).toBe('IDLE');
  });

  it('PRE_MATCH → POST_MATCH if isGameOver before deck state (rare reconnect)', () => {
    expect(nextPhase('PRE_MATCH', sig({ hasMatchInfo: true, isGameOver: true }))).toBe('POST_MATCH');
  });

  it('IN_MATCH → POST_MATCH on game over', () => {
    expect(nextPhase('IN_MATCH', sig({ hasMatchInfo: true, isGameOver: true }))).toBe('POST_MATCH');
  });

  it('IN_MATCH → POST_MATCH if matchInfo disappears (concede / quit)', () => {
    expect(nextPhase('IN_MATCH', sig())).toBe('POST_MATCH');
  });

  it('IN_MATCH stays IN_MATCH while playing', () => {
    expect(nextPhase('IN_MATCH', sig({ hasMatchInfo: true, hasDeckState: true }))).toBe('IN_MATCH');
  });

  it('POST_MATCH → IDLE one-shot', () => {
    expect(nextPhase('POST_MATCH', sig({ hasMatchInfo: true }))).toBe('IDLE');
  });

  it('Spectator mode forces IDLE regardless of phase', () => {
    expect(nextPhase('IN_MATCH', sig({ hasMatchInfo: true, isSpectating: true }))).toBe('IDLE');
    expect(nextPhase('PRE_MATCH', sig({ hasMatchInfo: true, isSpectating: true }))).toBe('IDLE');
  });
});

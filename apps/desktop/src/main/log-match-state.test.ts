import { describe, expect, it } from 'vitest';
import { reduceLogMatchState, initialLogMatchState } from './log-match-state';
import type { PowerEvent } from '@hdt/hearthwatcher';

const createGame: PowerEvent = { type: 'create-game', raw: '', content: '' };
const step = (value: string): PowerEvent => ({
  type: 'tag-change', raw: '', content: '', entity: 'GameEntity', tag: 'STEP', value,
});
const state = (value: string): PowerEvent => ({
  type: 'tag-change', raw: '', content: '', entity: 'GameEntity', tag: 'STATE', value,
});

describe('reduceLogMatchState', () => {
  it('create-game resets to inactive', () => {
    const s = reduceLogMatchState({ matchActive: true, inPlay: true, gameOver: true }, createGame, 'live');
    expect(s).toEqual({ matchActive: false, inPlay: false, gameOver: false });
  });

  it('real-match STEP activates match + inPlay', () => {
    const s = reduceLogMatchState(initialLogMatchState(), step('BEGIN_MULLIGAN'), 'live');
    expect(s.matchActive).toBe(true);
    expect(s.inPlay).toBe(true);
  });

  it('ignores STEP on replay events', () => {
    const s = reduceLogMatchState(initialLogMatchState(), step('BEGIN_MULLIGAN'), 'replay');
    expect(s.matchActive).toBe(false);
  });

  it('STATE=COMPLETE ends the match', () => {
    let s = reduceLogMatchState(initialLogMatchState(), step('MAIN_READY'), 'live');
    s = reduceLogMatchState(s, state('COMPLETE'), 'live');
    expect(s).toEqual({ matchActive: false, inPlay: false, gameOver: true });
  });
});

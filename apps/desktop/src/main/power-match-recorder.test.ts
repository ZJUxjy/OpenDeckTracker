import { describe, expect, it, vi } from 'vitest';
import type { DeckTrackerSnapshot, NormalizedCompletedMatch } from '@hdt/core';
import type { PowerEvent } from '@hdt/hearthwatcher';
import { createPowerMatchRecorder } from './power-match-recorder';

const snapshot = (overrides: Partial<DeckTrackerSnapshot> = {}): DeckTrackerSnapshot => ({
  phase: 'IN_MATCH',
  matchInfo: {
    localPlayer: null,
    opposingPlayer: {
      id: 2,
      name: 'Opponent',
      side: 2,
      standardRank: 0,
      standardLegendRank: 0,
      wildRank: 0,
      wildLegendRank: 0,
      classicRank: 0,
      classicLegendRank: 0,
      twistRank: 0,
      twistLegendRank: 0,
      cardbackId: 0,
    },
    missionId: 0,
    gameType: 4,
    formatType: 2,
    rankedSeasonId: 0,
    arenaSeasonId: 0,
    brawlSeasonId: 0,
  },
  deck: {
    id: 42,
    name: 'Recorded Real Deck',
    original: [],
    remaining: [],
    extras: [],
  },
  pendingDeckSelection: null,
  friendlyHand: [],
  opposingHandCount: 0,
  opponent: { revealed: [], graveyard: [] },
  friendlyDeckCount: 0,
  friendlyEffects: [],
  opposingEffects: [],
  boardAttack: { friendly: 0, opposing: 0 },
  boardAttackToFace: { friendly: 0, opposing: 0 },
  error: null,
  updatedAt: 1_000,
  ...overrides,
});

const tagChange = (tag: string, value: string): PowerEvent => ({
  type: 'tag-change',
  raw: '',
  content: '',
  entity: 'GameEntity',
  tag,
  value,
});

describe('power-match-recorder', () => {
  it('records a constructed match when Power.log reports game completion', () => {
    const record = vi.fn<(match: NormalizedCompletedMatch) => void>();
    const recorder = createPowerMatchRecorder({
      getSnapshot: () => snapshot(),
      record,
      now: () => 2_000,
    });

    recorder.handleEvent({ type: 'create-game', raw: '', content: '' });
    recorder.handleEvent(tagChange('STATE', 'COMPLETE'));

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'unknown',
        deckId: 42,
        deckName: 'Recorded Real Deck',
        opponentName: 'Opponent',
        gameType: 4,
        formatType: 2,
        startedAt: 2_000,
        endedAt: 2_000,
        source: 'deck-tracker',
      }),
    );
  });

  it('does not record mission or practice games from Power.log completion', () => {
    const record = vi.fn<(match: NormalizedCompletedMatch) => void>();
    const recorder = createPowerMatchRecorder({
      getSnapshot: () => snapshot({ matchInfo: { ...snapshot().matchInfo!, missionId: 270 } }),
      record,
      now: () => 2_000,
    });

    recorder.handleEvent({ type: 'create-game', raw: '', content: '' });
    recorder.handleEvent(tagChange('STATE', 'COMPLETE'));

    expect(record).not.toHaveBeenCalled();
  });

  it('records a human Power.log match even when HearthMirror match info is unavailable', () => {
    const record = vi.fn<(match: NormalizedCompletedMatch) => void>();
    const recorder = createPowerMatchRecorder({
      getSnapshot: () => snapshot({ matchInfo: null }),
      record,
      now: () => 2_000,
    });

    recorder.handleEvent({ type: 'create-game', raw: '', content: '' });
    recorder.handleEvent({
      type: 'tag-change',
      raw: '',
      content: '',
      entity: '纯金的小铁人#5630',
      tag: 'PLAYSTATE',
      value: 'LOST',
    });
    recorder.handleEvent({
      type: 'tag-change',
      raw: '',
      content: '',
      entity: 'UNKNOWN HUMAN PLAYER',
      tag: 'PLAYSTATE',
      value: 'WON',
    });
    recorder.handleEvent(tagChange('STATE', 'COMPLETE'));

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'loss',
        deckId: 42,
        deckName: 'Recorded Real Deck',
        opponentName: 'UNKNOWN HUMAN PLAYER',
        gameType: 4,
        formatType: 2,
      }),
    );
  });

  it('uses human Power.log classification when HearthMirror reports an unsupported casual classification', () => {
    const record = vi.fn<(match: NormalizedCompletedMatch) => void>();
    const recorder = createPowerMatchRecorder({
      getSnapshot: () => snapshot({ matchInfo: { ...snapshot().matchInfo!, gameType: 1, formatType: 0 } }),
      record,
      now: () => 2_000,
    });

    recorder.handleEvent({ type: 'create-game', raw: '', content: '' });
    recorder.handleEvent({
      type: 'tag-change',
      raw: '',
      content: '',
      entity: '纯金的小铁人#5630',
      tag: 'PLAYSTATE',
      value: 'WON',
    });
    recorder.handleEvent({
      type: 'tag-change',
      raw: '',
      content: '',
      entity: 'UNKNOWN HUMAN PLAYER',
      tag: 'PLAYSTATE',
      value: 'LOST',
    });
    recorder.handleEvent(tagChange('STATE', 'COMPLETE'));

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'win',
        opponentName: 'Opponent',
        gameType: 4,
        formatType: 2,
      }),
    );
  });

  it('uses human Power.log classification when HearthMirror reports a mission id for a human match', () => {
    const record = vi.fn<(match: NormalizedCompletedMatch) => void>();
    const recorder = createPowerMatchRecorder({
      getSnapshot: () => snapshot({ matchInfo: { ...snapshot().matchInfo!, missionId: 270 } }),
      record,
      now: () => 2_000,
    });

    recorder.handleEvent({ type: 'create-game', raw: '', content: '' });
    recorder.handleEvent({
      type: 'tag-change',
      raw: '',
      content: '',
      entity: '纯金的小铁人#5630',
      tag: 'PLAYSTATE',
      value: 'WON',
    });
    recorder.handleEvent({
      type: 'tag-change',
      raw: '',
      content: '',
      entity: 'UNKNOWN HUMAN PLAYER',
      tag: 'PLAYSTATE',
      value: 'LOST',
    });
    recorder.handleEvent(tagChange('STATE', 'COMPLETE'));

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'win',
        gameType: 4,
        formatType: 2,
        missionId: 0,
      }),
    );
  });
});

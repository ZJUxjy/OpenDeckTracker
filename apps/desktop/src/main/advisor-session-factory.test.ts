import { CardDb, type CardDef } from '@hdt/hearthdb';
import { createFauxCore, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { describe, expect, it, vi } from 'vitest';
import type { AdvisorConfig } from '@hdt/advisor';
import type { DeckTrackerSnapshot } from '@hdt/core';

import type { AdvisorModelHandle } from './advisor-model';
import { createAdvisorSession } from './advisor-session-factory';

const cards: CardDef[] = [
  {
    id: 'CS2_029',
    dbfId: 2,
    name: 'Fireball',
    cost: 4,
    text: 'Deal $6 damage.',
    cardClass: 'MAGE',
    rarity: 'FREE',
    set: 'CORE',
    type: 'SPELL',
    collectible: true,
  },
];

function snapshot(): DeckTrackerSnapshot {
  return {
    phase: 'IN_MATCH',
    turn: 1,
    isMulligan: false,
    isLocalTurn: true,
    matchInfo: null,
    matchStartedAt: 0,
    deck: null,
    pendingDeckSelection: null,
    friendlyHand: ['CS2_029'],
    friendlyHandExtras: [],
    opposingHandCount: 0,
    opponent: [],
    opponentClass: null,
    friendlyGraveyard: [],
    extraDisplay: null,
    friendlyDeckCount: 0,
    friendlyEffects: [],
    opposingEffects: [],
    boardAttack: { friendly: 0, opposing: 0 },
    boardAttackToFace: { friendly: 6, opposing: 0 },
    boardMinions: { friendly: [], opposing: [] },
    friendlyHero: { health: 30, armor: 0, effectiveHealth: 30 },
    opposingHero: { health: 6, armor: 0, effectiveHealth: 6 },
    friendlyHeroPower: { cardId: 'HERO_08bp' },
    opposingHeroPower: null,
    friendlyWeapon: null,
    opposingWeapon: null,
    friendlyMana: { available: 4, total: 4 },
    playerClass: null,
    error: null,
    updatedAt: 0,
  } as unknown as DeckTrackerSnapshot;
}

function config(overrides: Partial<AdvisorConfig> = {}): AdvisorConfig {
  return {
    enabled: true,
    autoSuggest: true,
    provider: 'openai',
    model: 'gpt-4o',
    language: 'en',
    apiKeyRef: 'provider:openai',
    ...overrides,
  };
}

function fauxModelHandle(): AdvisorModelHandle {
  const faux = createFauxCore({ tokensPerSecond: 0 });
  return {
    model: faux.getModel(),
    streamFn: faux.streamSimple as AdvisorModelHandle['streamFn'],
  };
}

describe('createAdvisorSession', () => {
  it('returns a session with suggestMulligan, suggestTurn, ask, and abortInFlight', () => {
    const getSnapshot = vi.fn(snapshot);
    const session = createAdvisorSession({
      config: config(),
      modelHandle: fauxModelHandle(),
      getSnapshot,
      cardDb: new CardDb(cards),
    });

    expect(typeof session.suggestMulligan).toBe('function');
    expect(typeof session.suggestTurn).toBe('function');
    expect(typeof session.ask).toBe('function');
    expect(typeof session.abortInFlight).toBe('function');
  });

  it('suggestTurn returns an AdvisorSuggestion from the faux model', async () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    faux.setResponses([
      fauxAssistantMessage(
        JSON.stringify({
          actions: [{ kind: 'endTurn', note: 'Done.' }],
          reasoning: 'No better play.',
          alerts: [],
        }),
      ),
    ]);

    const session = createAdvisorSession({
      config: config(),
      modelHandle: {
        model: faux.getModel(),
        streamFn: faux.streamSimple as AdvisorModelHandle['streamFn'],
      },
      getSnapshot: snapshot,
      cardDb: new CardDb(cards),
    });

    const result = await session.suggestTurn();
    expect(result.actions).toEqual([{ kind: 'endTurn', note: 'Done.' }]);
    expect(result.reasoning).toBe('No better play.');
  });

  it('ask returns a text response from the faux model', async () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    faux.setResponses([fauxAssistantMessage('Face pressure wins next turn.')]);

    const session = createAdvisorSession({
      config: config(),
      modelHandle: {
        model: faux.getModel(),
        streamFn: faux.streamSimple as AdvisorModelHandle['streamFn'],
      },
      getSnapshot: snapshot,
      cardDb: new CardDb(cards),
    });

    const result = await session.ask!('What should I do next?');
    expect(result).toBe('Face pressure wins next turn.');
  });

  it('abortInFlight does not throw when no request is in flight', () => {
    const session = createAdvisorSession({
      config: config(),
      modelHandle: fauxModelHandle(),
      getSnapshot: snapshot,
      cardDb: null,
    });

    expect(() => session.abortInFlight?.()).not.toThrow();
  });

  it('works with null cardDb', async () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    faux.setResponses([
      fauxAssistantMessage(
        JSON.stringify({
          actions: [{ kind: 'hold', note: 'Wait.' }],
          reasoning: 'No cards to play.',
          alerts: [],
        }),
      ),
    ]);

    const session = createAdvisorSession({
      config: config({ language: 'zh' }),
      modelHandle: {
        model: faux.getModel(),
        streamFn: faux.streamSimple as AdvisorModelHandle['streamFn'],
      },
      getSnapshot: snapshot,
      cardDb: null,
    });

    const result = await session.suggestMulligan();
    expect(result.actions).toEqual([{ kind: 'hold', note: 'Wait.' }]);
  });
});

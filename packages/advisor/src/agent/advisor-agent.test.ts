import { CardDb, type CardDef } from '@hdt/hearthdb';
import {
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import { describe, expect, test } from 'vitest';

import type { AdvisorSerializableSnapshot } from './state-serializer';
import {
  createAdvisorAgent,
  createAdvisorAgentRunner,
  parseAdvisorSuggestionJson,
} from './advisor-agent';

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

function snapshot(): AdvisorSerializableSnapshot {
  return {
    phase: 'IN_MATCH',
    turn: 1,
    isMulligan: false,
    friendlyMana: { available: 4, total: 4 },
    friendlyHand: ['CS2_029'],
    opposingHandCount: 0,
    opponentRevealed: [],
    opponentGraveyard: [],
    friendlyGraveyard: [],
    boardAttackToFace: { friendly: 6, opposing: 0 },
    friendlyHero: { health: 30, armor: 0, effectiveHealth: 30 },
    opposingHero: { health: 6, armor: 0, effectiveHealth: 6 },
    friendlyHeroPower: { cardId: 'HERO_08bp' },
    opposingHeroPower: null,
    friendlyWeapon: null,
    opposingWeapon: null,
    boardMinions: { friendly: [], opposing: [] },
    deck: {
      remaining: [{ cardId: 'CS2_029', count: 1 }],
      knownPositions: [],
    },
  };
}

describe('advisor agent', () => {
  test('creates a pi agent with advisor tools registered', () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    const agent = createAdvisorAgent({
      model: faux.getModel(),
      streamFn: faux.streamSimple,
      getSnapshot: snapshot,
      cardLookup: (cardId) => cards.find((card) => card.id === cardId) ?? null,
      cardDb: new CardDb(cards),
      language: 'en',
    });

    expect(agent.state.systemPrompt).toContain('Hearthstone');
    expect(agent.state.tools.map((tool) => tool.name)).toEqual([
      'action_enum',
      'lethal_check',
      'card_lookup',
      'mana_math',
      'deck_odds',
    ]);
  });

  test('parses fenced AdvisorSuggestion JSON', () => {
    expect(
      parseAdvisorSuggestionJson(`\`\`\`json
{"actions":[{"kind":"endTurn","note":"Done."}],"reasoning":"No better play.","alerts":[]}
\`\`\``),
    ).toEqual({
      actions: [{ kind: 'endTurn', note: 'Done.' }],
      reasoning: 'No better play.',
      alerts: [],
    });
  });

  test('retries once when the final assistant output is not valid suggestion JSON', async () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    faux.setResponses([
      fauxAssistantMessage('not json'),
      fauxAssistantMessage(
        JSON.stringify({
          actions: [{ kind: 'play', cardId: 'CS2_029', note: 'Use burn for lethal.' }],
          reasoning: 'The opponent is at six effective health.',
          alerts: [{ type: 'danger', detail: 'Opponent can answer next turn.' }],
        }),
      ),
    ]);

    const runner = createAdvisorAgentRunner({
      model: faux.getModel(),
      streamFn: faux.streamSimple,
      getSnapshot: snapshot,
      cardLookup: (cardId) => cards.find((card) => card.id === cardId) ?? null,
      cardDb: new CardDb(cards),
      language: 'en',
    });

    await expect(runner.runSuggestionPrompt('# State')).resolves.toMatchObject({
      reasoning: 'The opponent is at six effective health.',
      alerts: [{ type: 'danger' }],
    });
    expect(faux.state.callCount).toBe(2);
  });

  test('records tool call order before parsing the final suggestion', async () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('action_enum', {}), { stopReason: 'toolUse' }),
      fauxAssistantMessage(fauxToolCall('lethal_check', {}), { stopReason: 'toolUse' }),
      fauxAssistantMessage(
        JSON.stringify({
          actions: [{ kind: 'play', cardId: 'CS2_029', note: 'Use Fireball.' }],
          reasoning: 'The lethal check confirms exact damage.',
          alerts: [{ type: 'lethal', detail: 'Exact lethal is available.' }],
        }),
      ),
    ]);
    const runner = createAdvisorAgentRunner({
      model: faux.getModel(),
      streamFn: faux.streamSimple,
      getSnapshot: snapshot,
      cardLookup: (cardId) => cards.find((card) => card.id === cardId) ?? null,
      cardDb: new CardDb(cards),
      language: 'en',
    });

    await expect(runner.runSuggestionPrompt('# State')).resolves.toMatchObject({
      alerts: [{ type: 'lethal' }],
    });
    expect(runner.toolCallHistory).toEqual(['action_enum', 'lethal_check']);
  });

  test('rejects lethal alerts that were not verified by lethal_check', async () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('action_enum', {}), { stopReason: 'toolUse' }),
      fauxAssistantMessage(
        JSON.stringify({
          actions: [{ kind: 'play', cardId: 'CS2_029', note: 'Use Fireball.' }],
          reasoning: 'The opponent is low.',
          alerts: [{ type: 'lethal', detail: 'Looks lethal.' }],
        }),
      ),
      fauxAssistantMessage('still not verified'),
    ]);
    const runner = createAdvisorAgentRunner({
      model: faux.getModel(),
      streamFn: faux.streamSimple,
      getSnapshot: snapshot,
      cardLookup: (cardId) => cards.find((card) => card.id === cardId) ?? null,
      cardDb: new CardDb(cards),
      language: 'en',
    });

    await expect(runner.runSuggestionPrompt('# State')).rejects.toThrow('valid AdvisorSuggestion');
  });

  test('tools evaluate the live snapshot, not the state captured at creation', async () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    const live = snapshot();
    const agent = createAdvisorAgent({
      model: faux.getModel(),
      streamFn: faux.streamSimple,
      getSnapshot: () => live,
      cardLookup: (cardId) => cards.find((card) => card.id === cardId) ?? null,
      cardDb: new CardDb(cards),
      language: 'en',
    });

    const lethalTool = agent.state.tools.find((tool) => tool.name === 'lethal_check');
    expect(lethalTool).toBeDefined();

    const before = await lethalTool!.execute('call-1', {});
    expect(before.details).toMatchObject({ hasLethal: true, damage: 6, requiredHealth: 6 });

    // Board state moves on after the agent was created — the next tool
    // call must see the updated state, not the creation-time snapshot.
    live.boardAttackToFace = { friendly: 0, opposing: 0 };

    const after = await lethalTool!.execute('call-2', {});
    expect(after.details).toMatchObject({ hasLethal: false, damage: 0 });
  });

  test('short-circuits tool calls once the per-run tool budget is spent', async () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    const budget = { used: 0 };
    const agent = createAdvisorAgent({
      model: faux.getModel(),
      streamFn: faux.streamSimple,
      getSnapshot: snapshot,
      cardLookup: (cardId) => cards.find((card) => card.id === cardId) ?? null,
      cardDb: new CardDb(cards),
      language: 'en',
      maxToolRounds: 1,
      toolBudget: budget,
    });

    const lethalTool = agent.state.tools.find((tool) => tool.name === 'lethal_check');
    expect(lethalTool).toBeDefined();

    const first = await lethalTool!.execute('call-1', {});
    expect(first.details).toMatchObject({ hasLethal: true, damage: 6 });
    expect(budget.used).toBe(1);

    const blocked = await lethalTool!.execute('call-2', {});
    expect(blocked.details).toMatchObject({ error: expect.stringContaining('Tool round limit') });
    expect(budget.used).toBe(1);
  });

  test('resets the tool budget before each suggestion run', async () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    const budget = { used: 0 };
    let lookedUp = 0;
    const runner = createAdvisorAgentRunner({
      model: faux.getModel(),
      streamFn: faux.streamSimple,
      getSnapshot: snapshot,
      cardLookup: (cardId) => {
        lookedUp += 1;
        return cards.find((card) => card.id === cardId) ?? null;
      },
      cardDb: new CardDb(cards),
      language: 'en',
      maxToolRounds: 1,
      toolBudget: budget,
    });

    const responses = () => [
      fauxAssistantMessage(fauxToolCall('action_enum', {}), { stopReason: 'toolUse' }),
      fauxAssistantMessage(
        JSON.stringify({
          actions: [{ kind: 'endTurn', note: 'Done.' }],
          reasoning: 'No better play.',
          alerts: [],
        }),
      ),
    ];

    faux.setResponses(responses());
    await runner.runSuggestionPrompt('# State');
    const afterFirstRun = lookedUp;
    // The single allowed action_enum call really executed (it resolves
    // hand card names through cardLookup).
    expect(afterFirstRun).toBeGreaterThan(0);

    // Without a per-run reset the second run's action_enum would be
    // short-circuited and cardLookup would see no new calls.
    faux.setResponses(responses());
    await runner.runSuggestionPrompt('# State');
    expect(lookedUp).toBeGreaterThan(afterFirstRun);
  });

  test('streams answer text to onChunk during ask', async () => {
    const faux = createFauxCore({ tokensPerSecond: 0 });
    faux.setResponses([fauxAssistantMessage('Face pressure wins next turn.')]);
    const runner = createAdvisorAgentRunner({
      model: faux.getModel(),
      streamFn: faux.streamSimple,
      getSnapshot: snapshot,
      cardLookup: (cardId) => cards.find((card) => card.id === cardId) ?? null,
      cardDb: new CardDb(cards),
      language: 'en',
    });

    const chunks: string[] = [];
    const answer = await runner.ask('What next?', '# Context', undefined, (chunk) =>
      chunks.push(chunk),
    );

    expect(answer).toBe('Face pressure wins next turn.');
    // Delta-by-delta streaming or one whole-answer chunk for
    // non-streaming providers — either way the text arrives exactly once.
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBe(answer);
  });
});

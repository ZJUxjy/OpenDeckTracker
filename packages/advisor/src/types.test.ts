import { describe, expect, expectTypeOf, test } from 'vitest';

import type {
  AdvisorAlert,
  AdvisorConfig,
  AdvisorLanguage,
  AdvisorProvider,
  AdvisorSuggestion,
  SuggestedAction,
} from './types';

describe('advisor public types', () => {
  test('models structured suggestions with ordered actions and alerts', () => {
    const actionKinds = [
      'play',
      'attack',
      'heroPower',
      'trade',
      'hold',
      'endTurn',
    ] satisfies SuggestedAction['kind'][];

    const suggestion = {
      actions: [
        { kind: 'play', cardId: 'CORE_EX1_169', note: 'Develop the minion first.' },
        {
          kind: 'attack',
          cardId: 'CORE_CS2_231',
          targetCardId: 'CORE_EX1_390',
          note: 'Trade into the taunt before going face.',
        },
        { kind: 'endTurn', note: 'Float one mana to preserve the removal spell.' },
      ],
      reasoning: 'Stabilize the board before pushing damage.',
      alerts: [{ type: 'danger', detail: 'Opponent can threaten lethal next turn.' }],
    } satisfies AdvisorSuggestion;

    const lethalAlert = {
      type: 'lethal',
      detail: 'Board attacks represent exact lethal.',
    } satisfies AdvisorAlert;

    expect(actionKinds).toContain('heroPower');
    expect(suggestion.actions).toHaveLength(3);
    expect(lethalAlert.type).toBe('lethal');
    expectTypeOf(suggestion).toMatchTypeOf<AdvisorSuggestion>();
  });

  test('models provider settings using an api key reference', () => {
    const provider = 'openai-compatible' satisfies AdvisorProvider;
    const language = 'zh' satisfies AdvisorLanguage;
    const config = {
      enabled: true,
      autoSuggest: true,
      provider,
      model: 'gpt-4.1-mini',
      baseURL: 'http://localhost:11434/v1',
      apiKeyRef: 'advisor.openai-compatible.default',
      language,
      maxToolRounds: 6,
    } satisfies AdvisorConfig;

    expect(config.enabled).toBe(true);
    expect(config.apiKeyRef).toContain('advisor.');
    expectTypeOf(config).toMatchTypeOf<AdvisorConfig>();
  });
});

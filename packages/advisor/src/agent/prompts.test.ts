import { describe, expect, test } from 'vitest';

import { buildAdvisorSystemPrompt, buildTurnSuggestionPrompt } from './prompts';

describe('advisor prompts', () => {
  test('builds a Chinese system prompt with tool and JSON requirements', () => {
    const prompt = buildAdvisorSystemPrompt('zh');

    expect(prompt).toContain('炉石传说');
    expect(prompt).toContain('action_enum');
    expect(prompt).toContain('lethal_check');
    expect(prompt).toContain('AdvisorSuggestion');
    expect(prompt).toContain('JSON');
  });

  test('builds a turn prompt around serialized state', () => {
    expect(buildTurnSuggestionPrompt('# State', 'en')).toMatchInlineSnapshot(`
      "Review the current turn state and produce one AdvisorSuggestion JSON object.

      # State"
    `);
  });
});

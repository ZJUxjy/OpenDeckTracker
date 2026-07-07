import { describe, expect, test } from 'vitest';

import { AdvisorSession } from './advisor-session';
import type { AdvisorSuggestionRunner } from './advisor-session';
import type { AdvisorSuggestion } from '../types';

const suggestion: AdvisorSuggestion = {
  actions: [{ kind: 'endTurn', note: 'Pass.' }],
  reasoning: 'No profitable action.',
  alerts: [],
};

describe('advisor session', () => {
  test('builds turn prompts with a rolling window of recent turn summaries', async () => {
    const prompts: string[] = [];
    const runner: AdvisorSuggestionRunner = {
      runSuggestionPrompt: async (prompt) => {
        prompts.push(prompt);
        return suggestion;
      },
    };
    const session = new AdvisorSession({
      runner,
      stateProvider: () => '# Current State',
    });

    session.endTurn('turn 1 summary');
    session.endTurn('turn 2 summary');
    session.endTurn('turn 3 summary');
    session.endTurn('turn 4 summary');
    await session.suggestTurn();

    expect(prompts[0]).toMatchInlineSnapshot(`
      "## Recent Turn Summaries
      - turn 2 summary
      - turn 3 summary
      - turn 4 summary

      ## Request
      Generate the best current-turn AdvisorSuggestion.

      # Current State"
    `);
    expect(session.history).toEqual(['turn 2 summary', 'turn 3 summary', 'turn 4 summary']);
  });

  test('marks mulligan requests explicitly', async () => {
    let prompt = '';
    const runner: AdvisorSuggestionRunner = {
      runSuggestionPrompt: async (nextPrompt) => {
        prompt = nextPrompt;
        return suggestion;
      },
    };
    const session = new AdvisorSession({
      runner,
      stateProvider: () => '# Mulligan State',
    });

    await session.suggestMulligan();

    expect(prompt).toContain('Generate a mulligan AdvisorSuggestion');
    expect(prompt).toContain('# Mulligan State');
  });

  test('routes follow-up questions through the shared session context', async () => {
    let context = '';
    const runner: AdvisorSuggestionRunner = {
      runSuggestionPrompt: async () => suggestion,
      ask: async (_question, nextContext) => {
        context = nextContext;
        return 'Because preserving removal is better.';
      },
    };
    const session = new AdvisorSession({
      runner,
      stateProvider: () => '# Current State',
    });
    session.endTurn('previous plan');

    await expect(session.ask('Why not trade?')).resolves.toBe('Because preserving removal is better.');
    expect(context).toContain('previous plan');
    expect(context).toContain('# Current State');
  });

  test('aborts an in-flight request', async () => {
    let receivedSignal: AbortSignal | undefined;
    const runner: AdvisorSuggestionRunner = {
      runSuggestionPrompt: async (_prompt, signal) =>
        new Promise((_, reject) => {
          receivedSignal = signal;
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      abort: () => undefined,
    };
    const session = new AdvisorSession({
      runner,
      stateProvider: () => '# Current State',
    });

    const pending = session.suggestTurn();
    session.abortInFlight();

    await expect(pending).rejects.toThrow('aborted');
    expect(receivedSignal?.aborted).toBe(true);
  });
});

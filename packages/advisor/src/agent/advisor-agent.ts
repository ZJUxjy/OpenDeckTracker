import {
  Agent,
  type AgentMessage,
  type AgentOptions,
  type AgentTool,
  type AgentToolResult,
  type StreamFn,
} from '@earendil-works/pi-agent-core';
import { Type, type Model } from '@earendil-works/pi-ai';

import { enumerateActions } from '../tools/action-enum-tool';
import { lookupCard, type CardLookupArgs } from '../tools/card-lookup-tool';
import { computeDeckOdds } from '../tools/deck-odds-tool';
import { precheckLethal } from '../tools/lethal-tool';
import { checkManaCombination } from '../tools/mana-math-tool';
import type { AdvisorLanguage, AdvisorSuggestion, SuggestedAction } from '../types';
import type { AdvisorCardLookup, AdvisorSerializableSnapshot } from './state-serializer';
import {
  buildAdvisorSystemPrompt,
  buildJsonRepairPrompt,
  buildTurnSuggestionPrompt,
} from './prompts';

export interface CreateAdvisorAgentArgs {
  model: Model<any>;
  streamFn?: StreamFn;
  /**
   * Lazy accessor for the CURRENT match snapshot. Tools call it at
   * execution time so their answers reflect the live board — a snapshot
   * captured at agent creation goes stale after the first turn.
   */
  getSnapshot: () => AdvisorSerializableSnapshot;
  cardLookup: AdvisorCardLookup;
  cardDb?: CardLookupArgs['cardDb'];
  language?: AdvisorLanguage;
  /**
   * Maximum tool executions allowed per suggestion run. Once the budget is
   * spent, further tool calls short-circuit with an instruction to produce
   * the final answer without more tool use.
   */
  maxToolRounds?: number;
  /**
   * Shared per-run tool-execution counter. `createAdvisorAgentRunner`
   * resets it before every suggestion run; supply your own to observe
   * consumption in tests. Created internally when omitted.
   */
  toolBudget?: { used: number };
}

export function createAdvisorAgent(args: CreateAdvisorAgentArgs): Agent {
  const language = args.language ?? 'en';
  const options: AgentOptions = {
    initialState: {
      model: args.model,
      systemPrompt: buildAdvisorSystemPrompt(language),
      tools: createAdvisorTools(args, args.toolBudget ?? { used: 0 }),
      thinkingLevel: 'low',
    },
    toolExecution: 'sequential',
  };
  if (args.streamFn !== undefined) options.streamFn = args.streamFn;
  return new Agent(options);
}

export class AdvisorAgentRunner {
  private currentToolCallHistory: string[] = [];

  constructor(
    readonly agent: Agent,
    private readonly language: AdvisorLanguage,
    private readonly toolBudget?: { used: number },
  ) {
    this.agent.subscribe((event) => {
      if (event.type === 'tool_execution_start') {
        this.currentToolCallHistory.push(event.toolName);
      }
    });
  }

  get toolCallHistory(): string[] {
    return this.currentToolCallHistory.slice();
  }

  abort(): void {
    this.agent.abort();
  }

  async runSuggestionPrompt(
    serializedState: string,
    signal?: AbortSignal,
  ): Promise<AdvisorSuggestion> {
    this.currentToolCallHistory = [];
    if (this.toolBudget !== undefined) this.toolBudget.used = 0;
    return this.withAbort(signal, async () => {
      await this.agent.prompt(buildTurnSuggestionPrompt(serializedState, this.language));
      throwIfAborted(signal);
      const firstText = latestAssistantText(this.agent.state.messages) ?? '';
      const firstSuggestion = parseAdvisorSuggestionJson(firstText);
      if (firstSuggestion !== null && this.validateToolDiscipline(firstSuggestion) === null) {
        return firstSuggestion;
      }

      await this.agent.prompt(buildJsonRepairPrompt(firstText, this.language));
      throwIfAborted(signal);
      const repairedText = latestAssistantText(this.agent.state.messages) ?? '';
      const repairedSuggestion = parseAdvisorSuggestionJson(repairedText);
      if (repairedSuggestion !== null && this.validateToolDiscipline(repairedSuggestion) === null) {
        return repairedSuggestion;
      }

      throw new Error('Advisor agent did not return valid AdvisorSuggestion JSON');
    });
  }

  async ask(
    question: string,
    context: string,
    signal?: AbortSignal,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    return this.withAbort(signal, async () => {
      let streamed = 0;
      const unsubscribe =
        onChunk === undefined
          ? undefined
          : this.agent.subscribe((event) => {
              if (event.type !== 'message_update') return;
              const assistantEvent = event.assistantMessageEvent;
              if (assistantEvent.type !== 'text_delta') return;
              streamed += assistantEvent.delta.length;
              onChunk(assistantEvent.delta);
            });
      try {
        await this.agent.prompt(
          [
            'Answer this follow-up question using the current session context.',
            `Question: ${question}`,
            '',
            context,
          ].join('\n'),
        );
        throwIfAborted(signal);
        const answer = latestAssistantText(this.agent.state.messages) ?? '';
        // Providers that never stream partial text still surface the answer.
        if (streamed === 0 && answer.length > 0) onChunk?.(answer);
        return answer;
      } finally {
        unsubscribe?.();
      }
    });
  }

  private async withAbort<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
    try {
      throwIfAborted(signal);
    } catch (error) {
      this.agent.abort();
      throw error;
    }
    const abort = (): void => this.agent.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      return await work();
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  private validateToolDiscipline(suggestion: AdvisorSuggestion): string | null {
    const hasLethalAlert = suggestion.alerts.some((alert) => alert.type === 'lethal');
    if (hasLethalAlert && !this.currentToolCallHistory.includes('lethal_check')) {
      return 'lethal alerts require lethal_check';
    }
    return null;
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new Error('Advisor request aborted');
}

export function createAdvisorAgentRunner(args: CreateAdvisorAgentArgs): AdvisorAgentRunner {
  const language = args.language ?? 'en';
  const toolBudget = args.toolBudget ?? { used: 0 };
  const agent = createAdvisorAgent({ ...args, language, toolBudget });
  return new AdvisorAgentRunner(agent, language, toolBudget);
}

function createAdvisorTools(args: CreateAdvisorAgentArgs, budget: { used: number }): AgentTool[] {
  const emptyParameters = Type.Object({});
  /**
   * Per-run tool budget gate. Within the cap the real tool runs; past it the
   * call short-circuits with an instruction to finish the answer, so a
   * runaway tool loop cannot burn tokens indefinitely.
   */
  const withBudget = <T>(run: () => AgentToolResult<T>): AgentToolResult<T> | AgentToolResult<{ error: string }> => {
    const cap = args.maxToolRounds;
    if (cap !== undefined && budget.used >= cap) {
      return toolResult({
        error: `Tool round limit (${cap}) reached for this suggestion. Stop calling tools and produce the final AdvisorSuggestion JSON now.`,
      });
    }
    budget.used += 1;
    return run();
  };
  return [
    {
      name: 'action_enum',
      label: 'Action enumeration',
      description: 'Enumerate candidate actions for the current Hearthstone turn.',
      parameters: emptyParameters,
      execute: async () =>
        withBudget(() =>
          toolResult(enumerateActions({ snapshot: args.getSnapshot(), cardLookup: args.cardLookup })),
        ),
    },
    {
      name: 'lethal_check',
      label: 'Lethal check',
      description: 'Check whether friendly face damage reaches opposing effective health.',
      parameters: emptyParameters,
      execute: async () => withBudget(() => toolResult(precheckLethal(args.getSnapshot()))),
    },
    {
      name: 'card_lookup',
      label: 'Card lookup',
      description: 'Look up full card metadata by card id or name.',
      parameters: Type.Object({
        cardId: Type.Optional(Type.String()),
        name: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) =>
        withBudget(() => {
          if (!args.cardDb) return toolResult(null);
          const lookupParams = params as { cardId?: string; name?: string };
          const lookupArgs: CardLookupArgs = { cardDb: args.cardDb };
          if (lookupParams.cardId !== undefined) lookupArgs.cardId = lookupParams.cardId;
          if (lookupParams.name !== undefined) lookupArgs.name = lookupParams.name;
          return toolResult(lookupCard(lookupArgs));
        }),
    },
    {
      name: 'mana_math',
      label: 'Mana math',
      description: 'Check whether a group of card costs can be paid with available mana.',
      parameters: Type.Object({
        available: Type.Optional(Type.Number()),
        costs: Type.Array(Type.Number()),
      }),
      execute: async (_toolCallId, params) =>
        withBudget(() => {
          const manaParams = params as { available?: number; costs: number[] };
          return toolResult(
            checkManaCombination({
              available: manaParams.available ?? args.getSnapshot().friendlyMana?.available ?? 0,
              costs: manaParams.costs,
            }),
          );
        }),
    },
    {
      name: 'deck_odds',
      label: 'Deck odds',
      description: 'Compute odds to draw at least one target card from remaining deck cards.',
      parameters: Type.Object({
        targetCardIds: Type.Array(Type.String()),
        draws: Type.Number(),
      }),
      execute: async (_toolCallId, params) =>
        withBudget(() => {
          const oddsParams = params as { targetCardIds: string[]; draws: number };
          const snapshot = args.getSnapshot();
          return toolResult(
            computeDeckOdds({
              remaining: snapshot.deck?.remaining ?? [],
              knownPositions: snapshot.deck?.knownPositions ?? [],
              targetCardIds: oddsParams.targetCardIds,
              draws: oddsParams.draws,
            }),
          );
        }),
    },
  ];
}

function toolResult<T>(details: T): AgentToolResult<T> {
  return {
    content: [{ type: 'text', text: JSON.stringify(details) }],
    details,
  };
}

export function parseAdvisorSuggestionJson(text: string): AdvisorSuggestion | null {
  const jsonText = extractJsonText(text);
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return isAdvisorSuggestion(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function isAdvisorSuggestion(value: unknown): value is AdvisorSuggestion {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.actions) || typeof value.reasoning !== 'string' || !Array.isArray(value.alerts)) {
    return false;
  }
  return value.actions.every(isSuggestedAction) && value.alerts.every(isAdvisorAlert);
}

const ACTION_KINDS = new Set<SuggestedAction['kind']>([
  'play',
  'attack',
  'heroPower',
  'trade',
  'hold',
  'endTurn',
]);

function isSuggestedAction(value: unknown): value is SuggestedAction {
  if (!isRecord(value)) return false;
  if (typeof value.kind !== 'string' || !ACTION_KINDS.has(value.kind as SuggestedAction['kind'])) {
    return false;
  }
  if (typeof value.note !== 'string') return false;
  if (value.cardId !== undefined && typeof value.cardId !== 'string') return false;
  if (value.targetCardId !== undefined && typeof value.targetCardId !== 'string') return false;
  return true;
}

function isAdvisorAlert(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (value.type === 'lethal' || value.type === 'danger') && typeof value.detail === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function latestAssistantText(messages: readonly AgentMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== 'assistant') continue;
    return message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }
  return null;
}

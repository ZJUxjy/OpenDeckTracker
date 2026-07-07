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
  snapshot: AdvisorSerializableSnapshot;
  cardLookup: AdvisorCardLookup;
  cardDb?: CardLookupArgs['cardDb'];
  language?: AdvisorLanguage;
}

export function createAdvisorAgent(args: CreateAdvisorAgentArgs): Agent {
  const language = args.language ?? 'en';
  const options: AgentOptions = {
    initialState: {
      model: args.model,
      systemPrompt: buildAdvisorSystemPrompt(language),
      tools: createAdvisorTools(args),
      thinkingLevel: 'low',
    },
    toolExecution: 'sequential',
  };
  if (args.streamFn !== undefined) options.streamFn = args.streamFn;
  return new Agent(options);
}

export class AdvisorAgentRunner {
  constructor(
    readonly agent: Agent,
    private readonly language: AdvisorLanguage,
  ) {}

  async runSuggestionPrompt(serializedState: string): Promise<AdvisorSuggestion> {
    await this.agent.prompt(buildTurnSuggestionPrompt(serializedState, this.language));
    const firstText = latestAssistantText(this.agent.state.messages) ?? '';
    const firstSuggestion = parseAdvisorSuggestionJson(firstText);
    if (firstSuggestion !== null) return firstSuggestion;

    await this.agent.prompt(buildJsonRepairPrompt(firstText, this.language));
    const repairedText = latestAssistantText(this.agent.state.messages) ?? '';
    const repairedSuggestion = parseAdvisorSuggestionJson(repairedText);
    if (repairedSuggestion !== null) return repairedSuggestion;

    throw new Error('Advisor agent did not return valid AdvisorSuggestion JSON');
  }
}

export function createAdvisorAgentRunner(args: CreateAdvisorAgentArgs): AdvisorAgentRunner {
  const language = args.language ?? 'en';
  return new AdvisorAgentRunner(createAdvisorAgent({ ...args, language }), language);
}

function createAdvisorTools(args: CreateAdvisorAgentArgs): AgentTool[] {
  const emptyParameters = Type.Object({});
  return [
    {
      name: 'action_enum',
      label: 'Action enumeration',
      description: 'Enumerate candidate actions for the current Hearthstone turn.',
      parameters: emptyParameters,
      execute: async () =>
        toolResult(enumerateActions({ snapshot: args.snapshot, cardLookup: args.cardLookup })),
    },
    {
      name: 'lethal_check',
      label: 'Lethal check',
      description: 'Check whether friendly face damage reaches opposing effective health.',
      parameters: emptyParameters,
      execute: async () => toolResult(precheckLethal(args.snapshot)),
    },
    {
      name: 'card_lookup',
      label: 'Card lookup',
      description: 'Look up full card metadata by card id or name.',
      parameters: Type.Object({
        cardId: Type.Optional(Type.String()),
        name: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) => {
        if (!args.cardDb) return toolResult(null);
        const lookupParams = params as { cardId?: string; name?: string };
        const lookupArgs: CardLookupArgs = { cardDb: args.cardDb };
        if (lookupParams.cardId !== undefined) lookupArgs.cardId = lookupParams.cardId;
        if (lookupParams.name !== undefined) lookupArgs.name = lookupParams.name;
        return toolResult(lookupCard(lookupArgs));
      },
    },
    {
      name: 'mana_math',
      label: 'Mana math',
      description: 'Check whether a group of card costs can be paid with available mana.',
      parameters: Type.Object({
        available: Type.Optional(Type.Number()),
        costs: Type.Array(Type.Number()),
      }),
      execute: async (_toolCallId, params) => {
        const manaParams = params as { available?: number; costs: number[] };
        return toolResult(
          checkManaCombination({
            available: manaParams.available ?? args.snapshot.friendlyMana?.available ?? 0,
            costs: manaParams.costs,
          }),
        );
      },
    },
    {
      name: 'deck_odds',
      label: 'Deck odds',
      description: 'Compute odds to draw at least one target card from remaining deck cards.',
      parameters: Type.Object({
        targetCardIds: Type.Array(Type.String()),
        draws: Type.Number(),
      }),
      execute: async (_toolCallId, params) => {
        const oddsParams = params as { targetCardIds: string[]; draws: number };
        return toolResult(
          computeDeckOdds({
            remaining: args.snapshot.deck?.remaining ?? [],
            knownPositions: args.snapshot.deck?.knownPositions ?? [],
            targetCardIds: oddsParams.targetCardIds,
            draws: oddsParams.draws,
          }),
        );
      },
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

import type { CardDef, CardDb } from '@hdt/hearthdb';
import {
  type AdvisorConfig,
  type AdvisorSerializableSnapshot,
  type AdvisorSuggestion,
  AdvisorSession,
  createAdvisorAgentRunner,
  serializeAdvisorState,
} from '@hdt/advisor';
import type { DeckTrackerSnapshot } from '@hdt/core';

import type { AdvisorModelHandle } from './advisor-model';
import type { AdvisorSessionLike } from './advisor';

export interface CreateAdvisorSessionArgs {
  config: AdvisorConfig;
  modelHandle: AdvisorModelHandle;
  getSnapshot: () => DeckTrackerSnapshot;
  cardDb: CardDb | null;
}

/**
 * Factory that wires together the advisor pipeline:
 *
 * 1. **State serializer** — reads the latest tracker snapshot via
 *    `getSnapshot()`, resolves card metadata from `cardDb`, and produces
 *    the compact markdown state text the agent consumes.
 * 2. **Advisor agent runner** — wraps a pi-agent-core `Agent` with the
 *    five advisor tools, JSON repair retry, and tool-discipline validation.
 * 3. **Advisor session** — orchestrates `suggestMulligan` / `suggestTurn`
 *    / `ask` with abort support and a rolling history window.
 *
 * The returned object satisfies `AdvisorSessionLike` so `startAdvisor`
 * can consume it directly.
 */
export function createAdvisorSession(args: CreateAdvisorSessionArgs): AdvisorSessionLike {
  const language = args.config.language;
  const cardLookup = (cardId: string): CardDef | null =>
    args.cardDb?.findById(cardId) ?? null;

  const buildSerializable = (snapshot: DeckTrackerSnapshot): AdvisorSerializableSnapshot => ({
    phase: snapshot.phase,
    turn: snapshot.turn ?? null,
    isMulligan: snapshot.isMulligan === true,
    friendlyMana: snapshot.friendlyMana ?? null,
    friendlyHand: snapshot.friendlyHand,
    opposingHandCount: snapshot.opposingHandCount ?? 0,
    boardAttackToFace: snapshot.boardAttackToFace,
    friendlyHero: snapshot.friendlyHero ?? null,
    opposingHero: snapshot.opposingHero ?? null,
    friendlyHeroPower: snapshot.friendlyHeroPower ?? null,
    opposingHeroPower: snapshot.opposingHeroPower ?? null,
    friendlyWeapon: snapshot.friendlyWeapon ?? null,
    opposingWeapon: snapshot.opposingWeapon ?? null,
    boardMinions: snapshot.boardMinions ?? { friendly: [], opposing: [] },
    deck: snapshot.deck
      ? {
          remaining: snapshot.deck.remaining,
          knownPositions: snapshot.deck.knownPositions,
        }
      : null,
    opponentRevealed: snapshot.opponent?.revealed ?? [],
    opponentGraveyard: snapshot.opponent?.graveyard ?? [],
    friendlyGraveyard: snapshot.friendlyGraveyard ?? [],
  });

  const currentSerializable = (): AdvisorSerializableSnapshot =>
    buildSerializable(args.getSnapshot());

  const stateProvider = (): string =>
    serializeAdvisorState({
      snapshot: currentSerializable(),
      cardLookup,
    });

  const runnerArgs: Parameters<typeof createAdvisorAgentRunner>[0] = {
    model: args.modelHandle.model,
    streamFn: args.modelHandle.streamFn,
    // Lazy: tools (action_enum / lethal_check / deck_odds / mana_math)
    // must evaluate the board at call time, not the state from when this
    // session was created.
    getSnapshot: currentSerializable,
    cardLookup,
    language,
  };
  if (args.cardDb) runnerArgs.cardDb = args.cardDb;
  if (args.config.maxToolRounds !== undefined) {
    runnerArgs.maxToolRounds = args.config.maxToolRounds;
  }

  const runner = createAdvisorAgentRunner(runnerArgs);

  const session = new AdvisorSession({
    runner: {
      runSuggestionPrompt: (prompt, signal) => runner.runSuggestionPrompt(prompt, signal),
      ask: (question, context, signal, onChunk) => runner.ask(question, context, signal, onChunk),
      abort: () => runner.abort(),
    },
    stateProvider,
  });

  return {
    suggestMulligan: (): Promise<AdvisorSuggestion> => session.suggestMulligan(),
    suggestTurn: (): Promise<AdvisorSuggestion> => session.suggestTurn(),
    ask: (question: string, onChunk?: (chunk: string) => void): Promise<string> =>
      session.ask(question, onChunk),
    abortInFlight: () => session.abortInFlight(),
  };
}

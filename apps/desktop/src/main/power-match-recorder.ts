import {
  isConstructedMatch,
  normalizeCompletedMatch,
  type MatchResult,
  type DeckTrackerSnapshot,
  type NormalizedCompletedMatch,
} from '@hdt/core';
import type { PowerEvent } from '@hdt/hearthwatcher';

export interface PowerMatchRecorder {
  handleEvent(event: PowerEvent): void;
}

export function createPowerMatchRecorder(args: {
  getSnapshot: () => DeckTrackerSnapshot | null;
  record: (match: NormalizedCompletedMatch) => void;
  now?: () => number;
}): PowerMatchRecorder {
  const now = args.now ?? Date.now;
  let startedAt: number | null = null;
  let recordedCurrentGame = false;
  let playstates = new Map<string, string>();

  return {
    handleEvent(event: PowerEvent): void {
      if (event.type === 'create-game') {
        startedAt = now();
        recordedCurrentGame = false;
        playstates = new Map();
        return;
      }

      if (isPlayerPlaystate(event)) {
        playstates.set(String(event.entity), String(event.value));
        return;
      }

      if (!isPowerGameComplete(event) || recordedCurrentGame) return;

      const snapshot = args.getSnapshot();
      if (snapshot === null) {
        logSkip('missing deck tracker snapshot', playstates);
        return;
      }
      const matchInfo = snapshot.matchInfo;
      const powerClassification = inferHumanConstructedMatch(playstates);
      const classification =
        powerClassification ??
        (matchInfo !== null && isConstructedMatch(matchInfo) ? matchInfo : null);
      if (classification === null) {
        logSkip('missing match info and no human Power.log opponent', playstates);
        return;
      }
      if (
        powerClassification === null &&
        matchInfo?.missionId !== undefined &&
        matchInfo.missionId > 0
      ) {
        logSkip('mission or practice match classification', playstates);
        return;
      }
      if (!isConstructedMatch(classification)) {
        logSkip('unsupported match classification', playstates);
        return;
      }

      const inferred = inferPowerResult(playstates);

      const endedAt = now();
      args.record(
        normalizeCompletedMatch({
          fingerprint: '',
          startedAt: startedAt ?? snapshot.updatedAt,
          endedAt,
          result: inferred.result,
          playOrder: 'unknown',
          deckId: snapshot.deck?.id ?? null,
          deckName: snapshot.deck?.name ?? null,
          opponentName: matchInfo?.opposingPlayer?.name ?? inferred.opponentName,
          opponentClass: snapshot.opponentClass ?? null,
          playerClass: snapshot.playerClass ?? null,
          ...(snapshot.savedDeckId !== undefined && snapshot.savedDeckVersion !== undefined
            ? {
                savedDeckId: snapshot.savedDeckId,
                savedDeckVersion: snapshot.savedDeckVersion,
              }
            : {}),
          gameType: classification.gameType,
          formatType: classification.formatType,
          missionId: classification.missionId,
          source: 'deck-tracker',
        }),
      );
      recordedCurrentGame = true;
    },
  };
}

function isPlayerPlaystate(event: PowerEvent): event is Extract<PowerEvent, { type: 'tag-change' }> {
  return event.type === 'tag-change' && event.tag === 'PLAYSTATE' && event.entity !== 'GameEntity';
}

function isPowerGameComplete(event: PowerEvent): boolean {
  return (
    event.type === 'tag-change' &&
    event.entity === 'GameEntity' &&
    ((event.tag === 'STATE' && event.value === 'COMPLETE') ||
      (event.tag === 'STEP' && event.value === 'FINAL_GAMEOVER'))
  );
}

function inferHumanConstructedMatch(
  playstates: Map<string, string>,
): { gameType: number; formatType: number; missionId: number } | null {
  if (![...playstates.keys()].some((entity) => isUnknownHumanPlayer(entity))) return null;
  if ([...playstates.keys()].some((entity) => isInnkeeper(entity))) return null;
  return { gameType: 4, formatType: 2, missionId: 0 };
}

function inferPowerResult(playstates: Map<string, string>): {
  result: MatchResult;
  opponentName: string | null;
} {
  const local = [...playstates.entries()].find(([entity]) => isLikelyLocalPlayer(entity));
  const opponent = [...playstates.keys()].find((entity) => !isLikelyLocalPlayer(entity));
  if (local?.[1] === 'WON') return { result: 'win', opponentName: opponent ?? null };
  if (local?.[1] === 'LOST' || local?.[1] === 'CONCEDED') {
    return { result: 'loss', opponentName: opponent ?? null };
  }
  return { result: 'unknown', opponentName: opponent ?? null };
}

function isLikelyLocalPlayer(entity: string): boolean {
  return !isUnknownHumanPlayer(entity) && !isInnkeeper(entity);
}

function isUnknownHumanPlayer(entity: string): boolean {
  return entity.toUpperCase() === 'UNKNOWN HUMAN PLAYER';
}

function isInnkeeper(entity: string): boolean {
  return entity === '旅店老板' || entity.toLowerCase() === 'the innkeeper';
}

function logSkip(reason: string, playstates: Map<string, string>): void {
  console.warn('[power-match-recorder] skipped completed Power.log match', {
    reason,
    playstates: Object.fromEntries(playstates),
  });
}

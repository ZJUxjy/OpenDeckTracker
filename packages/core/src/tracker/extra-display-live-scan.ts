import { isDisguised } from './disguise';
import {
  BLOODSPORT_HAND_CARD_IDS,
  BLOODSPORT_MINIONS_IN_HAND_KEY,
  IMP_FORMANT_CARD_ID,
  IMP_FORMANTS_IN_OPPONENT_DECK_KEY,
} from './extra-display-ids';
import type {
  DisguisedBoardEntry,
  ExtraDisplayCardLookup,
  ExtraDisplayPoolEntry,
} from './extra-display-state';

export interface LiveEntityView {
  entityId: number;
  cardId: string;
  zone: string;
  controllerId: number;
}

export interface LiveExtraDisplayScan {
  counters: Record<string, number>;
  pools: Record<string, ExtraDisplayPoolEntry[]>;
  disguisedBoard: DisguisedBoardEntry[];
}

/**
 * Rebuilds "currently in this zone" extra-display facts from the live entity
 * map so shuffle / controller flips cannot drift from incremental zone logs.
 */
export function scanLiveExtraDisplay(args: {
  entities: Iterable<LiveEntityView>;
  localControllerId: number;
  cardLookup: ExtraDisplayCardLookup | null;
}): LiveExtraDisplayScan {
  const disguisedBoard: DisguisedBoardEntry[] = [];
  const bloodsport: ExtraDisplayPoolEntry[] = [];
  const bloodsportCounts = new Map<string, number>();
  let opponentImpFormants = 0;

  for (const entity of args.entities) {
    if (entity.cardId === '') continue;
    const isFriendly = entity.controllerId === args.localControllerId;
    if (entity.zone === 'DECK' && !isFriendly && entity.cardId === IMP_FORMANT_CARD_ID) {
      opponentImpFormants += 1;
    }
    if (entity.zone === 'HAND' && isFriendly && BLOODSPORT_HAND_CARD_IDS.has(entity.cardId)) {
      bloodsportCounts.set(entity.cardId, (bloodsportCounts.get(entity.cardId) ?? 0) + 1);
    }
    if (entity.zone === 'PLAY' && isDisguised(args.cardLookup?.(entity.cardId))) {
      disguisedBoard.push({
        entityId: entity.entityId,
        cardId: entity.cardId,
        side: isFriendly ? 'friendly' : 'opponent',
      });
    }
  }

  for (const [cardId, count] of [...bloodsportCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    bloodsport.push({ cardId, count });
  }
  disguisedBoard.sort((a, b) => a.entityId - b.entityId);

  const counters: Record<string, number> = {
    [BLOODSPORT_MINIONS_IN_HAND_KEY]: bloodsport.reduce((sum, entry) => sum + entry.count, 0),
    [IMP_FORMANTS_IN_OPPONENT_DECK_KEY]: opponentImpFormants,
  };
  const pools: Record<string, ExtraDisplayPoolEntry[]> = {
    [BLOODSPORT_MINIONS_IN_HAND_KEY]: bloodsport,
  };
  if (opponentImpFormants > 0) {
    pools[IMP_FORMANTS_IN_OPPONENT_DECK_KEY] = [
      { cardId: IMP_FORMANT_CARD_ID, count: opponentImpFormants },
    ];
  }

  return { counters, pools, disguisedBoard };
}

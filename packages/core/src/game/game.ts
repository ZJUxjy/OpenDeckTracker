import { Entity } from './entity';
import { Player } from './player';
import type { MatchPhase, Zone } from './types';

export interface GameInit {
  /** Optional pre-existing match id (undefined for fresh games). */
  id?: string;
  gameType?: number;
  formatType?: number;
  missionId?: number;
}

/**
 * Central state container for one Hearthstone match (or pre-match
 * idle state). Owns the `entities` map and exposes both players'
 * zone projections derived from it.
 *
 * Mutation pattern (per design D2): consumers (the poller in M2,
 * the log feeder in M3) directly mutate `entities` and call
 * `transitionTo` for phase changes. No immer / no Immutable.js.
 */
export class Game {
  public id: string | null;
  public phase: MatchPhase;
  public localPlayer: Player;
  public opposingPlayer: Player;
  public readonly entities: Map<number, Entity>;
  public gameType: number;
  public formatType: number;
  public missionId: number;
  public startedAt: number | null;
  public endedAt: number | null;

  constructor(init: GameInit = {}) {
    this.id = init.id ?? null;
    this.phase = 'IDLE';
    this.entities = new Map();
    this.gameType = init.gameType ?? 0;
    this.formatType = init.formatType ?? 0;
    this.missionId = init.missionId ?? 0;
    this.startedAt = null;
    this.endedAt = null;

    // Default placeholder players. The tracker re-creates them with
    // proper controllerIds when match metadata becomes available.
    this.localPlayer = new Player({ controllerId: 1, isLocal: true });
    this.opposingPlayer = new Player({ controllerId: 2, isLocal: false });
    this.localPlayer._bindEntities(this.entities);
    this.opposingPlayer._bindEntities(this.entities);
  }

  /**
   * Switch to a new phase. Sets `startedAt` on entry to PRE_MATCH and
   * `endedAt` on entry to POST_MATCH; these are read by the renderer
   * to show match duration.
   *
   * Phase transitions are NOT validated here (poller can jump from
   * IDLE→IN_MATCH if it boots into an active match); see
   * `phase-machine.ts` for transition rules.
   */
  transitionTo(next: MatchPhase, now: number = Date.now()): void {
    if (this.phase === next) return;
    if (next === 'PRE_MATCH' || (next === 'IN_MATCH' && this.startedAt === null)) {
      this.startedAt = now;
    }
    if (next === 'POST_MATCH') {
      this.endedAt = now;
    }
    this.phase = next;
  }

  /**
   * Replace the players' identity (controllerId + isLocal + name) when
   * match metadata reveals new info. Re-binds the entities map for
   * each player. Existing originalDeck is reset (new match).
   */
  setPlayers(args: {
    localControllerId: number;
    localName?: string;
    opposingControllerId: number;
    opposingName?: string;
  }): void {
    this.localPlayer = new Player({
      controllerId: args.localControllerId,
      isLocal: true,
      name: args.localName ?? '',
    });
    this.opposingPlayer = new Player({
      controllerId: args.opposingControllerId,
      isLocal: false,
      name: args.opposingName ?? '',
    });
    this.localPlayer._bindEntities(this.entities);
    this.opposingPlayer._bindEntities(this.entities);
  }

  /**
   * Reset all per-match state (entities, players, deck, phase, timers)
   * back to IDLE. Called by the tracker on POST_MATCH→IDLE.
   */
  reset(): void {
    this.entities.clear();
    this.localPlayer = new Player({ controllerId: 1, isLocal: true });
    this.opposingPlayer = new Player({ controllerId: 2, isLocal: false });
    this.localPlayer._bindEntities(this.entities);
    this.opposingPlayer._bindEntities(this.entities);
    this.phase = 'IDLE';
    this.startedAt = null;
    this.endedAt = null;
    this.gameType = 0;
    this.formatType = 0;
    this.missionId = 0;
    this.id = null;
  }

  /**
   * Reconcile the entities map against a fresh poll snapshot.
   *
   * Strategy (M2): trust visible zones from the snapshot, but keep
   * revealed entities that disappear from the snapshot as GRAVEYARD.
   * Memory polling does not currently read the graveyard directly; if
   * a played minion/spell falls out of HAND/PLAY/SECRET, deleting it
   * would make the remaining-deck algorithm think the card returned to
   * the library.
   *
   * In M3 with log events, this strategy will change to "additive only"
   * (events tell us each transition; we never bulk-replace).
   */
  applyEntitySnapshot(
    entities: Iterable<{ entityId: number; cardId: string; zone: Zone; controllerId: number }>,
  ): void {
    const seen = new Set<number>();
    for (const e of entities) {
      seen.add(e.entityId);
      const existing = this.entities.get(e.entityId);
      if (existing) {
        existing.zone = e.zone;
        // Don't downgrade a known cardId to empty (face-down →
        // face-up is one-way for our purposes).
        if (e.cardId !== '') {
          existing.cardId = e.cardId;
        }
        existing.controllerId = e.controllerId;
      } else {
        this.entities.set(
          e.entityId,
          new Entity({
            entityId: e.entityId,
            cardId: e.cardId,
            zone: e.zone,
            controllerId: e.controllerId,
          }),
        );
      }
    }
    // Entities that fall out of the reflected HAND/PLAY/SECRET snapshot
    // have usually been consumed or destroyed. Keep them in GRAVEYARD so
    // they still count as seen and do not reappear in the remaining deck.
    for (const [id, entity] of this.entities) {
      if (!seen.has(id)) {
        if (entity.isRevealed && !entity.isInDeck) {
          entity.zone = 'GRAVEYARD';
        } else {
          this.entities.delete(id);
        }
      }
    }
  }
}

import type {
  BoardState,
  DeckState,
  HandState,
  HearthMirror,
  IsMulligan,
  MatchInfo,
} from '@hdt/hearthmirror';
import { Game } from '../game/game';
import type { MatchPhase } from '../game/types';
import { zoneFromNumber } from '../game/types';
import {
  ChainedDeckIdentifier,
  InGameDeckIdentifier,
  type IDeckIdentifier,
  type IdentifiedDeck,
} from './deck-identifier';
import { computeRemaining, gatherSeenEntities } from './remaining-algorithm';
import { nextPhase } from './phase-machine';
import { PollingLoop } from './polling-loop';

// ── Polling intervals (per design D6) ────────────────────────────────
const INTERVAL_IDLE_MS = 2_000;
const INTERVAL_PRE_MATCH_MS = 500;
const INTERVAL_IN_MATCH_MS = 500;
/** Adaptive catch-up — fired right after observing a hand-size delta. */
const INTERVAL_IMMEDIATE_MS = 0;

/** Snapshot pushed over IPC + reflected in the renderer Zustand store. */
export interface DeckTrackerSnapshot {
  phase: MatchPhase;
  /** Match metadata (game/format/mission/players) — null in IDLE. */
  matchInfo: MatchInfo | null;
  /** Identified deck (name + 30-card original list) — null until identified. */
  deck: {
    id: number;
    name: string;
    /** Each entry: { cardId, count } for the 15-30 unique cards in the deck. */
    original: { cardId: string; count: number }[];
    /** Cards still in the player's library. */
    remaining: { cardId: string; count: number }[];
    /** Cards in seen-but-not-original (created/stolen approximate). */
    extras: { cardId: string; count: number }[];
  } | null;
  /** Friendly hand cardIds (for highlight + "drawn this turn" UI). */
  friendlyHand: string[];
  /** Opposing hand size (count only — info-leak guard). */
  opposingHandCount: number;
  /** Friendly remaining deck count (for header summary). */
  friendlyDeckCount: number;
  /** Last error from the poll loop (null when healthy). */
  error: string | null;
  /** Wall-clock timestamp of the last successful poll. */
  updatedAt: number;
}

export interface DeckTrackerEvent {
  type: 'state-change' | 'match-started' | 'match-ended' | 'error' | 'needs-deck-selection';
  snapshot: DeckTrackerSnapshot;
  error?: string;
  /** For 'needs-deck-selection': the available decks the renderer should display. */
  decks?: { id: number; name: string; hero: string }[];
}

export type DeckTrackerEventName = DeckTrackerEvent['type'];
type Handler = (event: DeckTrackerEvent) => void;

/**
 * Per-match state machine driver. Polls `HearthMirror`, mutates a
 * `Game` instance, computes the renderer-visible snapshot, emits
 * typed events.
 *
 * Lifecycle: `start()` → loop ticks until `stop()`. The loop adapts
 * its rate to the current phase; in-match ticks also fire an immediate
 * catch-up tick when a hand-size change is observed.
 */
export class DeckTracker {
  private readonly mirror: HearthMirror;
  private readonly identifier: IDeckIdentifier;
  private readonly loop: PollingLoop;
  private readonly handlers = new Map<DeckTrackerEventName, Set<Handler>>();
  private game: Game;
  private currentSnapshot: DeckTrackerSnapshot;
  private previousFriendlyHandSize = 0;
  /**
   * Set when the orchestrator has emitted `needs-deck-selection` and is
   * waiting for the renderer to call `setOriginalDeck`. Avoids re-emitting
   * the prompt on every poll.
   */
  private awaitingDeckSelection = false;

  constructor(args: {
    mirror: HearthMirror;
    identifier?: IDeckIdentifier;
  }) {
    this.mirror = args.mirror;
    this.identifier = args.identifier ?? new ChainedDeckIdentifier([new InGameDeckIdentifier(args.mirror)]);
    this.loop = new PollingLoop();
    this.game = new Game();
    this.currentSnapshot = blankSnapshot();
  }

  /** Read-only access to the latest snapshot (for IPC `get-snapshot` requests). */
  getSnapshot(): DeckTrackerSnapshot {
    return this.currentSnapshot;
  }

  start(): void {
    if (this.loop.isRunning()) return;
    this.loop.start(
      INTERVAL_IDLE_MS,
      () => this.tick(),
      (err) => this.onError(err),
    );
  }

  stop(): void {
    this.loop.stop();
  }

  on(event: DeckTrackerEventName, handler: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  /**
   * Renderer-side dialog response. Sets the originalDeck on the local
   * player + clears the awaiting flag + emits a fresh snapshot.
   */
  setOriginalDeck(identified: IdentifiedDeck): void {
    this.game.localPlayer.originalDeck = identified.originalDeck;
    this.awaitingDeckSelection = false;
    this.currentSnapshot = this.buildSnapshot();
    this.emit({ type: 'state-change', snapshot: this.currentSnapshot });
  }

  // ── Internal poll tick ─────────────────────────────────────────────

  private async tick(): Promise<void> {
    const previousPhase = this.game.phase;

    const matchInfo = await this.mirror.getMatchInfo();
    const isSpectating = await this.mirror.isSpectating();
    const isGameOverFlag = await this.mirror.isGameOver();

    let deckState: DeckState | null = null;
    let handState: HandState | null = null;
    let boardState: BoardState | null = null;
    let isMulliganResult: IsMulligan = { mulligan: null };

    // Heavy reflectors only when at least PRE_MATCH (saves IPC in IDLE).
    const heavyPhases = ['PRE_MATCH', 'IN_MATCH'];
    if (matchInfo !== null && (heavyPhases.includes(previousPhase) || previousPhase === 'IDLE')) {
      [deckState, handState, boardState, isMulliganResult] = await Promise.all([
        this.mirror.getDeckState(),
        this.mirror.getHandState(),
        this.mirror.getBoardState(),
        this.mirror.isMulligan(),
      ]);
    }

    const target = nextPhase(previousPhase, {
      hasMatchInfo: matchInfo !== null,
      hasDeckState: deckState !== null,
      isGameOver: isGameOverFlag,
      isSpectating,
    });

    // Lifecycle transitions.
    if (previousPhase === 'IDLE' && target === 'PRE_MATCH') {
      this.game.reset();
      this.game.transitionTo('PRE_MATCH');
      this.applyMatchInfo(matchInfo);
    }
    if (target === 'IN_MATCH' && previousPhase !== 'IN_MATCH') {
      this.game.transitionTo('IN_MATCH');
      // First-time entry: try to identify the deck.
      if (this.game.localPlayer.originalDeck === null && !this.awaitingDeckSelection) {
        await this.identifyDeck(matchInfo);
      }
    }
    if (target === 'POST_MATCH' && previousPhase !== 'POST_MATCH') {
      this.game.transitionTo('POST_MATCH');
    }
    if (previousPhase === 'POST_MATCH' && target === 'IDLE') {
      this.game.reset();
      this.previousFriendlyHandSize = 0;
      this.awaitingDeckSelection = false;
    }
    this.game.phase = target;

    // Apply entities from snapshots.
    if (target === 'IN_MATCH' || target === 'PRE_MATCH') {
      this.applyEntitySnapshots({ matchInfo, deckState, handState, boardState });
    }

    // Adapt loop rate to phase.
    this.loop.setInterval(this.intervalFor(target));

    // Build + emit snapshot.
    this.currentSnapshot = this.buildSnapshot({
      matchInfo,
      handState,
      deckState,
      isMulligan: isMulliganResult,
    });

    if (previousPhase === 'IDLE' && target !== 'IDLE') {
      this.emit({ type: 'match-started', snapshot: this.currentSnapshot });
    }
    if (previousPhase === 'IN_MATCH' && target === 'POST_MATCH') {
      this.emit({ type: 'match-ended', snapshot: this.currentSnapshot });
    }
    this.emit({ type: 'state-change', snapshot: this.currentSnapshot });

    // Adaptive catch-up: if the hand grew since last poll, schedule
    // an immediate next tick so the panel reflects the draw quickly.
    if (target === 'IN_MATCH' && handState !== null) {
      const handSize = handState.friendlyHand.length;
      if (handSize > this.previousFriendlyHandSize) {
        this.loop.setInterval(INTERVAL_IMMEDIATE_MS);
        this.loop.requestImmediate();
      }
      this.previousFriendlyHandSize = handSize;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private intervalFor(phase: MatchPhase): number {
    switch (phase) {
      case 'IDLE':
        return INTERVAL_IDLE_MS;
      case 'PRE_MATCH':
        return INTERVAL_PRE_MATCH_MS;
      case 'IN_MATCH':
        return INTERVAL_IN_MATCH_MS;
      case 'POST_MATCH':
        return INTERVAL_IDLE_MS;
    }
  }

  private applyMatchInfo(info: MatchInfo | null): void {
    if (info === null) return;
    this.game.gameType = info.gameType;
    this.game.formatType = info.formatType;
    this.game.missionId = info.missionId;
    if (info.localPlayer || info.opposingPlayer) {
      this.game.setPlayers({
        localControllerId: info.localPlayer?.id ?? 1,
        localName: info.localPlayer?.name ?? '',
        opposingControllerId: info.opposingPlayer?.id ?? 2,
        opposingName: info.opposingPlayer?.name ?? '',
      });
    }
  }

  private applyEntitySnapshots(args: {
    matchInfo: MatchInfo | null;
    deckState: DeckState | null;
    handState: HandState | null;
    boardState: BoardState | null;
  }): void {
    const local = this.game.localPlayer.controllerId;
    const opposing = this.game.opposingPlayer.controllerId;
    const entries: { entityId: number; cardId: string; zone: 'HAND' | 'PLAY' | 'DECK' | 'SECRET'; controllerId: number }[] = [];

    args.handState?.friendlyHand.forEach((c) => {
      entries.push({ entityId: c.entityId, cardId: c.cardId, zone: 'HAND', controllerId: local });
    });
    args.boardState?.friendly.forEach((b) => {
      entries.push({ entityId: b.entityId, cardId: b.cardId, zone: 'PLAY', controllerId: local });
    });
    args.boardState?.opposing.forEach((b) => {
      entries.push({ entityId: b.entityId, cardId: b.cardId, zone: 'PLAY', controllerId: opposing });
    });
    args.deckState?.friendlyDeck.forEach((d) => {
      entries.push({ entityId: d.entityId, cardId: d.cardId, zone: 'DECK', controllerId: local });
    });

    // Convert string-zone entries to the Game.applyEntitySnapshot shape.
    this.game.applyEntitySnapshot(
      entries.map((e) => ({
        entityId: e.entityId,
        cardId: e.cardId,
        zone: zoneFromNumber(zoneToNumber(e.zone)),
        controllerId: e.controllerId,
      })),
    );
  }

  private async identifyDeck(matchInfo: MatchInfo | null): Promise<void> {
    if (matchInfo === null) return;
    const decks = (await this.mirror.getDecks()) ?? [];
    const identified = await this.identifier.identify({ decks, matchInfo });
    if (identified !== null) {
      this.game.localPlayer.originalDeck = identified.originalDeck;
      return;
    }
    // No automatic match — emit a `needs-deck-selection` event with
    // the available decks so the renderer can prompt the user.
    this.awaitingDeckSelection = true;
    this.emit({
      type: 'needs-deck-selection',
      snapshot: this.currentSnapshot,
      decks: decks.map((d) => ({ id: d.id, name: d.name, hero: d.hero })),
    });
  }

  private buildSnapshot(args?: {
    matchInfo?: MatchInfo | null;
    handState?: HandState | null;
    deckState?: DeckState | null;
    isMulligan?: IsMulligan;
  }): DeckTrackerSnapshot {
    const matchInfo = args?.matchInfo ?? this.currentSnapshot.matchInfo;
    const handState = args?.handState ?? null;
    const deckState = args?.deckState ?? null;
    const friendlyHand = handState?.friendlyHand.map((c) => c.cardId) ?? [];

    let deck: DeckTrackerSnapshot['deck'] = null;
    const original = this.game.localPlayer.originalDeck;
    if (original !== null) {
      const seen = gatherSeenEntities(this.game.localPlayer);
      const result = computeRemaining({
        originalDeck: original,
        seenEntities: seen,
        localControllerId: this.game.localPlayer.controllerId,
      });
      deck = {
        id: 0, // Backfilled by setOriginalDeck if available; UI uses name primarily.
        name: this.game.localPlayer.name || '',
        original: original.entries(),
        remaining: result.remaining.entries(),
        extras: result.extras,
      };
    }

    return {
      phase: this.game.phase,
      matchInfo,
      deck,
      friendlyHand,
      opposingHandCount: handState?.opposingHandCount ?? 0,
      friendlyDeckCount: deckState?.friendlyDeck.length ?? 0,
      error: this.currentSnapshot.error,
      updatedAt: Date.now(),
    };
  }

  private emit(event: DeckTrackerEvent): void {
    const handlers = this.handlers.get(event.type);
    if (!handlers) return;
    for (const h of handlers) {
      try {
        h(event);
      } catch {
        // Swallow handler errors to keep the event loop healthy.
      }
    }
  }

  private onError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const errorSnapshot: DeckTrackerSnapshot = {
      ...this.currentSnapshot,
      error: message,
      updatedAt: Date.now(),
    };
    this.currentSnapshot = errorSnapshot;
    this.emit({ type: 'error', snapshot: errorSnapshot, error: message });
  }
}

function zoneToNumber(zone: 'HAND' | 'PLAY' | 'DECK' | 'SECRET' | 'GRAVEYARD'): number {
  switch (zone) {
    case 'PLAY':
      return 1;
    case 'DECK':
      return 2;
    case 'HAND':
      return 3;
    case 'GRAVEYARD':
      return 4;
    case 'SECRET':
      return 7;
  }
}

function blankSnapshot(): DeckTrackerSnapshot {
  return {
    phase: 'IDLE',
    matchInfo: null,
    deck: null,
    friendlyHand: [],
    opposingHandCount: 0,
    friendlyDeckCount: 0,
    error: null,
    updatedAt: 0,
  };
}

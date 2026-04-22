import type {
  BoardState,
  DeckState,
  HandState,
  HearthMirror,
  IsMulligan,
  MatchInfo,
} from '@hdt/hearthmirror';
import { DeckSnapshot } from '../game/deck-snapshot';
import { Game } from '../game/game';
import type { MatchPhase } from '../game/types';
import { zoneFromNumber } from '../game/types';
import {
  InGameDeckIdentifier,
  type IDeckIdentifier,
  type IdentifiedDeck,
} from './deck-identifier';
import type { Deck } from '@hdt/hearthmirror';
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
  /**
   * When non-null, the orchestrator is waiting for the user to pick
   * a deck via the dialog. Contains the deck options to render.
   *
   * Embedded in every snapshot tick (NOT just the one-shot
   * `needs-deck-selection` event) so newly-connecting renderers /
   * tracker startups before the window opens still see the state on
   * their first `getSnapshot()` poll. Idempotent — the dialog UI
   * is reactive on this slice.
   */
  pendingDeckSelection: {
    decks: { id: number; name: string; hero: string }[];
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
  /**
   * Most recent non-null `getSelectedDeckId` result observed.
   *
   * The in-game deck-picker scene (DeckPickerTrayDisplay) unloads as
   * soon as a match starts, so by the time we transition into IN_MATCH
   * the reflector returns null. We poke it during IDLE / PRE_MATCH
   * polls and remember the last known value so the IN_MATCH transition
   * can still resolve the deck without dialog interaction. Cleared on
   * POST_MATCH → IDLE so a new match starts fresh.
   */
  private lastKnownSelectedDeckId: bigint | null = null;
  /**
   * Most recent `getDecks()` result. Cached when needs-deck-selection
   * is emitted so `selectDeckById` can resolve the user's pick without
   * an extra IPC round trip.
   */
  private cachedDecks: Deck[] = [];

  constructor(args: {
    mirror: HearthMirror;
    identifier?: IDeckIdentifier;
  }) {
    this.mirror = args.mirror;
    // In-game memory-field identifier ONLY. The dialog fallback flow
    // is intentionally NOT wired in here as a "blocking identifier"
    // (which would deadlock against the dialog event being shown):
    // the orchestrator emits `needs-deck-selection`, the renderer
    // shows its dialog, and the user's pick comes back via the
    // public `selectDeckById()` method below.
    this.identifier = args.identifier ?? new InGameDeckIdentifier(args.mirror);
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

  /**
   * Renderer-side dialog response by deck id. Looks up the deck in the
   * cached decks list (set when needs-deck-selection was emitted),
   * falls back to a fresh `mirror.getDecks()` if cache miss.
   *
   * Used by the IPC `deck-tracker:select-deck` handler.
   */
  async selectDeckById(deckId: number): Promise<void> {
    let deck = this.cachedDecks.find((d) => d.id === deckId);
    if (!deck) {
      const freshDecks = (await this.mirror.getDecks()) ?? [];
      this.cachedDecks = freshDecks;
      deck = freshDecks.find((d) => d.id === deckId);
    }
    if (!deck) {
      return;
    }
    this.setOriginalDeck({
      deckId: deck.id,
      name: deck.name,
      originalDeck: DeckSnapshot.fromDeckCards(deck.cards),
    });
  }

  /** Cancel the dialog wait without picking. Just clears the flag. */
  cancelDeckSelection(): void {
    this.awaitingDeckSelection = false;
  }

  // ── Internal poll tick ─────────────────────────────────────────────

  private async tick(): Promise<void> {
    const previousPhase = this.game.phase;

    const matchInfo = await this.mirror.getMatchInfo();
    const isSpectating = await this.mirror.isSpectating();
    const isGameOverFlag = await this.mirror.isGameOver();

    // Cheap probe — ride the IDLE/PRE_MATCH polls to capture the
    // deck-picker selection BEFORE the scene unloads at match start.
    // Skipped during IN_MATCH/POST_MATCH (scene already gone).
    if (previousPhase === 'IDLE' || previousPhase === 'PRE_MATCH') {
      try {
        const selected = await this.mirror.getSelectedDeckId();
        if (selected !== null && selected.deckId > 0n) {
          this.lastKnownSelectedDeckId = selected.deckId;
        }
      } catch {
        // Reflector failures don't kill the loop; just skip the cache update.
      }
    }

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
      this.lastKnownSelectedDeckId = null;
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

    // Fast path: use the cached deck id captured during IDLE/PRE_MATCH
    // polls (the deck-picker scene has typically unloaded by now, so
    // the live `InGameDeckIdentifier` would return null).
    if (this.lastKnownSelectedDeckId !== null) {
      const cachedId = Number(this.lastKnownSelectedDeckId);
      const matched = decks.find((d) => d.id === cachedId);
      if (matched) {
        this.game.localPlayer.originalDeck = DeckSnapshot.fromDeckCards(matched.cards);
        return;
      }
    }

    // Slow path: ask the configured identifier (typically chains
    // InGameDeckIdentifier → CallbackDeckIdentifier).
    const identified = await this.identifier.identify({ decks, matchInfo });
    if (identified !== null) {
      this.game.localPlayer.originalDeck = identified.originalDeck;
      return;
    }
    // No automatic match — emit a `needs-deck-selection` event with
    // the available decks so the renderer can prompt the user.
    this.cachedDecks = decks;
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

    const pendingDeckSelection = this.awaitingDeckSelection
      ? {
          decks: this.cachedDecks.map((d) => ({
            id: d.id,
            name: d.name,
            hero: d.hero,
          })),
        }
      : null;

    return {
      phase: this.game.phase,
      matchInfo,
      deck,
      pendingDeckSelection,
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
    pendingDeckSelection: null,
    friendlyHand: [],
    opposingHandCount: 0,
    friendlyDeckCount: 0,
    error: null,
    updatedAt: 0,
  };
}

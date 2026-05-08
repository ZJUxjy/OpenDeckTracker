import type {
  BoardState,
  DeckState,
  HandState,
  HearthMirror,
  IsMulligan,
  MatchInfo,
} from '@hdt/hearthmirror';
import { DeckSnapshot } from '../game/deck-snapshot';
import { Game, type LogDerivedEntityUpdate } from '../game/game';
import type { MatchPhase, Zone } from '../game/types';
import { zoneFromNumber } from '../game/types';
import {
  InGameDeckIdentifier,
  type IDeckIdentifier,
  type IdentifiedDeck,
} from './deck-identifier';
import type { Deck } from '@hdt/hearthmirror';
import {
  isConstructedMatch,
  normalizeCompletedMatch,
  type NormalizedCompletedMatch,
} from '../stats/match-history';
import { computeRemaining, gatherSeenEntities } from './remaining-algorithm';
import {
  computeBoardAttack,
  computeMaxFaceDamage,
  type BoardAttackTotals,
  type ComputeBoardAttackOptions,
  type HeroVitals,
} from './board-attack';
import { nextPhase } from './phase-machine';
import { PollingLoop } from './polling-loop';
import { GlobalEffectsRegistry } from '../global-effects/registry';
import { EFFECT_CATALOG } from '../global-effects/catalog';
import type {
  ActiveEffect,
  CardPlayedEvent,
  ExtractCtx,
} from '../global-effects/types';

// ── Polling intervals (per design D6) ────────────────────────────────
const INTERVAL_IDLE_MS = 2_000;
const INTERVAL_PRE_MATCH_MS = 500;
const INTERVAL_IN_MATCH_MS = 500;
/** Adaptive catch-up — fired right after observing a hand-size delta. */
const INTERVAL_IMMEDIATE_MS = 0;

/** Snapshot pushed over IPC + reflected in the renderer Zustand store. */
export interface OpponentCardRecord {
  entityId: number;
  cardId: string;
  zone: Zone;
  order: number;
}

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
  /** Opponent cards that have been publicly revealed this match. */
  opponent: {
    revealed: OpponentCardRecord[];
    graveyard: OpponentCardRecord[];
  };
  /** Friendly remaining deck count (for header summary). */
  friendlyDeckCount: number;
  /** Global effects whose caster is the local player (per-match scope). */
  friendlyEffects: ActiveEffect[];
  /** Global effects whose caster is the opposing player (per-match scope). */
  opposingEffects: ActiveEffect[];
  /**
   * Total board attack per side. Sum of minion ATK with optional
   * tag-overlay filtering (frozen / sleeping / windfury)
   * plus equipped weapon damage when the host supplies a context
   * provider; falls back to a plain "sum positive ATK from
   * mirror.boardState" when no overlay is wired.
   */
  boardAttack: BoardAttackTotals;
  /**
   * Maximum damage that can reach the opposing hero this turn under an
   * optimal attack assignment, accounting for opposing taunts and
   * divine shields. 0 when there's at least one taunt the available
   * swings cannot kill. Falls back to the same value as `boardAttack`
   * when no tag overlay is present (no taunt info ⇒ assume no taunts).
   */
  boardAttackToFace: BoardAttackTotals;
  /** Friendly hero's current health/armor when available from Power.log tags. */
  friendlyHero?: HeroVitals | null;
  /** Opposing hero's current health/armor when available from Power.log tags. */
  opposingHero?: HeroVitals | null;
  /** Last error from the poll loop (null when healthy). */
  error: string | null;
  /** Wall-clock timestamp of the last successful poll. */
  updatedAt: number;
}

export interface DeckTrackerEvent {
  type: 'state-change' | 'match-started' | 'match-ended' | 'error' | 'needs-deck-selection';
  snapshot: DeckTrackerSnapshot;
  completedMatch?: NormalizedCompletedMatch;
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
  private readonly registry: GlobalEffectsRegistry;
  private game: Game;
  private currentSnapshot: DeckTrackerSnapshot;
  private previousFriendlyHandSize = 0;
  private opponentRecordOrder = 0;
  private readonly opponentEntityOrders = new Map<number, number>();
  private identifiedDeck: { id: number; name: string; heroClass: string | null } | null = null;
  /**
   * App-managed saved-deck attribution. Set via `selectSavedDeck` when the
   * user picks a saved deck through the renderer's `DeckSelectDialog`.
   * Flows into `match-ended` summary as opaque values; the IPC host owns
   * the link to the actual `DeckStore` row.
   */
  private savedDeckAttribution: { savedDeckId: string; savedDeckVersion: number } | null = null;
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

  /**
   * Optional callback the host injects to supply per-tick filter
   * context for `computeBoardAttack`: per-entity power tags (FROZEN /
   * EXHAUSTED / etc.) plus equipped weapon descriptors. Lives outside
   * core because the tag stream comes from `@hdt/hearthwatcher` and
   * `core → hearthwatcher` would create a dependency cycle.
   *
   * When unset, board attack falls back to a plain "sum positive
   * ATK" pass over `mirror.boardState`.
   */
  private readonly boardAttackContextProvider:
    | ((
        boardState: BoardState | null,
        matchInfo: MatchInfo | null,
        localControllerId: number,
      ) => ComputeBoardAttackOptions)
    | null;
  /** Latest reflector boardState — fed to `computeBoardAttack`. */
  private latestBoardState: BoardState | null = null;
  private latestMatchInfo: MatchInfo | null = null;

  constructor(args: {
    mirror: HearthMirror;
    identifier?: IDeckIdentifier;
    /** Optional context provider for parameterized global effects. */
    extractCtx?: () => ExtractCtx;
    /** Optional per-tick filter context for board-attack (host-owned). */
    boardAttackContextProvider?: (
      boardState: BoardState | null,
      matchInfo: MatchInfo | null,
      localControllerId: number,
    ) => ComputeBoardAttackOptions;
  }) {
    this.mirror = args.mirror;
    this.boardAttackContextProvider = args.boardAttackContextProvider ?? null;
    // In-game memory-field identifier ONLY. The dialog fallback flow
    // is intentionally NOT wired in here as a "blocking identifier"
    // (which would deadlock against the dialog event being shown):
    // the orchestrator emits `needs-deck-selection`, the renderer
    // shows its dialog, and the user's pick comes back via the
    // public `selectDeckById()` method below.
    this.identifier = args.identifier ?? new InGameDeckIdentifier(args.mirror);
    this.loop = new PollingLoop();
    this.game = new Game();
    const catalogIndex = new Map(
      EFFECT_CATALOG.map((def) => [def.sourceCardId, def] as const),
    );
    this.registry = new GlobalEffectsRegistry({
      catalogIndex,
      now: () => Date.now(),
      getControllerIds: () => ({
        local: this.game.localPlayer.controllerId,
        opposing: this.game.opposingPlayer.controllerId,
      }),
      ...(args.extractCtx !== undefined ? { extractCtx: args.extractCtx } : {}),
    });
    this.currentSnapshot = blankSnapshot();
  }

  /** Test-only escape hatch — game getter for assertions. */
  getGame(): Game {
    return this.game;
  }

  /**
   * Forward a played-card event from the host (e.g. main-process
   * dispatcher consuming HearthWatcher's PowerEvent stream). Drives
   * the global-effects registry; safe to call any phase, but most
   * effects only matter mid-match.
   */
  recordCardPlayed(event: CardPlayedEvent): void {
    this.registry.handleCardPlayed(event);
    this.currentSnapshot = this.buildSnapshot();
  }

  /**
   * Feed entity state reconstructed from Power.log into the same Game
   * model used by mirror snapshots. This is additive and intentionally
   * does not emit on its own: startup replay may send hundreds of
   * events before the next mirror tick, and the tick will publish one
   * coherent snapshot after the backfill has settled.
   */
  applyLogDerivedEntityUpdates(updates: readonly LogDerivedEntityUpdate[]): void {
    this.game.applyLogDerivedEntityUpdates(updates);
    this.currentSnapshot = this.buildSnapshot();
  }

  /**
   * Drop all active global effects. Called automatically on
   * IDLE → PRE_MATCH and POST_MATCH → IDLE transitions; exposed
   * publicly for tests + manual reset paths.
   */
  resetGlobalEffects(): void {
    this.registry.reset();
    this.currentSnapshot = this.buildSnapshot();
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
    this.applyIdentifiedDeck(identified);
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

  /**
   * Bind app-managed saved-deck attribution to the next emitted match-ended
   * summary. The IPC host calls this when the renderer picks a saved deck
   * via `DeckSelectDialog`. Live-deck identity (`identifiedDeck`) is set
   * separately via `setOriginalDeck` / `selectDeckById` and remains the
   * authoritative live ID; saved-deck values are additive.
   */
  selectSavedDeck(savedDeckId: string, savedDeckVersion: number): void {
    this.savedDeckAttribution = { savedDeckId, savedDeckVersion };
  }

  /** Drop a previously-set saved-deck attribution (renderer cancelled). */
  clearSavedDeckAttribution(): void {
    this.savedDeckAttribution = null;
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
      this.resetOpponentRecords();
      // NOTE: registry.reset() is intentionally NOT called here. The
      // global-effects registry is reset on the `create-game`
      // PowerEvent (driven by the host on watcher's replay or live
      // tail). Resetting on this phase transition would race with
      // mid-match replay: replay events populate the registry first,
      // then the tracker's first tick fires this transition and
      // wipes them. See `forwardPowerEventToDeckTracker`.
      this.game.transitionTo('PRE_MATCH');
      this.applyMatchInfo(matchInfo);
    }
    if (target === 'IN_MATCH' && previousPhase !== 'IN_MATCH') {
      this.game.transitionTo('IN_MATCH');
      // First-time entry: try to identify the deck.
      if (this.game.localPlayer.originalDeck === null && !this.awaitingDeckSelection) {
        await this.identifyDeck(matchInfo, { handState, boardState });
      }
    }
    if (target === 'POST_MATCH' && previousPhase !== 'POST_MATCH') {
      this.game.transitionTo('POST_MATCH');
    }
    if (previousPhase === 'POST_MATCH' && target === 'IDLE') {
      this.game.reset();
      this.previousFriendlyHandSize = 0;
      this.resetOpponentRecords();
      this.registry.reset();
      this.awaitingDeckSelection = false;
      this.lastKnownSelectedDeckId = null;
      this.identifiedDeck = null;
    }
    this.game.phase = target;

    const completedMatch =
      previousPhase === 'IN_MATCH' && target === 'POST_MATCH'
        ? this.buildCompletedMatch(matchInfo ?? this.currentSnapshot.matchInfo)
        : undefined;

    // Apply entities from snapshots.
    if (target === 'IN_MATCH' || target === 'PRE_MATCH') {
      this.applyEntitySnapshots({ matchInfo, deckState, handState, boardState });
    }
    // Cache latest reflector state so `computeBoardAttack` (called
    // from `buildSnapshot`) sees authoritative minion data.
    this.latestBoardState = boardState;
    this.latestMatchInfo = matchInfo ?? this.latestMatchInfo;

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
      this.emit({
        type: 'match-ended',
        snapshot: this.currentSnapshot,
        ...(completedMatch !== undefined ? { completedMatch } : {}),
      });
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
      const localControllerId = validControllerId(info.localPlayer?.id) ?? 1;
      const reflectedOpponentId = validControllerId(info.opposingPlayer?.id);
      this.game.setPlayers({
        localControllerId,
        localName: info.localPlayer?.name ?? '',
        opposingControllerId:
          reflectedOpponentId !== undefined && reflectedOpponentId !== localControllerId
            ? reflectedOpponentId
            : localControllerId === 1 ? 2 : 1,
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
      if (b.cardId !== '') {
        this.ensureOpponentRecordOrder(b.entityId);
      }
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

  private async identifyDeck(matchInfo: MatchInfo | null, visibleState: {
    handState: HandState | null;
    boardState: BoardState | null;
  }): Promise<void> {
    if (matchInfo === null) return;
    const decks = (await this.mirror.getDecks()) ?? [];

    // Fast path: use the cached deck id captured during IDLE/PRE_MATCH
    // polls (the deck-picker scene has typically unloaded by now, so
    // the live `InGameDeckIdentifier` would return null).
    if (this.lastKnownSelectedDeckId !== null) {
      const cachedId = Number(this.lastKnownSelectedDeckId);
      const matched = decks.find((d) => d.id === cachedId);
      if (matched) {
        this.applyIdentifiedDeck(deckToIdentified(matched));
        return;
      }
    }

    // Slow path: ask the configured identifier (typically chains
    // InGameDeckIdentifier → CallbackDeckIdentifier).
    const identified = await this.identifier.identify({ decks, matchInfo });
    if (identified !== null) {
      this.applyIdentifiedDeck(identified);
      return;
    }

    const visibleCandidates = findDecksFromVisibleFriendlyCards(decks, visibleState);
    const visibleIdentified = identifyDeckFromVisibleCandidates(visibleCandidates);
    if (visibleIdentified !== null) {
      this.applyIdentifiedDeck(visibleIdentified);
      return;
    }
    // No automatic match — emit a `needs-deck-selection` event with
    // the available decks so the renderer can prompt the user.
    this.cachedDecks = visibleCandidates.length > 0 ? visibleCandidates : decks;
    this.awaitingDeckSelection = true;
    this.emit({
      type: 'needs-deck-selection',
      snapshot: this.currentSnapshot,
      decks: this.cachedDecks.map((d) => ({ id: d.id, name: d.name, hero: d.hero })),
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
    const friendlyHand =
      handState?.friendlyHand
        .slice()
        .sort((a, b) => a.zonePosition - b.zonePosition || a.entityId - b.entityId)
        .map((c) => c.cardId) ?? [];

    let deck: DeckTrackerSnapshot['deck'] = null;
    const original = this.game.localPlayer.originalDeck;
    if (original !== null) {
      const seen = gatherSeenEntities(this.game.localPlayer);
      const result = computeRemaining({
        originalDeck: original,
        seenEntities: seen,
        deckEntities: this.game.localPlayer.deck,
        localControllerId: this.game.localPlayer.controllerId,
      });
      const authoritativeRemaining = authoritativeRemainingFromDeckState(deckState);
      const remaining = capRemainingToDeckStateCount(
        authoritativeRemaining ?? result.remaining,
        this.game.localPlayer.deck,
        deckState,
      );
      deck = {
        id: this.identifiedDeck?.id ?? 0,
        name: this.identifiedDeck?.name ?? this.game.localPlayer.name ?? '',
        original: original.entries(),
        remaining: remaining.entries(),
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

    const effects = this.registry.snapshot();

    const resolvedMatchInfo = matchInfo ?? this.latestMatchInfo;
    const boardAttackOpts =
      this.boardAttackContextProvider !== null
        ? this.boardAttackContextProvider(
            this.latestBoardState,
            resolvedMatchInfo,
            this.game.localPlayer.controllerId,
          )
        : {};
    const boardAttack = computeBoardAttack(this.latestBoardState, boardAttackOpts);
    const boardAttackToFace = computeMaxFaceDamage(this.latestBoardState, boardAttackOpts);
    const friendlyHero = boardAttackOpts.friendlyHero ?? null;
    const opposingHero = boardAttackOpts.opposingHero ?? null;

    return {
      phase: this.game.phase,
      matchInfo,
      deck,
      pendingDeckSelection,
      friendlyHand,
      opposingHandCount: handState?.opposingHandCount ?? 0,
      opponent: this.buildOpponentRecords(),
      friendlyDeckCount: deckState?.friendlyDeck.length ?? this.game.localPlayer.deck.length,
      friendlyEffects: effects.local,
      opposingEffects: effects.opposing,
      boardAttack,
      boardAttackToFace,
      friendlyHero,
      opposingHero,
      // A successful tick clears any previous error; `onError` sets it
      // again on the next snapshot if a tick throws. Without this clear,
      // a single transient error would stay visible in the UI's "Error"
      // status pill forever.
      error: null,
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
    const stack = err instanceof Error ? err.stack : undefined;
    // Surface the actual error in the host's stderr so devs running
    // `pnpm dev` can see what failed. The renderer's bottom-bar "Error"
    // pill only reflects that *some* tick failed; without this log the
    // operator has no way to see which line threw.
    // eslint-disable-next-line no-console
    console.error('[deck-tracker] tick error:', message, stack ?? '');
    const errorSnapshot: DeckTrackerSnapshot = {
      ...this.currentSnapshot,
      error: message,
      updatedAt: Date.now(),
    };
    this.currentSnapshot = errorSnapshot;
    this.emit({ type: 'error', snapshot: errorSnapshot, error: message });
  }

  private applyIdentifiedDeck(identified: IdentifiedDeck): void {
    this.game.localPlayer.originalDeck = identified.originalDeck;
    this.identifiedDeck = {
      id: identified.deckId,
      name: identified.name,
      heroClass: identified.heroClass ?? null,
    };
  }

  private resetOpponentRecords(): void {
    this.opponentRecordOrder = 0;
    this.opponentEntityOrders.clear();
  }

  private ensureOpponentRecordOrder(entityId: number): number {
    const existing = this.opponentEntityOrders.get(entityId);
    if (existing !== undefined) return existing;
    this.opponentRecordOrder += 1;
    this.opponentEntityOrders.set(entityId, this.opponentRecordOrder);
    return this.opponentRecordOrder;
  }

  private buildOpponentRecords(): DeckTrackerSnapshot['opponent'] {
    const records = this.game.opposingPlayer.entities
      .filter((entity) =>
        entity.isRevealed &&
        isOpponentHistoryCardId(entity.cardId) &&
        (entity.isInPlay || entity.isInGraveyard || entity.isInSecret)
      )
      .map((entity) => ({
        entityId: entity.entityId,
        cardId: entity.cardId,
        zone: entity.zone,
        order: this.ensureOpponentRecordOrder(entity.entityId),
      }))
      .sort((a, b) => a.order - b.order || a.entityId - b.entityId);

    return {
      revealed: records.filter((record) => record.zone !== 'GRAVEYARD'),
      graveyard: records.filter((record) => record.zone === 'GRAVEYARD'),
    };
  }

  private buildCompletedMatch(matchInfo: MatchInfo | null): NormalizedCompletedMatch | undefined {
    const gameType = matchInfo?.gameType ?? this.game.gameType;
    const formatType = matchInfo?.formatType ?? this.game.formatType;
    const missionId = matchInfo?.missionId ?? this.game.missionId;
    if (!isConstructedMatch({ gameType, formatType, missionId })) return undefined;

    const startedAt = this.game.startedAt ?? this.currentSnapshot.updatedAt;
    const endedAt = this.game.endedAt ?? Date.now();

    return normalizeCompletedMatch({
      fingerprint: '',
      startedAt,
      endedAt,
      result: 'unknown',
      playOrder: 'unknown',
      deckId: this.identifiedDeck?.id ?? null,
      deckName: this.identifiedDeck?.name ?? null,
      playerClass: this.identifiedDeck?.heroClass ?? null,
      ...(this.savedDeckAttribution !== null
        ? {
            savedDeckId: this.savedDeckAttribution.savedDeckId,
            savedDeckVersion: this.savedDeckAttribution.savedDeckVersion,
          }
        : {}),
      opponentName: matchInfo?.opposingPlayer?.name ?? this.game.opposingPlayer.name ?? null,
      opponentClass: null,
      gameType,
      formatType,
      missionId,
      source: 'deck-tracker',
    });
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

function validControllerId(id: number | undefined): number | undefined {
  return id !== undefined && id > 0 ? id : undefined;
}

function deckToIdentified(deck: Deck): IdentifiedDeck {
  return {
    deckId: deck.id,
    name: deck.name,
    originalDeck: DeckSnapshot.fromDeckCards(deck.cards),
  };
}

function findDecksFromVisibleFriendlyCards(
  decks: Deck[],
  state: {
    handState: HandState | null;
    boardState: BoardState | null;
  },
): Deck[] {
  const visibleCounts = countVisibleFriendlyCards(state);
  if (sumCounts(visibleCounts) < 2) return [];

  return decks.filter((deck) => deckContainsVisibleCards(deck, visibleCounts));
}

function identifyDeckFromVisibleCandidates(matches: Deck[]): IdentifiedDeck | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return deckToIdentified(matches[0]!);

  const [first, ...rest] = matches;
  if (rest.every((deck) => deckSignature(deck) === deckSignature(first!))) {
    return deckToIdentified(first!);
  }
  return null;
}

function countVisibleFriendlyCards(state: {
  handState: HandState | null;
  boardState: BoardState | null;
}): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (cardId: string): void => {
    if (!isDeckIdentityCardId(cardId)) return;
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  };

  for (const card of state.handState?.friendlyHand ?? []) {
    add(card.cardId);
  }
  for (const card of state.boardState?.friendly ?? []) {
    add(card.cardId);
  }
  return counts;
}

function isDeckIdentityCardId(cardId: string): boolean {
  if (cardId === '') return false;
  if (cardId.startsWith('HERO_')) return false;
  if (cardId === 'GAME_005' || cardId.endsWith('_COIN') || cardId.includes('COIN')) {
    return false;
  }
  return true;
}

function isOpponentHistoryCardId(cardId: string): boolean {
  if (cardId === '') return false;
  if (cardId.startsWith('HERO_')) return false;
  return true;
}

function deckContainsVisibleCards(deck: Deck, visibleCounts: Map<string, number>): boolean {
  const deckCounts = new Map<string, number>();
  for (const card of deck.cards) {
    deckCounts.set(card.cardId, (deckCounts.get(card.cardId) ?? 0) + card.count);
  }

  for (const [cardId, count] of visibleCounts) {
    if ((deckCounts.get(cardId) ?? 0) < count) {
      return false;
    }
  }
  return true;
}

function deckSignature(deck: Deck): string {
  return deck.cards
    .map((card) => `${card.cardId}:${card.count}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
}

function sumCounts(counts: Map<string, number>): number {
  let total = 0;
  for (const count of counts.values()) total += count;
  return total;
}

function authoritativeRemainingFromDeckState(deckState: DeckState | null): DeckSnapshot | null {
  if (deckState === null || deckState.friendlyDeck.length === 0) return null;
  const cardIds = deckState.friendlyDeck.map((card) => card.cardId);
  if (cardIds.some((cardId) => cardId === '')) return null;
  return DeckSnapshot.fromCardIds(cardIds);
}

function capRemainingToDeckStateCount(
  remaining: DeckSnapshot,
  knownDeckEntities: readonly { cardId: string }[],
  deckState: DeckState | null,
): DeckSnapshot {
  if (deckState === null) return remaining;
  const target = deckState.friendlyDeck.length;
  if (target === 0) return remaining;
  const total = remaining.total();
  if (total <= target) return remaining;

  const counts = new Map(remaining.entries().map((card) => [card.cardId, card.count] as const));
  const protectedCounts = DeckSnapshot.fromCardIds(
    knownDeckEntities.map((entity) => entity.cardId).filter((cardId) => cardId !== ''),
  );
  let overflow = total - target;

  const trim = (respectProtected: boolean): void => {
    const candidates = [...counts.entries()]
      .map(([cardId, count]) => ({
        cardId,
        count,
        removable: Math.max(0, count - (respectProtected ? protectedCounts.countOf(cardId) : 0)),
      }))
      .filter((card) => card.removable > 0)
      .sort((a, b) => b.removable - a.removable || b.cardId.localeCompare(a.cardId));

    for (const candidate of candidates) {
      if (overflow <= 0) return;
      const remove = Math.min(candidate.removable, overflow);
      const next = (counts.get(candidate.cardId) ?? 0) - remove;
      if (next > 0) counts.set(candidate.cardId, next);
      else counts.delete(candidate.cardId);
      overflow -= remove;
    }
  };

  trim(true);
  trim(false);
  return new DeckSnapshot(counts);
}

function blankSnapshot(): DeckTrackerSnapshot {
  return {
    phase: 'IDLE',
    matchInfo: null,
    deck: null,
    pendingDeckSelection: null,
    friendlyHand: [],
    opposingHandCount: 0,
    opponent: {
      revealed: [],
      graveyard: [],
    },
    friendlyDeckCount: 0,
    friendlyEffects: [],
    opposingEffects: [],
    boardAttack: { friendly: 0, opposing: 0 },
    boardAttackToFace: { friendly: 0, opposing: 0 },
    friendlyHero: null,
    opposingHero: null,
    error: null,
    updatedAt: 0,
  };
}

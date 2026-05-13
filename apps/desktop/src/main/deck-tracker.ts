import { app, BrowserWindow, ipcMain } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CardPlayedDetector,
  DeckTracker,
  type ComputeBoardAttackOptions,
  type DeckTrackerEvent,
  type DeckTrackerSnapshot,
  type ExtractCtx,
  type HeroAttackState,
  type HeroClass,
  type HeroVitals,
  type LogDerivedEntityUpdate,
  type MatchPhase,
  type MinionTags,
  type NormalizedCompletedMatch,
  type Zone,
  type WeaponState,
  zoneFromNumber,
} from '@hdt/core';
import type { CardDb, CardClass } from '@hdt/hearthdb';
import type { BoardState, MatchInfo } from '@hdt/hearthmirror';
import {
  HearthWatcherGameState,
  reducePowerEvent,
  type EventPhase,
  type PowerEvent,
} from '@hdt/hearthwatcher';
import {
  defaultCardImageCacheRoot,
  ensureCardTileCached,
} from './card-image-cache';
import { getHearthMirror } from './hearthmirror';
import { liveMatchIdentity } from './match-identity';
import { recordCompletedMatch } from './stats-host';

/**
 * Per-app session DeckTracker host.
 *
 * Owns one `DeckTracker` instance, forwards its events to all
 * BrowserWindows over IPC channels:
 *   - `deck-tracker:state`  — full snapshot push (every tick)
 *   - `deck-tracker:event`  — typed event push (match-started, etc.)
 *
 * Renderer-driven IPC handlers:
 *   - `deck-tracker:get-snapshot`     — return current snapshot
 *   - `deck-tracker:select-deck`      — accept user's dialog choice and
 *                                        forward to `tracker.selectDeckById`
 *   - `deck-tracker:cancel-selection` — user dismissed the dialog
 *
 * The renderer dialog flow:
 *   1. tracker emits `needs-deck-selection` event with `decks` payload
 *   2. renderer shows DeckSelectDialog (driven by the Zustand
 *      `pendingSelection` slice populated from that event)
 *   3. user picks, renderer invokes `deck-tracker:select-deck` with deckId
 *   4. main calls `tracker.selectDeckById(deckId)` → tracker resolves
 *      the deck against its cached `getDecks()` list and sets
 *      `originalDeck` on the local player → next snapshot push includes
 *      the deck.
 *
 * The CallbackDeckIdentifier-based "blocking identifier" pattern
 * was rejected (it deadlocked: dialog couldn't show until the
 * identifier returned, identifier couldn't return until user picked
 * via the dialog).
 */

let tracker: DeckTracker | null = null;
let lastTrackerTraceSignature: string | null = null;
let trackerTraceErrorLogged = false;

/**
 * CardDb reference used by `cardClassLookup` to resolve `HERO_*` cardIds
 * into the opposing player's `HeroClass`. Set asynchronously by the IPC
 * host once `ensureCardDb()` resolves; until then, `opponentClass`
 * falls back to null in every snapshot.
 */
let cachedCardDb: CardDb | null = null;
const HERO_CLASS_VALUES: ReadonlySet<string> = new Set<HeroClass>([
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR',
]);

function maybeWriteTrackerTrace(snapshot: DeckTrackerSnapshot): void {
  if (process.env.HDT_TRACKER_TRACE !== '1') return;

  const payload = {
    phase: snapshot.phase,
    deck: snapshot.deck === null ? null : {
      id: snapshot.deck.id,
      name: snapshot.deck.name,
      remainingTotal: snapshot.deck.remaining.reduce((sum, card) => sum + card.count, 0),
    },
    friendlyDeckCount: snapshot.friendlyDeckCount,
    opposingHandCount: snapshot.opposingHandCount,
    opponent: {
      revealed: snapshot.opponent.revealed,
      graveyard: snapshot.opponent.graveyard,
    },
    friendlyGraveyard: snapshot.friendlyGraveyard,
    friendlyEffects: snapshot.friendlyEffects,
    opposingEffects: snapshot.opposingEffects,
  };
  const signature = JSON.stringify(payload);
  if (signature === lastTrackerTraceSignature) return;
  lastTrackerTraceSignature = signature;

  const file = process.env.HDT_TRACKER_TRACE_FILE && process.env.HDT_TRACKER_TRACE_FILE.length > 0
    ? process.env.HDT_TRACKER_TRACE_FILE
    : resolve(process.cwd(), '.codex', 'runlogs', 'tracker-trace.jsonl');
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...payload })}\n`, 'utf8');
  } catch (err) {
    if (!trackerTraceErrorLogged) {
      trackerTraceErrorLogged = true;
      console.error('[deck-tracker] tracker trace write failed', err);
    }
  }
}

/**
 * Lazily-built `HERO_<NN> prefix → HeroClass` map. Hero portrait cardIds
 * follow a pattern like `HERO_05` (Rexxar, Hunter), `HERO_05a`
 * (Alleria, Hunter alt skin), `HERO_05bp` (Hunter hero power) — every
 * sibling sharing the numeric prefix maps to the same class. By
 * walking every HERO card the local CardDb knows about, we derive the
 * mapping at runtime so a bundled cards.json that's missing one
 * specific alt-skin can still resolve its class via any sibling.
 */
let heroPrefixCache: Map<string, HeroClass> | null = null;

function rebuildHeroPrefixCache(db: CardDb): Map<string, HeroClass> {
  const map = new Map<string, HeroClass>();
  const heroes = db.search({ type: 'HERO', limit: 1000 });
  for (const h of heroes) {
    const m = /^HERO_(\d+)/.exec(h.id);
    if (!m) continue;
    const prefix = m[1]!;
    const cls = h.cardClass;
    if (HERO_CLASS_VALUES.has(cls) && !map.has(prefix)) {
      map.set(prefix, cls as HeroClass);
    }
  }
  return map;
}

export function setCardDbForDeckTracker(db: CardDb): void {
  cachedCardDb = db;
  heroPrefixCache = rebuildHeroPrefixCache(db);
}

function cardClassLookup(cardId: string): HeroClass | null {
  if (!cachedCardDb) return null;
  const card = cachedCardDb.findById(cardId);
  if (card) {
    const cls: CardClass = card.cardClass;
    if (HERO_CLASS_VALUES.has(cls)) return cls as HeroClass;
  }
  // Fallback: alt-skin portrait the bundled cards.json doesn't list by
  // exact id. Derive class from any sibling HERO_<NN>* card.
  const m = /^HERO_(\d+)/.exec(cardId);
  if (m && heroPrefixCache) {
    return heroPrefixCache.get(m[1]!) ?? null;
  }
  return null;
}

/**
 * Heuristic: the card's text indicates it triggers at game start and
 * removes itself from play (e.g., the "Wonder" / 奇闻 mechanic). These
 * cards belong to the LOCAL player's deck but Hearthstone briefly
 * surfaces their effect tokens / phantom entities on the opposing side
 * during the start-of-game phase, which our cumulative `revealed` list
 * would otherwise lock onto. Suppressing them at the deck-tracker level
 * keeps the opponent panel + prediction honest.
 */
function isStartOfGameDisappearCard(cardId: string): boolean {
  if (!cachedCardDb) return false;
  const card = cachedCardDb.findById(cardId);
  const text = card?.text;
  if (typeof text !== 'string' || text.length === 0) return false;
  // Match either locale (the bundled CardDb is whichever ensureCardDb
  // resolved with — currently default enUS, but be tolerant either way).
  if (/Start of Game[\s\S]*Disappear/i.test(text)) return true;
  if (/对战开始时[\s\S]*消失/.test(text)) return true;
  return false;
}
let cardPlayedDetector: CardPlayedDetector | null = null;

// ── Board-attack tag overlay ────────────────────────────────────────
//
// Tag-tracked entity store fed by every PowerEvent. The deck-tracker
// asks for filter context each tick via `boardAttackContextProvider`;
// we materialize it from this state. Reset on `create-game` so a new
// match starts clean.
let boardAttackState = new HearthWatcherGameState();

function resetBoardAttackState(): void {
  boardAttackState = new HearthWatcherGameState();
}

function numericTag(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function boolTag(value: unknown): boolean {
  if (value === 1 || value === true) return true;
  if (typeof value === 'string') return value === 'True' || value === '1';
  return false;
}

function isWeaponEntity(tags: Readonly<Record<string, unknown>>): boolean {
  const ct = tags['CARDTYPE'];
  return ct === 'WEAPON' || ct === 7;
}

function isHeroEntity(entity: { cardId: string; tags: Readonly<Record<string, unknown>> }): boolean {
  const ct = entity.tags['CARDTYPE'];
  return ct === 'HERO' || ct === 3 || entity.cardId.startsWith('HERO_');
}

function heroVitalsFromTags(tags: Readonly<Record<string, unknown>>): HeroVitals | null {
  const health = numericTag(tags['HEALTH']);
  if (health === undefined) return null;
  const damage = numericTag(tags['DAMAGE']) ?? 0;
  const armor = numericTag(tags['ARMOR']) ?? 0;
  const remainingHealth = Math.max(0, health - damage);
  return {
    health: remainingHealth,
    armor,
    effectiveHealth: remainingHealth + armor,
  };
}

function heroVitalsForController(controllerId: number): HeroVitals | null {
  for (const e of boardAttackState.entities.values()) {
    if (e.controllerId !== controllerId) continue;
    if (e.zone !== 'PLAY') continue;
    if (!isHeroEntity(e)) continue;
    const vitals = heroVitalsFromTags(e.tags);
    if (vitals !== null) return vitals;
  }
  return null;
}

function opposingHeroVitals(localControllerId: number): HeroVitals | null {
  for (const e of boardAttackState.entities.values()) {
    if (e.controllerId === localControllerId) continue;
    if (e.zone !== 'PLAY') continue;
    if (!isHeroEntity(e)) continue;
    const vitals = heroVitalsFromTags(e.tags);
    if (vitals !== null) return vitals;
  }
  return null;
}

function buildBoardAttackContext(
  _boardState: BoardState | null,
  _matchInfo: MatchInfo | null,
  localControllerId: number,
): ComputeBoardAttackOptions {
  // Trust the tracker's resolved controllerId — it already runs through
  // `validControllerId` and falls back deterministically. matchInfo can
  // still be 0/0 mid-restart (mirror hasn't populated MatchInfo yet);
  // the tracker's value is the right source of truth for left/right
  // bucketing of hero attacks and weapons.
  const localId = localControllerId;

  const tagsByEntityId = new Map<number, MinionTags>();
  const weapons: WeaponState[] = [];
  const heroAttacks: HeroAttackState[] = [];

  for (const e of boardAttackState.entities.values()) {
    if (e.zone !== 'PLAY') continue;
    const wfNum = numericTag(e.tags['WINDFURY']);
    if (isHeroEntity(e)) {
      const attack = numericTag(e.tags['ATK']);
      if (attack !== undefined) {
        heroAttacks.push({
          controllerId: e.controllerId,
          attack,
          frozen: boolTag(e.tags['FROZEN']),
          cantAttack: boolTag(e.tags['CANT_ATTACK']),
          windfury: boolTag(e.tags['WINDFURY']),
          megaWindfury: wfNum === 3 || boolTag(e.tags['MEGA_WINDFURY']),
          numAttacksThisTurn: numericTag(e.tags['NUM_ATTACKS_THIS_TURN']) ?? 0,
          extraAttacksThisTurn: numericTag(e.tags['EXTRA_ATTACKS_THIS_TURN']) ?? 0,
        });
      }
      continue;
    }
    if (isWeaponEntity(e.tags)) {
      const attack = numericTag(e.tags['ATK']);
      if (attack === undefined || attack <= 0) continue;
      const durability = numericTag(e.tags['DURABILITY']);
      const weapon: WeaponState = {
        controllerId: e.controllerId,
        attack,
        windfury: boolTag(e.tags['WINDFURY']),
        megaWindfury: wfNum === 3 || boolTag(e.tags['MEGA_WINDFURY']),
        numAttacksThisTurn: numericTag(e.tags['NUM_ATTACKS_THIS_TURN']) ?? 0,
        ...(durability !== undefined ? { durability } : {}),
      };
      weapons.push(weapon);
      continue;
    }

    // Minion tag overlay for the calculator. Only entries that change
    // a minion's swing budget go in — others (e.g. heroes) are filtered
    // out by the calculator's HERO_/GAME_ cardId guard.
    const numTurnsInPlay = numericTag(e.tags['NUM_TURNS_IN_PLAY']);
    const tags: MinionTags = {
      frozen: boolTag(e.tags['FROZEN']),
      cantAttack: boolTag(e.tags['CANT_ATTACK']),
      charge: boolTag(e.tags['CHARGE']),
      rush: boolTag(e.tags['RUSH']),
      windfury: boolTag(e.tags['WINDFURY']),
      megaWindfury: wfNum === 3 || boolTag(e.tags['MEGA_WINDFURY']),
      numAttacksThisTurn: numericTag(e.tags['NUM_ATTACKS_THIS_TURN']) ?? 0,
      extraAttacksThisTurn: numericTag(e.tags['EXTRA_ATTACKS_THIS_TURN']) ?? 0,
      taunt: boolTag(e.tags['TAUNT']),
      divineShield: boolTag(e.tags['DIVINE_SHIELD']),
    };
    if (numTurnsInPlay !== undefined) tags.numTurnsInPlay = numTurnsInPlay;
    tagsByEntityId.set(e.entityId, tags);
  }

  return {
    tagsByEntityId,
    weapons,
    heroAttacks,
    localControllerId: localId,
    friendlyHero: heroVitalsForController(localId),
    opposingHero: opposingHeroVitals(localId),
  };
}

// ── PowerEvent ring buffer for the global-effects extractCtx ─────────
//
// Parameterized effects (Tame Pet / Roam Free / Migrating Elekk) need
// to look ~tens of events forward in the PowerEvent stream from the
// cast block to find the spawned beast cardIds. The registry's
// `parameterExtractor` runs asynchronously after `handleCardPlayed`,
// so we buffer recent events in a bounded ring and expose them via an
// `ExtractCtx` factory. Bound is generous (1000 events) because
// Hearthstone fires lots of per-tick TAG_CHANGE noise; the actual
// lookahead is capped inside the extractor.
const MAX_EVENT_BUFFER = 1000;
const recentPowerEvents: PowerEvent[] = [];
type EventWaiter = (events: readonly PowerEvent[]) => void;
const eventWaiters = new Set<EventWaiter>();

function resetPowerEventBuffer(): void {
  recentPowerEvents.length = 0;
  if (eventWaiters.size > 0) {
    for (const w of eventWaiters) w([]);
    eventWaiters.clear();
  }
}

function pushPowerEvent(event: PowerEvent): void {
  recentPowerEvents.push(event);
  if (recentPowerEvents.length > MAX_EVENT_BUFFER) {
    recentPowerEvents.splice(0, recentPowerEvents.length - MAX_EVENT_BUFFER);
  }
  if (eventWaiters.size > 0) {
    const snapshot = [...recentPowerEvents];
    for (const w of eventWaiters) w(snapshot);
    eventWaiters.clear();
  }
}

function makeExtractCtx(): ExtractCtx {
  return {
    recentEvents: [...recentPowerEvents],
    waitForMoreEvents: (timeoutMs: number): Promise<readonly PowerEvent[]> =>
      new Promise((resolve) => {
        let settled = false;
        const settle = (events: readonly PowerEvent[]): void => {
          if (settled) return;
          settled = true;
          eventWaiters.delete(waiter);
          resolve(events);
        };
        const waiter: EventWaiter = (events) => settle(events);
        eventWaiters.add(waiter);
        setTimeout(() => settle([...recentPowerEvents]), timeoutMs);
      }),
  };
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

const preloadedTileCardIds = new Set<string>();
let cardImageRoot: string | null = null;

function getCardImageRoot(): string {
  if (cardImageRoot === null) {
    cardImageRoot = defaultCardImageCacheRoot(app.getPath('userData'));
  }
  return cardImageRoot;
}

function extractTileCardIds(snapshot: DeckTrackerSnapshot): string[] {
  const out: string[] = [];
  for (const card of snapshot.deck?.remaining ?? []) {
    if (card.count > 0 && !preloadedTileCardIds.has(card.cardId)) {
      out.push(card.cardId);
    }
  }
  for (const cardId of snapshot.friendlyHand ?? []) {
    if (cardId && !preloadedTileCardIds.has(cardId)) {
      out.push(cardId);
    }
  }
  return out;
}

function preloadCardTiles(cardIds: string[]): void {
  const toFetch = cardIds.filter((id) => !preloadedTileCardIds.has(id));
  if (toFetch.length === 0) return;
  for (const id of toFetch) {
    preloadedTileCardIds.add(id);
  }
  void Promise.allSettled(
    toFetch.map((cardId) =>
      ensureCardTileCached(cardId, { root: getCardImageRoot() }).catch(() => undefined),
    ),
  );
}

export function startDeckTracker(): void {
  if (tracker !== null) return;
  const mirror = getHearthMirror();
  tracker = new DeckTracker({
    mirror,
    extractCtx: makeExtractCtx,
    boardAttackContextProvider: buildBoardAttackContext,
    cardClassLookup,
    opponentCardSuppressor: isStartOfGameDisappearCard,
  });
  // Live detector that turns the upstream PowerEvent stream into
  // `card:played` calls on the tracker's global-effects registry.
  cardPlayedDetector = new CardPlayedDetector({
    emit: (event) => tracker?.recordCardPlayed(event),
  });

  let lastPhaseLogged: string | null = null;
  let lastDeckIdLogged: number | string | null = null;
  tracker.on('state-change', (event: DeckTrackerEvent) => {
    const s = event.snapshot;
    const phase = s?.phase ?? 'NULL';
    const deckId = s?.deck?.id ?? null;
    if (phase !== lastPhaseLogged || deckId !== lastDeckIdLogged) {
      const remainingTotal = s?.deck?.remaining.reduce((sum, card) => sum + card.count, 0) ?? 0;
      console.log(
        `[deck-tracker] state phase=${phase} deck=${deckId === null ? 'null' : `${deckId} (${s?.deck?.name ?? '?'})`} remainingEntries=${s?.deck?.remaining?.length ?? 0} remainingTotal=${remainingTotal} friendlyDeckCount=${s?.friendlyDeckCount ?? 0} oppRevealed=${s?.opponent?.revealed?.length ?? 0}`,
      );
      lastPhaseLogged = phase;
      lastDeckIdLogged = deckId;
    }
    // Fire-and-forget tile preload: every snapshot carries the cardIds
    // that are about to be rendered in the overlay. Getting them into
    // the disk (and therefore the in-memory protocol cache) before the
    // renderer paints avoids the blank-tile flash on first draw.
    const tileIds = extractTileCardIds(s);
    if (tileIds.length > 0) {
      preloadCardTiles(tileIds);
    }
    if (s?.phase) fanoutPhase(s.phase);
    fanoutSnapshot(event.snapshot);
    maybeWriteTrackerTrace(event.snapshot);
    broadcast('deck-tracker:state', event.snapshot);
  });
  tracker.on('match-started', (event: DeckTrackerEvent) => {
    preloadedTileCardIds.clear();
    console.log(`[deck-tracker] match-started deck=${event.snapshot?.deck?.id ?? 'null'}`);
    broadcast('deck-tracker:event', { type: event.type, snapshot: event.snapshot });
  });
  tracker.on('match-ended', (event: DeckTrackerEvent) => {
    console.log(`[deck-tracker] match-ended completed=${event.completedMatch !== undefined}`);
    const completedMatch =
      event.completedMatch !== undefined
        ? withLiveMatchFingerprint(event.completedMatch)
        : undefined;
    if (completedMatch !== undefined) {
      recordCompletedMatch(completedMatch);
    }
    broadcast('deck-tracker:event', {
      type: event.type,
      snapshot: event.snapshot,
      ...(completedMatch !== undefined ? { completedMatch } : {}),
    });
  });
  tracker.on('error', (event: DeckTrackerEvent) => {
    console.error('[deck-tracker] error:', event.error);
    broadcast('deck-tracker:event', {
      type: event.type,
      snapshot: event.snapshot,
      error: event.error,
    });
  });
  tracker.on('needs-deck-selection', (event: DeckTrackerEvent) => {
    console.log(`[deck-tracker] needs-deck-selection candidates=${event.decks?.length ?? 0}`);
    broadcast('deck-tracker:event', {
      type: event.type,
      snapshot: event.snapshot,
      decks: event.decks,
    });
  });

  tracker.start();

  app.on('before-quit', () => {
    tracker?.stop();
    tracker = null;
    cardPlayedDetector = null;
  });
}

function withLiveMatchFingerprint(match: NormalizedCompletedMatch): NormalizedCompletedMatch {
  const identity = liveMatchIdentity.current();
  return identity === null ? match : { ...match, fingerprint: identity.fingerprint };
}

export function getLatestDeckTrackerSnapshot(): DeckTrackerSnapshot | null {
  return tracker?.getSnapshot() ?? null;
}

/**
 * Forward a HearthWatcher PowerEvent to the deck-tracker's
 * global-effects detector. Called from the watcher host alongside
 * the existing match-recorder + recording-recorder dispatches.
 */
export function forwardPowerEventToDeckTracker(
  event: PowerEvent,
  phase: EventPhase = 'live',
): void {
  // Both replay and live events feed the same downstream state — the
  // global-effects registry needs the historical card-played stream
  // to backfill cost stacking and pool data after a mid-match
  // restart, and the tag-overlay reducer wants both as well so the
  // board-attack filter is accurate from the first snapshot.
  // Reset registry + tag overlay BEFORE feeding the create-game event
  // anywhere else: a new match starts here, and any leftover state
  // from a prior match (or from a previous watcher session that's
  // about to be replayed in full) must not survive into the new
  // window. Doing this on the event (rather than on tick-driven
  // phase transitions) avoids races when the watcher's replay pass
  // populates state before the deck-tracker's first tick fires.
  if (event.type === 'create-game') {
    resetPowerEventBuffer();
    resetBoardAttackState();
    cardPlayedDetector?.reset();
    tracker?.resetGlobalEffects();
    // Power.log says actual gameplay is starting — flip the
    // overlay-visibility gate, BUT only for `phase === 'live'`. The
    // hearthwatcher replays the entire current Power.log file on
    // startup so we can rebuild state mid-match; those events carry
    // `phase === 'replay'` and refer to PAST matches, not the
    // current one. Honoring them would mark the gate live the moment
    // HDT_js launches against any non-empty Power.log, even if the
    // user is sitting on the main menu / deck picker.
    //
    // Cleared on phase → IDLE further below.
    if (phase === 'live') {
      setLiveMatchActive(true);
    }
  }
  pushPowerEvent(event);
  const logUpdates = logUpdatesFromPowerEvent(event);
  if (logUpdates.length > 0) {
    tracker?.applyLogDerivedEntityUpdates(logUpdates);
  }
  cardPlayedDetector?.handle(event);
  reducePowerEvent(boardAttackState, event);
  // Phase is currently informational — every consumer above wants
  // both replay and live. Recorders that should NOT receive replay
  // (match-recording-recorder, power-match-recorder) are gated
  // upstream in `hearthwatcher-host.ts`.
  void phase;
}

function logUpdatesFromPowerEvent(event: PowerEvent): LogDerivedEntityUpdate[] {
  switch (event.type) {
    case 'full-entity': {
      const update = baseEntityUpdate(event.entityId, event.tags, event.content);
      update.cardId = event.cardId;
      return [update];
    }
    case 'show-entity':
    case 'change-entity': {
      const entityId = numericEntityRef(event.entity);
      if (entityId === null) return [];
      const update = baseEntityUpdate(entityId, event.tags, event.content);
      update.cardId = event.cardId;
      update.info = { ...update.info, hidden: false };
      return [update];
    }
    case 'hide-entity': {
      const entityId = numericEntityRef(event.entity);
      if (entityId === null) return [];
      const update = baseEntityUpdate(entityId, event.tags, event.content);
      update.info = { ...update.info, hidden: true };
      return [update];
    }
    case 'tag-change': {
      const entityId = numericEntityRef(event.entity);
      if (entityId === null) return [];
      const update = baseEntityUpdate(entityId, {}, event.content, { useRefZone: false });
      if (event.tag === 'ZONE') {
        const zone = zoneFromPowerTag(event.value);
        if (zone !== undefined) update.zone = zone;
        return [update];
      }
      if (event.tag === 'CONTROLLER' || event.tag === 'PLAYER_ID') {
        const controllerId = numericTag(event.value);
        if (controllerId !== undefined) update.controllerId = controllerId;
        return [update];
      }
      if (event.tag === 'MULLIGAN_STATE') {
        update.info = { ...update.info, mulliganed: String(event.value) !== 'INPUT' };
        return [update];
      }
      return hasEntityUpdatePayload(update) ? [update] : [];
    }
    case 'block-start': {
      const entityId = numericEntityRef(event.entity);
      if (entityId === null) return [];
      const update = baseEntityUpdate(entityId, {}, event.content);
      return hasEntityUpdatePayload(update) ? [update] : [];
    }
    case 'create-game':
    case 'block-end':
    case 'shuffle-deck':
      return [];
  }
}

function baseEntityUpdate(
  entityId: number,
  tags: Readonly<Record<string, unknown>>,
  content?: string,
  options: { useRefZone?: boolean } = {},
): LogDerivedEntityUpdate {
  const update: LogDerivedEntityUpdate = { entityId };
  const ref = content === undefined ? {} : entityRefFieldsFromContent(content);
  const zone = zoneFromPowerTag(tags['ZONE']) ?? (options.useRefZone === false ? undefined : ref.zone);
  const controllerId =
    numericTag(tags['CONTROLLER']) ?? numericTag(tags['PLAYER_ID']) ?? ref.controllerId;
  const cardId = ref.cardId;
  if (zone !== undefined) update.zone = zone;
  if (controllerId !== undefined) update.controllerId = controllerId;
  if (cardId !== undefined) update.cardId = cardId;
  return update;
}

function numericEntityRef(ref: unknown): number | null {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') {
    const match = /\bid=(\d+)/i.exec(ref);
    return match ? Number(match[1]) : null;
  }
  return null;
}

function zoneFromPowerTag(value: unknown): Zone | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return zoneFromNumber(value);
  const normalized = String(value).toUpperCase();
  switch (normalized) {
    case 'INVALID':
      return 'INVALID';
    case 'PLAY':
      return 'PLAY';
    case 'DECK':
      return 'DECK';
    case 'HAND':
      return 'HAND';
    case 'GRAVEYARD':
      return 'GRAVEYARD';
    case 'REMOVEDFROMGAME':
      return 'REMOVEDFROMGAME';
    case 'SETASIDE':
      return 'SETASIDE';
    case 'SECRET':
      return 'SECRET';
    default:
      return undefined;
  }
}

function entityRefFieldsFromContent(content: string): {
  cardId?: string;
  controllerId?: number;
  zone?: Zone;
} {
  const match = /\bEntity=\[[^\]]*\]/.exec(content);
  if (!match) return {};
  const ref = match[0];
  const cardIdMatch = /\bcardId=([^\s\]]*)/.exec(ref);
  const playerMatch = /\bplayer=(\d+)/i.exec(ref);
  const zoneMatch = /\bzone=([A-Z]+)/i.exec(ref);
  const fields: { cardId?: string; controllerId?: number; zone?: Zone } = {};
  if (cardIdMatch?.[1]) fields.cardId = cardIdMatch[1];
  if (playerMatch?.[1]) fields.controllerId = Number(playerMatch[1]);
  if (zoneMatch?.[1]) {
    const zone = zoneFromPowerTag(zoneMatch[1]);
    if (zone !== undefined) fields.zone = zone;
  }
  return fields;
}

function hasEntityUpdatePayload(update: LogDerivedEntityUpdate): boolean {
  return (
    update.cardId !== undefined ||
    update.zone !== undefined ||
    update.controllerId !== undefined ||
    update.info !== undefined
  );
}

/**
 * Subscribe to deck-tracker phase transitions. Used by the overlay
 * bootstrap to gate window visibility on whether the player is
 * actively in a match (PRE_MATCH or IN_MATCH) — we don't want the
 * overlay panels showing on the main menu / deck-picker.
 *
 * Returns an unsubscribe function. The callback fires once
 * immediately with the current phase if a tracker is already running.
 */
type PhaseListener = (phase: MatchPhase) => void;
const phaseListeners = new Set<PhaseListener>();
let lastBroadcastPhase: MatchPhase | null = null;

export function onDeckTrackerPhase(cb: PhaseListener): () => void {
  phaseListeners.add(cb);
  // Replay the most recent phase so a new subscriber lines up
  // with the rest of the system without waiting for the next tick.
  if (lastBroadcastPhase !== null) cb(lastBroadcastPhase);
  return () => {
    phaseListeners.delete(cb);
  };
}

function fanoutPhase(phase: MatchPhase): void {
  if (phase === lastBroadcastPhase) return;
  lastBroadcastPhase = phase;
  // Clear the live-match flag whenever the phase machine returns to
  // IDLE — that's the canonical "no game in progress" state. Any
  // subsequent `create-game` PowerEvent will flip it back on.
  if (phase === 'IDLE') setLiveMatchActive(false);
  for (const cb of phaseListeners) {
    try { cb(phase); } catch { /* keep loop healthy */ }
  }
}

type SnapshotListener = (snapshot: DeckTrackerSnapshot) => void;
const snapshotListeners = new Set<SnapshotListener>();

// "Live match active" signal driven by Power.log `create-game` events:
// flipped true when hearthwatcher observes (or replays) a CREATE_GAME
// line and flipped false when the deck-tracker's phase machine returns
// to IDLE. Used to distinguish a real gameplay match from a populated-
// matchInfo lobby / deck-picker — HearthMirror's getMatchInfo can fire
// in those states too, but Power.log only writes CREATE_GAME once
// actual gameplay begins.
type LiveMatchListener = (active: boolean) => void;
const liveMatchListeners = new Set<LiveMatchListener>();
let liveMatchActive = false;

export function onLiveMatchChange(cb: LiveMatchListener): () => void {
  liveMatchListeners.add(cb);
  cb(liveMatchActive);
  return () => {
    liveMatchListeners.delete(cb);
  };
}

function setLiveMatchActive(active: boolean): void {
  if (active === liveMatchActive) return;
  liveMatchActive = active;
  for (const cb of liveMatchListeners) {
    try { cb(active); } catch { /* keep loop healthy */ }
  }
}

export function isLiveMatchActive(): boolean {
  return liveMatchActive;
}

/**
 * Subscribe to every published deck-tracker snapshot. Used by the
 * opponent-deck-prediction IPC to recompute on each tick. Mirrors the
 * `onDeckTrackerPhase` pattern: returns an unsubscribe.
 */
export function onDeckTrackerSnapshotChange(cb: SnapshotListener): () => void {
  snapshotListeners.add(cb);
  return () => {
    snapshotListeners.delete(cb);
  };
}

function fanoutSnapshot(snapshot: DeckTrackerSnapshot): void {
  for (const cb of snapshotListeners) {
    try { cb(snapshot); } catch { /* keep loop healthy */ }
  }
}

export function registerDeckTrackerIpc(): void {
  ipcMain.handle('deck-tracker:get-snapshot', (): DeckTrackerSnapshot | null => {
    return tracker?.getSnapshot() ?? null;
  });

  ipcMain.handle('deck-tracker:select-deck', async (_, deckId: number) => {
    if (tracker !== null) {
      await tracker.selectDeckById(deckId);
    }
  });

  ipcMain.handle('deck-tracker:cancel-selection', () => {
    tracker?.cancelDeckSelection();
  });

  ipcMain.handle(
    'deck-tracker:select-saved-deck',
    (_, savedDeckId: string, savedDeckVersion: number) => {
      tracker?.selectSavedDeck(savedDeckId, savedDeckVersion);
    },
  );

  ipcMain.handle('deck-tracker:clear-saved-deck', () => {
    tracker?.clearSavedDeckAttribution();
  });
}

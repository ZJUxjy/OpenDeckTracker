import type { PowerEvent } from '@hdt/hearthwatcher';
import type { CardPlayedEvent } from './types';

interface KnownEntity {
  cardId: string;
  controllerId: number;
  /**
   * Last observed ZONE value (HearthMirror string form). The detector
   * uses this to gate `cardPlayed` emits to actual transitions INTO
   * PLAY — without it, redundant TAG_CHANGE refreshes (or PLAY→PLAY
   * no-ops) would over-emit. Stays `null` until we see the first ZONE
   * tag for the entity.
   */
  zone: string | null;
}

/**
 * Stateful detector that turns the raw HearthWatcher PowerEvent stream
 * into `CardPlayedEvent` calls. We watch FULL_ENTITY / SHOW_ENTITY to
 * keep a tiny `entityId → { cardId, controllerId }` table, and emit a
 * `cardPlayed` whenever we see a TAG_CHANGE moving an entity's ZONE
 * to PLAY (or HAND→PLAY equivalents). The event also carries whether
 * the play was a manual HAND-origin play; effect replays / random casts
 * still emit for global effects, but downstream "cards you played"
 * counters can opt out.
 *
 * Intentionally minimal: no graveyard tracking, no block-aware
 * filtering — the global-effects registry is idempotent on
 * re-triggers, so an extra fire here costs nothing. Living in core
 * keeps it Vitest-friendly and lets the renderer get the same view
 * via the snapshot.
 */
/**
 * Tight time window (ms) for suppressing duplicate fires from the same
 * entity. Hearthstone's Power.log mirrors every play through both the
 * GameState and PowerTaskList streams (~1-2s apart), so a per-entity
 * "fired within the last N ms" guard kills the duplicate cleanly.
 * Bounce-and-replay scenarios are seconds apart so they're unaffected.
 */
const REFIRE_SUPPRESS_MS = 3000;

export class CardPlayedDetector {
  private readonly entities = new Map<number, KnownEntity>();
  private readonly lastFiredAt = new Map<number, number>();
  private readonly emit: (event: CardPlayedEvent) => void;
  private readonly clock: () => number;

  constructor(args: {
    emit: (event: CardPlayedEvent) => void;
    clock?: () => number;
  }) {
    this.emit = args.emit;
    this.clock = args.clock ?? (() => Date.now());
  }

  reset(): void {
    this.entities.clear();
    this.lastFiredAt.clear();
  }

  handle(event: PowerEvent): void {
    if (event.type === 'full-entity') {
      this.recordEntity(event.entityId, event.cardId, event.tags);
      return;
    }
    if (event.type === 'show-entity') {
      const id = entityIdOf(event.entity);
      if (id === null) return;
      this.recordEntity(id, event.cardId, event.tags);
      return;
    }
    if (event.type === 'change-entity') {
      const id = entityIdOf(event.entity);
      if (id === null) return;
      const known = this.entities.get(id);
      if (known && event.cardId !== '') {
        known.cardId = event.cardId;
      }
      return;
    }
    if (event.type === 'block-start') {
      // BLOCK_START blockType=PLAY is the canonical "card N is being
      // played" signal in HS Power.log. Fires for spells (where ZONE
      // briefly passes through PLAY before going to GRAVEYARD, which
      // can be missed by a TAG_CHANGE-only watcher) and for minions
      // entering play. The `effectCardId` is usually empty here; we
      // resolve cardId from the tracked entity table.
      if (event.blockType !== 'PLAY') return;
      const id = entityIdOf(event.entity);
      if (id === null) return;
      this.maybeBackfillFromRef(id, event.entity);
      this.maybeBackfillFromRef(id, event.content, { overwriteController: true });
      this.tryFire(id);
      return;
    }
    if (event.type === 'tag-change') {
      const id = entityIdOf(event.entity);
      if (id === null) return;
      this.maybeBackfillFromRef(id, event.entity);
      this.maybeBackfillFromRef(id, event.content, {
        overwriteController: event.tag === 'ZONE' && (event.value === 'PLAY' || event.value === 1),
      });
      if (event.tag === 'CONTROLLER') {
        const known = this.entities.get(id);
        const ctrl = numberOf(event.value);
        if (known && ctrl !== null) known.controllerId = ctrl;
        return;
      }
      if (event.tag !== 'ZONE') return;
      const value = String(event.value);
      const known = this.entities.get(id);
      if (!known) return;
      const previousZone = known.zone;
      known.zone = value;
      const isPlayTransition = value === 'PLAY' || value === '1';
      if (!isPlayTransition) return;
      // Suppress PLAY→PLAY no-ops AND duplicates against a recent
      // BLOCK_START fire (which already set zone='PLAY'). The first
      // time we see an entity we genuinely don't know its prior zone,
      // so a non-PLAY → PLAY transition through a `null` previousZone
      // still fires.
      if (previousZone === 'PLAY' || previousZone === '1') return;
      if (known.cardId === '' || known.controllerId === 0) return;
      this.fireEmit(id, known, isHandZone(previousZone));
    }
  }

  private fireEmit(entityId: number, known: KnownEntity, isManualPlay: boolean): void {
    const now = this.clock();
    const prevFire = this.lastFiredAt.get(entityId);
    if (prevFire !== undefined && now - prevFire < REFIRE_SUPPRESS_MS) {
      // Recent dual-stream replay (GameState + PowerTaskList for the
      // same play). Don't double-record. Bounce-and-replay legitimate
      // re-fires happen on a much longer cadence (>3s).
      return;
    }
    this.lastFiredAt.set(entityId, now);
    this.emit({
      cardId: known.cardId,
      controllerId: known.controllerId,
      entityId,
      timestamp: now,
      isManualPlay,
    });
  }

  /**
   * Real Power.log lines embed `cardId=` / `player=N` inside the
   * entity ref bracket — useful as a backstop when an entity wasn't
   * announced via FULL_ENTITY / SHOW_ENTITY first (e.g. opponent's
   * card we never saw the deck origin of). Pulls cardId / controllerId
   * from a stringy `entity=[entityName=... id=N cardId=X player=Y]`
   * ref into the tracked record.
   */
  private maybeBackfillFromRef(
    entityId: number,
    ref: number | string | null | undefined,
    options: { overwriteController?: boolean } = {},
  ): void {
    if (typeof ref !== 'string') return;
    const cardIdMatch = /\bcardId=([A-Za-z0-9_]+)/.exec(ref);
    const playerMatch = /\bplayer=(\d+)/i.exec(ref);
    const zoneMatch = /\bzone=([A-Za-z0-9_]+)/i.exec(ref);
    if (!cardIdMatch && !playerMatch && !zoneMatch) return;
    const existing = this.entities.get(entityId) ?? {
      cardId: '',
      controllerId: 0,
      zone: null,
    };
    if (existing.cardId === '' && cardIdMatch) existing.cardId = cardIdMatch[1] ?? '';
    if ((existing.controllerId === 0 || options.overwriteController === true) && playerMatch) {
      existing.controllerId = Number(playerMatch[1]);
    }
    if (zoneMatch) existing.zone = zoneMatch[1] ?? existing.zone;
    this.entities.set(entityId, existing);
  }

  private tryFire(entityId: number): void {
    const known = this.entities.get(entityId);
    if (!known || known.cardId === '' || known.controllerId === 0) return;
    // Dedupe against a follow-up TAG_CHANGE ZONE=PLAY by setting the
    // zone state ourselves — the TAG_CHANGE handler short-circuits
    // when previousZone is already PLAY.
    if (known.zone === 'PLAY' || known.zone === '1') return;
    const isManualPlay = isHandZone(known.zone);
    known.zone = 'PLAY';
    this.fireEmit(entityId, known, isManualPlay);
  }

  private recordEntity(
    entityId: number,
    cardId: string,
    tags: Record<string, unknown>,
  ): void {
    // Real Hearthstone Power.log embeds the controller as `player=N`
    // inside the entity ref bracket; HearthWatcher's parser surfaces
    // that under tag key `PLAYER_ID`. The synthetic `tag=CONTROLLER`
    // form is rare in practice. Read both, prefer CONTROLLER if both
    // are present.
    const controllerId =
      numberOf(tags['CONTROLLER']) ?? numberOf(tags['PLAYER_ID']) ?? 0;
    const zone = readTagString(tags['ZONE']);
    const existing = this.entities.get(entityId);
    if (existing) {
      if (cardId !== '') existing.cardId = cardId;
      if (controllerId !== 0) existing.controllerId = controllerId;
      if (zone !== null) existing.zone = zone;
      return;
    }
    this.entities.set(entityId, { cardId, controllerId, zone });
  }
}

function entityIdOf(ref: number | string | null | undefined): number | null {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') {
    // Word-boundary anchored — the parsed ref strings carry richer
    // descriptions like `[entityName=X id=12 zone=HAND ... player=2]`,
    // and we want the entity id specifically (not e.g. an upstream
    // `playerid=N`).
    const match = /\bid=(\d+)/i.exec(ref);
    if (match) return Number(match[1]);
  }
  return null;
}

function readTagString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function numberOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isHandZone(zone: string | null): boolean {
  const normalized = zone?.toUpperCase();
  return normalized === 'HAND' || normalized === '3';
}

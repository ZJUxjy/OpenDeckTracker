import type { PowerEvent } from '@hdt/hearthwatcher';
import type { CardPlayedEvent, ExtractCtx } from '../../../global-effects/types';
import type {
  DeckPositionExtractor,
  DeckPositionPlacement,
} from '../types';

/**
 * Waveshaping (波涛形塑 / TIME_701), Druid 1-mana spell:
 *
 *   "Discover a card from your deck. The others get put on the bottom."
 *
 * Power.log shape around the cast:
 *
 *   BLOCK_START Entity=[entityID=N CardID=TIME_701 ...]
 *     SHOW_ENTITY     id=A CardID=CARD_X ZONE=SETASIDE
 *     SHOW_ENTITY     id=B CardID=CARD_Y ZONE=SETASIDE
 *     SHOW_ENTITY     id=C CardID=CARD_Z ZONE=SETASIDE
 *     (user picks one — UI prompt; can take seconds)
 *     TAG_CHANGE      Entity=[A] tag=ZONE value=HAND        ← chosen
 *     TAG_CHANGE      Entity=[B] tag=ZONE value=DECK        ← bottom
 *     TAG_CHANGE      Entity=[C] tag=ZONE value=DECK        ← bottom
 *   BLOCK_END
 *
 * We collect entityId → cardId from the SHOW_ENTITY / FULL_ENTITY
 * phase, then walk forward looking for two TAG_CHANGE/ZONE=DECK events
 * and resolve their cardIds.
 *
 * The user's Discover pick can take several seconds; the extractor
 * polls `ctx.waitForMoreEvents` until it sees the 2 ZONE→DECK
 * transitions or a generous timeout elapses.
 */
const WAVESHAPING_CARD_ID = 'TIME_701';

export interface WaveshapingExtractorOptions {
  /** Total budget (ms) before giving up if events never arrive. */
  waitMs?: number;
  /** Per-poll step (ms) for `ctx.waitForMoreEvents`. */
  pollStepMs?: number;
}

export const WAVESHAPING_DEFAULTS = {
  // Discover prompts can sit on screen for tens of seconds while the
  // user reads three full cards. We wait generously; the cost is just
  // an inactive timer.
  waitMs: 60_000,
  pollStepMs: 300,
} as const;

export function makeWaveshapingExtractor(
  options?: WaveshapingExtractorOptions,
): DeckPositionExtractor {
  const waitMs = options?.waitMs ?? WAVESHAPING_DEFAULTS.waitMs;
  const pollStepMs = options?.pollStepMs ?? WAVESHAPING_DEFAULTS.pollStepMs;
  return {
    triggerCardId: WAVESHAPING_CARD_ID,
    async extract(
      event: CardPlayedEvent,
      ctx: ExtractCtx,
    ): Promise<DeckPositionPlacement[] | null> {
      let result = tryExtract(ctx.recentEvents, event);
      if (result !== null) return result;

      const deadline = Date.now() + waitMs;
      let lastEventBuffer: readonly PowerEvent[] = ctx.recentEvents;
      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        const step = Math.min(pollStepMs, remaining);
        const more = await ctx.waitForMoreEvents(step);
        lastEventBuffer = more;
        result = tryExtract(more, event);
        if (result !== null) return result;
      }
      // Timed out — log the events around the cast so we can see what
      // HS actually emitted and adjust the matching strategy.
      logEventsAroundCast(lastEventBuffer, event);
      return null;
    },
  };
}

function logEventsAroundCast(
  events: readonly PowerEvent[],
  event: CardPlayedEvent,
): void {
  const start = findBlockStart(events, event.entityId);
  if (start < 0) {
     
    console.warn(
      `[deck-position] waveshaping diag: no BLOCK_START with entity=${event.entityId} found in buffer of ${events.length} events`,
    );
    // Dump every BLOCK_START in the buffer so we can see what
    // entities Hearthstone actually used.
    let dumped = 0;
    for (let i = events.length - 1; i >= 0 && dumped < 20; i -= 1) {
      const ev = events[i];
      if (!ev || ev.type !== 'block-start') continue;
       
      console.warn(
        `  block-start at index ${i}: blockType=${ev.blockType} entity=${ev.entity} effectCardId=${ev.effectCardId}`,
      );
      dumped += 1;
    }
    // Also dump any FULL_ENTITY / SHOW_ENTITY / CHANGE_ENTITY whose
    // cardId is TIME_701, so we can correlate to the actual cast.
    let cardDumped = 0;
    for (let i = events.length - 1; i >= 0 && cardDumped < 10; i -= 1) {
      const ev = events[i];
      if (!ev) continue;
      const hasCardId =
        (ev.type === 'full-entity' ||
          ev.type === 'show-entity' ||
          ev.type === 'change-entity') &&
        ev.cardId === 'TIME_701';
      if (!hasCardId) continue;
      const id = ev.type === 'full-entity' ? ev.entityId : ev.entity;
       
      console.warn(
        `  ${ev.type} at index ${i}: entity=${id} cardId=${ev.cardId}`,
      );
      cardDumped += 1;
    }
    return;
  }
  const end = Math.min(events.length, start + 80);
   
  console.warn(
    `[deck-position] waveshaping diag: BLOCK_START at index ${start}, dumping ${end - start} subsequent events:`,
  );
  for (let i = start; i < end; i += 1) {
    const ev = events[i];
    if (!ev) continue;
    const offset = i - start;
    let summary: string;
    switch (ev.type) {
      case 'block-start':
        summary = `BLOCK_START blockType=${ev.blockType} entity=${ev.entity} effectCardId=${ev.effectCardId}`;
        break;
      case 'block-end':
        summary = `BLOCK_END`;
        break;
      case 'show-entity':
        summary = `SHOW_ENTITY entity=${ev.entity} cardId=${ev.cardId} zone=${ev.tags['ZONE'] ?? '?'}`;
        break;
      case 'full-entity':
        summary = `FULL_ENTITY entityId=${ev.entityId} cardId=${ev.cardId} zone=${ev.tags['ZONE'] ?? '?'}`;
        break;
      case 'change-entity':
        summary = `CHANGE_ENTITY entity=${ev.entity} cardId=${ev.cardId} zone=${ev.tags['ZONE'] ?? '?'}`;
        break;
      case 'hide-entity':
        summary = `HIDE_ENTITY entity=${ev.entity} zone=${ev.tags['ZONE'] ?? '?'}`;
        break;
      case 'tag-change':
        summary = `TAG_CHANGE entity=${ev.entity} ${ev.tag}=${ev.value}`;
        break;
      default:
        summary = `${ev.type}`;
    }
     
    console.warn(`  [+${offset}] ${summary}`);
  }
}

/** Default production extractor — used by the registry. */
export const waveshapingExtractor = makeWaveshapingExtractor();

interface Candidate {
  /** The COPY entity HS creates inside SETASIDE for the Discover prompt. */
  copyEntityId: number;
  /** cardId revealed on the FULL_ENTITY for this copy. */
  cardId: string;
  /** The ORIGINAL entity ID in the player's deck this copy was made from. */
  originalEntityId?: number;
  /**
   * True once we've seen `CREATOR=<castEntityId>` for this entity —
   * differentiates the 3 Discover copies from any unrelated entities
   * Hearthstone happens to spawn in nearby blocks.
   */
  spawnedByCast: boolean;
}

/**
 * Reconstruct the Discover outcome from the PowerEvent buffer.
 *
 * Hearthstone's "Discover a card from your deck" mechanic doesn't
 * actually move the originals to SETASIDE. It COPIES them into three
 * brand-new entities (TAG `CREATOR=<castEntityId>`, `COPIED_FROM_ENTITY_ID=<originalId>`)
 * inside SETASIDE for the Discover prompt. When the player picks:
 *   - the ORIGINAL entity of the chosen card moves DECK → HAND
 *   - the other two ORIGINALS stay in DECK with their position pushed
 *     to the bottom (no ZONE change — they never leave DECK)
 *   - the three COPY entities get cleaned up
 *
 * So the algorithm is:
 *   1. find BLOCK_START whose `entity === castEntityId`
 *   2. walk forward (PAST `block-end` — the user's pick happens later)
 *      collecting Candidate{copyId,cardId,originalEntityId,spawnedByCast}
 *   3. watch for ZONE→HAND on any candidate's COPY or ORIGINAL — that
 *      identifies the chosen one
 *   4. the other two cardIds get returned as bottom placements
 */
function tryExtract(
  events: readonly PowerEvent[],
  event: CardPlayedEvent,
): DeckPositionPlacement[] | null {
  const start = findBlockStart(events, event.entityId);
  if (start < 0) return null;

  const byCopyId = new Map<number, Candidate>();

  const ensureCandidate = (id: number): Candidate => {
    let existing = byCopyId.get(id);
    if (!existing) {
      existing = { copyEntityId: id, cardId: '', spawnedByCast: false };
      byCopyId.set(id, existing);
    }
    return existing;
  };

  for (let i = start + 1; i < events.length; i += 1) {
    const ev = events[i];
    if (!ev) continue;

    if (ev.type === 'full-entity' && ev.cardId.length > 0) {
      const c = ensureCandidate(ev.entityId);
      c.cardId = ev.cardId;
      continue;
    }
    if (ev.type === 'show-entity' || ev.type === 'change-entity') {
      const id = entityIdFromRef(ev.entity);
      if (id === null) continue;
      if (ev.cardId.length > 0) {
        const c = ensureCandidate(id);
        c.cardId = ev.cardId;
      }
      continue;
    }
    if (ev.type !== 'tag-change') continue;

    const id = entityIdFromRef(ev.entity);
    if (id === null) continue;

    if (ev.tag === 'CREATOR') {
      const creator = Number(ev.value);
      if (!Number.isNaN(creator) && creator === event.entityId) {
        ensureCandidate(id).spawnedByCast = true;
      }
      continue;
    }
    if (ev.tag === 'COPIED_FROM_ENTITY_ID') {
      const orig = Number(ev.value);
      if (!Number.isNaN(orig)) ensureCandidate(id).originalEntityId = orig;
      continue;
    }
    if (ev.tag === 'ZONE' && (ev.value === 'HAND' || ev.value === 3)) {
      // ZONE → HAND on (a) one of the 3 copies, or (b) the original
      // entity behind one of the 3 copies. Either way it identifies
      // the chosen Discover candidate.
      const chosenCopy = byCopyId.get(id);
      let chosen: Candidate | undefined;
      if (chosenCopy?.spawnedByCast) {
        chosen = chosenCopy;
      } else {
        for (const c of byCopyId.values()) {
          if (c.spawnedByCast && c.originalEntityId === id) {
            chosen = c;
            break;
          }
        }
      }
      if (!chosen) continue;
      const unchosen = Array.from(byCopyId.values()).filter(
        (c) => c.spawnedByCast && c !== chosen && c.cardId.length > 0,
      );
      if (unchosen.length < 2) continue;
      return unchosen.slice(0, 2).map((c) => ({
        cardId: c.cardId,
        controllerId: event.controllerId,
        placement: 'bottom',
        sourceCardId: WAVESHAPING_CARD_ID,
      }));
    }
  }

  return null;
}

function entityIdFromRef(ref: number | string | null): number | null {
  if (ref === null) return null;
  if (typeof ref === 'number') return ref;
  const m = /\bid=(\d+)/i.exec(ref);
  return m ? Number(m[1]) : null;
}

function findBlockStart(
  events: readonly PowerEvent[],
  entityId: number,
): number {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (!ev) continue;
    if (ev.type === 'block-start' && ev.entity === entityId) {
      return i;
    }
  }
  return -1;
}

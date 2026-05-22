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
  waitMs: 5_000,
  pollStepMs: 250,
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
      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        const step = Math.min(pollStepMs, remaining);
        const more = await ctx.waitForMoreEvents(step);
        result = tryExtract(more, event);
        if (result !== null) return result;
      }
      return null;
    },
  };
}

/** Default production extractor — used by the registry. */
export const waveshapingExtractor = makeWaveshapingExtractor();

/**
 * Scan a window of events for the 2 unchosen Discover cards that end
 * up on the bottom of the player's deck after the cast.
 */
function tryExtract(
  events: readonly PowerEvent[],
  event: CardPlayedEvent,
): DeckPositionPlacement[] | null {
  const start = findBlockStart(events, event.entityId);
  if (start < 0) return null;

  const entityToCardId = new Map<number, string>();
  const placements: DeckPositionPlacement[] = [];

  for (let i = start + 1; i < events.length; i += 1) {
    const ev = events[i];
    if (!ev) continue;
    if (ev.type === 'block-end') break;

    if (ev.type === 'show-entity' || ev.type === 'change-entity') {
      const id = entityIdFromRef(ev.entity);
      if (id !== null && ev.cardId.length > 0) {
        entityToCardId.set(id, ev.cardId);
      }
    } else if (ev.type === 'full-entity') {
      if (ev.cardId.length > 0) {
        entityToCardId.set(ev.entityId, ev.cardId);
      }
    } else if (ev.type === 'tag-change' && ev.tag === 'ZONE') {
      if (!isDeckZoneValue(ev.value)) continue;
      const id = entityIdFromRef(ev.entity);
      if (id === null) continue;
      const cardId = entityToCardId.get(id);
      if (!cardId) continue;
      placements.push({
        cardId,
        controllerId: event.controllerId,
        placement: 'bottom',
        sourceCardId: WAVESHAPING_CARD_ID,
      });
      if (placements.length >= 2) break;
    }
  }

  if (placements.length < 2) return null;
  return placements.slice(0, 2);
}

function isDeckZoneValue(value: unknown): boolean {
  return value === 2 || value === 'DECK';
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

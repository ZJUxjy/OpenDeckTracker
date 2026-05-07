import type { FullEntityEvent, PowerEvent, ShowEntityEvent } from '@hdt/hearthwatcher';
import type { CardPlayedEvent, ExtractCtx } from './types';

/**
 * Window (in PowerEvents) the extractor looks at after the cast event
 * before giving up. The actual "3 random beasts" spawn typically lands
 * inside the same play block, well within ~50 events; bumping this is
 * cheap and gives us slack for noisy mid-game ticks.
 */
const DEFAULT_LOOKAHEAD = 200;

/**
 * Default timeout in ms when the host blocks waiting for more events.
 * Hearthstone surfaces the new Animal Companion pool effectively
 * synchronously with the play; if we don't see it within a few hundred
 * ms the log is truncated and we should give up.
 */
const DEFAULT_WAIT_MS = 1500;

/**
 * Extract the next `count` distinct cardIds spawned in the wake of the
 * cast event. Returns `null` if the spawn count never reaches `count`
 * within the lookahead window + one optional wait.
 *
 * Used by the `tame-pet` EffectDef to derive the 3-beast Animal
 * Companion pool. Generic enough to be reused by other "discover N
 * cards" effects in the future.
 */
export async function readBeastSpawnsAfter(
  event: CardPlayedEvent,
  ctx: ExtractCtx,
  count: number,
  options?: { lookahead?: number; waitMs?: number },
): Promise<string[] | null> {
  const lookahead = options?.lookahead ?? DEFAULT_LOOKAHEAD;
  const waitMs = options?.waitMs ?? DEFAULT_WAIT_MS;

  const found = scanForSpawns(ctx.recentEvents, event, count, lookahead);
  if (found.length >= count) return found.slice(0, count);

  // Try one more pass after waiting for additional events.
  const more = await ctx.waitForMoreEvents(waitMs);
  const second = scanForSpawns(more, event, count, lookahead);
  if (second.length >= count) return second.slice(0, count);

  return null;
}

function scanForSpawns(
  events: readonly PowerEvent[],
  cast: CardPlayedEvent,
  count: number,
  lookahead: number,
): string[] {
  const startIdx = findCastIndex(events, cast);
  if (startIdx === -1) return [];

  const spawns: string[] = [];
  const seen = new Set<string>();
  const end = Math.min(events.length, startIdx + 1 + lookahead);

  for (let i = startIdx + 1; i < end; i++) {
    const ev = events[i];
    if (!ev) continue;
    const cardId = pickSpawnedCardId(ev);
    if (!cardId) continue;
    if (cardId === cast.cardId) continue; // skip the cast itself's echo.
    if (seen.has(cardId)) continue;
    seen.add(cardId);
    spawns.push(cardId);
    if (spawns.length >= count) break;
  }
  return spawns;
}

/**
 * Find the index of the cast event in the parsed stream. We match on
 * the first FullEntity / ShowEntity / BlockStart whose effectCardId
 * equals the cast cardId. Falls back to -1 (not found).
 */
function findCastIndex(
  events: readonly PowerEvent[],
  cast: CardPlayedEvent,
): number {
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev) continue;
    if (ev.type === 'block-start' && ev.effectCardId === cast.cardId) return i;
    if ((ev.type === 'full-entity' || ev.type === 'show-entity' ||
         ev.type === 'change-entity') && ev.cardId === cast.cardId) {
      return i;
    }
  }
  return -1;
}

function pickSpawnedCardId(event: PowerEvent): string | null {
  if (event.type === 'full-entity' || event.type === 'show-entity') {
    return readCardId(event);
  }
  return null;
}

function readCardId(event: FullEntityEvent | ShowEntityEvent): string | null {
  if (event.cardId === '') return null;
  return event.cardId;
}

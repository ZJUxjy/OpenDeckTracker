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
 * Hearthstone's pool-replacement cards (Tame Pet / Migrating Elekk /
 * Roam Free) ALWAYS dump 6 unique cardIds in the cast block:
 *
 *   spawn[0..2]: the CURRENT Animal Companion pool (gets replaced).
 *                For the first replacement of the match this is the
 *                NEW1_032/033/034 trio (Misha/Leokk/Huffer); for any
 *                subsequent replacement it's whatever the previous
 *                replacement chose.
 *   spawn[3..5]: the NEW pool that this cast establishes.
 *   spawn[6..8]: duplicates of [3..5] (internal HS bookkeeping).
 *
 * The user wants the NEW pool, so we skip the first 3 unique cardIds
 * and return the next 3. This generalises across all chain-replace
 * scenarios — no need to maintain an "originals" denylist.
 */
const POOL_REPLACEMENT_SKIP = 3;

/**
 * Extract the next `count` distinct cardIds spawned in the wake of the
 * cast event. Returns `null` if the spawn count never reaches `count`
 * within the total wait budget.
 *
 * Implemented as a polling loop because HearthWatcher emits PowerEvents
 * one-at-a-time as the file is read; `waitForMoreEvents` only resolves
 * after the *next* event arrives. Without a loop, the extractor would
 * see only one extra event and give up — even though all the spawns
 * are about to land.
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
  const deadline = Date.now() + waitMs;

  // eslint-disable-next-line no-console
  console.log(
    `[global-effects] extractor START cardId=${event.cardId} entityId=${event.entityId} bufferSize=${ctx.recentEvents.length}`,
  );

  let found = scanForSpawns(ctx.recentEvents, event, count, lookahead);
  if (found.length >= count) {
    // eslint-disable-next-line no-console
    console.log(
      `[global-effects] extractor PASS-1 cardId=${event.cardId} pool=${found.slice(0, count).join(',')}`,
    );
    return found.slice(0, count);
  }

  const STEP_MS = 200;
  let attempts = 0;
  while (true) {
    attempts++;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[global-effects] extractor TIMEOUT cardId=${event.cardId} attempts=${attempts} found=${found.join(',')}`,
      );
      return null;
    }
    const stepMs = Math.min(STEP_MS, remaining);
    const more = await ctx.waitForMoreEvents(stepMs);
    found = scanForSpawns(more, event, count, lookahead);
    if (found.length >= count) {
      // eslint-disable-next-line no-console
      console.log(
        `[global-effects] extractor PASS-N cardId=${event.cardId} attempts=${attempts} pool=${found.slice(0, count).join(',')}`,
      );
      return found.slice(0, count);
    }
  }
}

function scanForSpawns(
  events: readonly PowerEvent[],
  cast: CardPlayedEvent,
  count: number,
  lookahead: number,
): string[] {
  const startIdx = findCastIndex(events, cast);
  // eslint-disable-next-line no-console
  console.log(
    `[global-effects] extractor scan cardId=${cast.cardId} entityId=${cast.entityId} startIdx=${startIdx} bufferSize=${events.length}`,
  );
  if (startIdx === -1) return [];

  // Position-based extraction. Hearthstone always emits the spawn
  // block in a fixed slot order regardless of cardId duplication:
  //
  //   spawn[0..2]: old pool (current pool being replaced)
  //   spawn[3..5]: new pool (what this cast establishes)
  //   spawn[6+]:   duplicates / internal copies
  //
  // Using positions instead of unique-cardId counts handles the case
  // where the new pool happens to overlap with the old pool (random
  // chance picks one of the same cardIds): in that case there'd be
  // fewer than 6 unique cardIds total, and a unique-based scanner
  // would never find the new pool. Position-based always works.
  const spawnCardIds: string[] = [];
  const targetCount = POOL_REPLACEMENT_SKIP + count;
  const end = Math.min(events.length, startIdx + 1 + lookahead);

  for (let i = startIdx + 1; i < end; i++) {
    const ev = events[i];
    if (!ev) continue;
    const cardId = pickSpawnedCardId(ev);
    if (!cardId) continue;
    if (cardId === cast.cardId) continue; // skip the cast itself's echo.
    spawnCardIds.push(cardId);
    if (spawnCardIds.length >= targetCount) break;
  }

  if (spawnCardIds.length < targetCount) return [];
  return spawnCardIds.slice(POOL_REPLACEMENT_SKIP, POOL_REPLACEMENT_SKIP + count);
}

/**
 * Find the index of the cast's BLOCK_START in the parsed stream.
 * Matches by `entity` (the HS engine entity id) — the parser strips
 * cardId from bracket entity refs, so entityId is the only stable
 * handle. We scan from the end so a player who casts the same card
 * twice in a long match resolves to the latest cast.
 */
function findCastIndex(
  events: readonly PowerEvent[],
  cast: CardPlayedEvent,
): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (!ev) continue;
    if (ev.type === 'block-start' && ev.blockType === 'PLAY' && ev.entity === cast.entityId) {
      return i;
    }
  }
  // Fallback: cast's BLOCK_START got rotated out of the buffer (cast
  // happened a long time ago). Try matching by cardId — less precise
  // but better than nothing.
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (!ev) continue;
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

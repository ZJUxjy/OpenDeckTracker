/**
 * Global-effects domain types.
 *
 * A "global effect" is a persistent match-wide modifier introduced by
 * playing a specific card (e.g. Cleansing Cleric's healing buff,
 * Tame Pet's Animal Companion pool replacement). The registry tracks
 * which effects are live for each player so the renderer can surface
 * them in a dedicated tab.
 *
 * Catalog entries live under `catalog/<id>.ts` and are aggregated by
 * `catalog/index.ts`. The registry consumes the catalog plus the
 * upstream `card:played` event stream.
 */

import type { PowerEvent } from '@hdt/hearthwatcher';

/** Game mode the effect applies to. M1 catalog ships only Standard. */
export type GameMode =
  | 'STANDARD'
  | 'WILD'
  | 'TWIST'
  | 'ARENA'
  | 'BATTLEGROUNDS'
  | 'MERCENARIES';

/**
 * Optional rule for when an active effect should drop off the
 * registry. M1 ships no concrete rules — every Standard global effect
 * we surface is "rest of the match" — but the slot is reserved so a
 * later patch can remove an effect (e.g. opponent counter, expiry on
 * round count) without a schema migration.
 */
export type ExpireRule =
  | { kind: 'never' }
  | { kind: 'after-turns'; turns: number }
  | { kind: 'on-card-played'; cardId: string };

/**
 * Minimal "card was played" signal the registry consumes. Derived in
 * the main process from HearthWatcher's PowerEvent stream and forwarded
 * to the per-game registry.
 */
export interface CardPlayedEvent {
  cardId: string;
  controllerId: number;
  /** Wall-clock ms; the registry stamps `triggeredAt` from this. */
  timestamp: number;
}

/**
 * Context handed to a `parameterExtractor` so it can introspect the
 * upstream event stream without re-parsing raw log lines.
 *
 * `recentEvents` is a bounded ring of HearthWatcher events the host
 * already saw; the extractor reads forward in time from the cast event
 * to gather follow-up SHOW_ENTITY / FULL_ENTITY entries.
 */
export interface ExtractCtx {
  /** Events the host has already observed, oldest → newest. */
  recentEvents: readonly PowerEvent[];
  /** Wait for additional events; resolves when the buffer extends or a timeout fires. */
  waitForMoreEvents: (timeoutMs: number) => Promise<readonly PowerEvent[]>;
}

/**
 * Catalog entry. One per known global effect; default-exported from
 * `catalog/<id>.ts`.
 */
export interface EffectDef<P = unknown> {
  /** Kebab-case unique id; equal to the file basename in `catalog/`. */
  readonly id: string;
  /** hsdata cardId whose play triggers the effect. */
  readonly sourceCardId: string;
  /**
   * Side that owns the effect. M1 only supports `'caster'`: whoever
   * played the source card gets the effect, full stop.
   */
  readonly side: 'caster';
  /** Mode filter. M1 ships `'STANDARD'`. */
  readonly mode: GameMode;
  /**
   * Optional async parameter extractor. Returns `null` to mark the
   * effect as parameter-less (extractor failed or the data isn't
   * available); the registry stores the effect either way.
   */
  readonly parameterExtractor?: (
    event: CardPlayedEvent,
    ctx: ExtractCtx,
  ) => Promise<P | null>;
  /** Reserved for future expiry rules; M1 does not instantiate any. */
  readonly expiresOn?: ExpireRule;
}

/**
 * Per-side per-effect snapshot entry. Plain JSON so the structure
 * round-trips through Electron IPC unchanged.
 */
export interface ActiveEffect<P = unknown> {
  /** Originating `EffectDef.id`. */
  id: string;
  /** Denormalized `EffectDef.sourceCardId`, saves the renderer a join. */
  sourceCardId: string;
  /** Wall-clock ms when the registry first observed the trigger. */
  triggeredAt: number;
  /**
   * Number of times the effect has fired this match. Stacking effects
   * (Free Spirit, Lightshow, etc.) MUST surface this so the renderer
   * can show "×N" — the body string alone hides the actual magnitude.
   */
  triggerCount: number;
  /** Extracted params; absent when the extractor wasn't declared OR returned null. */
  params?: P;
}

/** Shared param shape for Animal Companion pool replacements (Tame Pet, Roam Free). */
export interface AnimalCompanionPoolParams {
  pool: string[];
}

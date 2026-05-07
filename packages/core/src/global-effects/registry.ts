import type {
  ActiveEffect,
  CardPlayedEvent,
  EffectDef,
  ExtractCtx,
} from './types';

export interface GlobalEffectsRegistryArgs {
  /** Map from `EffectDef.sourceCardId` → `EffectDef`. */
  catalogIndex: ReadonlyMap<string, EffectDef>;
  /** Wall-clock provider; injected for tests. */
  now: () => number;
  /** Local-player controller id (matches `Game.localPlayer.controllerId`). */
  localControllerId: number;
  /** Opposing-player controller id. */
  opposingControllerId: number;
  /**
   * Optional context provider for parameterized effects. The registry
   * calls this lazily when an effect with `parameterExtractor` fires.
   * If not provided, parameterized effects degrade to `params: undefined`.
   */
  extractCtx?: () => ExtractCtx;
}

interface RegistrySnapshot {
  local: ActiveEffect[];
  opposing: ActiveEffect[];
}

/**
 * Per-`Game` lifecycle store of active global effects. The registry
 * is purely state — it does not subscribe to event buses on its own;
 * the host MUST call `handleCardPlayed` for every relevant event and
 * `reset()` between matches.
 */
export class GlobalEffectsRegistry {
  private readonly catalogIndex: ReadonlyMap<string, EffectDef>;
  private readonly now: () => number;
  private readonly localControllerId: number;
  private readonly opposingControllerId: number;
  private readonly extractCtx?: () => ExtractCtx;
  private localEffects = new Map<string, ActiveEffect>();
  private opposingEffects = new Map<string, ActiveEffect>();

  constructor(args: GlobalEffectsRegistryArgs) {
    this.catalogIndex = args.catalogIndex;
    this.now = args.now;
    this.localControllerId = args.localControllerId;
    this.opposingControllerId = args.opposingControllerId;
    if (args.extractCtx !== undefined) this.extractCtx = args.extractCtx;
  }

  /**
   * Forward a played-card event from the host. Unknown cardIds are
   * silently ignored. Re-triggering an already-active effect refreshes
   * `triggeredAt` and re-runs the parameter extractor (if any).
   */
  handleCardPlayed(event: CardPlayedEvent): void {
    const def = this.catalogIndex.get(event.cardId);
    if (!def) return;

    const map = this.mapForController(event.controllerId);
    if (!map) return;

    const active: ActiveEffect = {
      id: def.id,
      sourceCardId: def.sourceCardId,
      triggeredAt: event.timestamp || this.now(),
    };
    map.set(def.id, active);

    if (def.parameterExtractor !== undefined) {
      const ctx = this.extractCtx?.();
      if (!ctx) return; // No ctx provider — leave params undefined.
      void def.parameterExtractor(event, ctx).then(
        (params) => {
          if (params === null) return;
          const current = map.get(def.id);
          if (current && current.triggeredAt === active.triggeredAt) {
            current.params = params;
          }
        },
        () => {
          // Extractor threw — leave params undefined.
        },
      );
    }
  }

  /** Drop both sides; called on match boundaries. */
  reset(): void {
    this.localEffects = new Map();
    this.opposingEffects = new Map();
  }

  /**
   * Plain-JSON snapshot. Each side is sorted by `triggeredAt`
   * ascending (stable on tie via insertion order).
   */
  snapshot(): RegistrySnapshot {
    return {
      local: this.serializeSide(this.localEffects),
      opposing: this.serializeSide(this.opposingEffects),
    };
  }

  private mapForController(
    controllerId: number,
  ): Map<string, ActiveEffect> | null {
    if (controllerId === this.localControllerId) return this.localEffects;
    if (controllerId === this.opposingControllerId) return this.opposingEffects;
    return null;
  }

  private serializeSide(map: Map<string, ActiveEffect>): ActiveEffect[] {
    return [...map.values()]
      .map((e) => ({
        id: e.id,
        sourceCardId: e.sourceCardId,
        triggeredAt: e.triggeredAt,
        ...(e.params !== undefined ? { params: e.params } : {}),
      }))
      .sort((a, b) => a.triggeredAt - b.triggeredAt);
  }
}

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
  /**
   * Live getter for both controller ids. Reads happen on every event;
   * the registry survives across matches (the orchestrator calls
   * `reset()` between matches but does not re-instantiate), and
   * `Game.setPlayers` may flip ids mid-session.
   */
  getControllerIds: () => { local: number; opposing: number };
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
  private readonly getControllerIds: () => { local: number; opposing: number };
  private readonly extractCtx?: () => ExtractCtx;
  private localEffects = new Map<string, ActiveEffect>();
  private opposingEffects = new Map<string, ActiveEffect>();

  constructor(args: GlobalEffectsRegistryArgs) {
    this.catalogIndex = args.catalogIndex;
    this.now = args.now;
    this.getControllerIds = args.getControllerIds;
    if (args.extractCtx !== undefined) this.extractCtx = args.extractCtx;
  }

  /**
   * Forward a played-card event from the host. Unknown cardIds are
   * silently ignored. Re-triggering an already-active effect refreshes
   * `triggeredAt`, increments `triggerCount`, and re-runs the
   * parameter extractor (if any) — the latest pool wins for params.
   */
  handleCardPlayed(event: CardPlayedEvent): void {
    const def = this.catalogIndex.get(event.cardId);
    if (!def) return;

    const map = this.mapForController(event.controllerId);
    if (!map) return;

    const ts = event.timestamp || this.now();
    const existing = map.get(def.id);
    const active: ActiveEffect = existing
      ? {
          ...existing,
          triggeredAt: ts,
          triggerCount: existing.triggerCount + 1,
        }
      : {
          id: def.id,
          sourceCardId: def.sourceCardId,
          triggeredAt: ts,
          triggerCount: 1,
        };
    map.set(def.id, active);

    if (def.parameterExtractor !== undefined) {
      const ctx = this.extractCtx?.();
      if (!ctx) return; // No ctx provider — leave params undefined.
      void Promise.resolve()
        .then(() => def.parameterExtractor!(event, ctx))
        .then(
          (params) => {
            if (params === null) return;
            const current = map.get(def.id);
            if (current && current.triggeredAt === active.triggeredAt) {
              current.params = params;
            }
          },
          () => {
            // Extractor threw or rejected — leave params undefined.
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
    const ids = this.getControllerIds();
    if (controllerId === ids.local) return this.localEffects;
    if (controllerId === ids.opposing) return this.opposingEffects;
    return null;
  }

  private serializeSide(map: Map<string, ActiveEffect>): ActiveEffect[] {
    return [...map.values()]
      .map((e) => ({
        id: e.id,
        sourceCardId: e.sourceCardId,
        triggeredAt: e.triggeredAt,
        triggerCount: e.triggerCount,
        ...(e.params !== undefined ? { params: e.params } : {}),
      }))
      .sort((a, b) => a.triggeredAt - b.triggeredAt);
  }
}

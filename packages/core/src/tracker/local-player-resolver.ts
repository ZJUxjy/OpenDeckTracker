export interface ZoneEntityObservation {
  zone: 'HAND' | 'PLAY' | 'DECK' | 'SECRET' | string;
  controllerId: number;
  cardId: string;
}

export interface LocalPlayerResolver {
  readonly localControllerId: number | null;
  observe(updates: readonly ZoneEntityObservation[]): void;
  reset(): void;
}

/**
 * Resolve the local player's controllerId from the Power.log when no memory
 * mirror is available. The client logs the *local* player's own card ids; the
 * opponent's HAND/DECK cards are logged with an empty cardId. So the first
 * controller observed with a known cardId in HAND is the local player.
 * Resolves once per game; reset on `create-game`.
 */
export function createLocalPlayerResolver(): LocalPlayerResolver {
  let resolved: number | null = null;
  return {
    get localControllerId(): number | null {
      return resolved;
    },
    observe(updates): void {
      if (resolved !== null) return;
      for (const u of updates) {
        if (u.zone === 'HAND' && u.cardId.length > 0) {
          resolved = u.controllerId;
          return;
        }
      }
    },
    reset(): void {
      resolved = null;
    },
  };
}

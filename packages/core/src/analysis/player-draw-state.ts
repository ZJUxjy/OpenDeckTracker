export interface PlayerDrawContext {
  fatigueTaken: number | null;
  handLimit: number | null;
  fatigueImmune: boolean;
}

/** Observed player tags only. Omitted tags are unknown, not implicit defaults. */
export class PlayerDrawState {
  private tags = new Map<number, Map<string, number>>();

  record(entityId: number, tag: string, value: number): void {
    if (!['FATIGUE', 'MAXHANDSIZE', 'CANT_BE_FATIGUED'].includes(tag)
      || !Number.isSafeInteger(value) || value < 0) return;
    const tags = this.tags.get(entityId) ?? new Map<string, number>();
    tags.set(tag, value);
    this.tags.set(entityId, tags);
  }

  forController(controllerId: number, controllerForEntity: (id: number) => number | undefined): PlayerDrawContext {
    let fatigueTaken: number | null = null;
    let handLimit: number | null = null;
    let fatigueImmune = false;
    for (const [entityId, tags] of this.tags) {
      if (controllerForEntity(entityId) !== controllerId) continue;
      fatigueTaken = tags.get('FATIGUE') ?? fatigueTaken;
      handLimit = tags.get('MAXHANDSIZE') ?? handLimit;
      fatigueImmune ||= (tags.get('CANT_BE_FATIGUED') ?? 0) > 0;
    }
    return { fatigueTaken, handLimit, fatigueImmune };
  }

  reset(): void { this.tags.clear(); }
}

import type { PowerEvent } from '@hdt/hearthwatcher';

export type HeraldTriggerBlockType = 'TRIGGER' | 'POWER';

const REFIRE_SUPPRESS_MS = 3000;
const HERALD_BLOCK_TYPES: ReadonlySet<HeraldTriggerBlockType> = new Set(['TRIGGER', 'POWER']);

export interface HeraldTriggerEvent {
  entityId: number;
  blockType: HeraldTriggerBlockType;
}

export class HeraldTriggerDetector {
  private readonly lastFiredAt = new Map<string, number>();
  private readonly emit: (event: HeraldTriggerEvent) => void;
  private readonly clock: () => number;

  constructor(args: {
    emit: (event: HeraldTriggerEvent) => void;
    clock?: () => number;
  }) {
    this.emit = args.emit;
    this.clock = args.clock ?? (() => Date.now());
  }

  reset(): void {
    this.lastFiredAt.clear();
  }

  handle(event: PowerEvent): void {
    if (event.type !== 'block-start') return;
    const blockType = event.blockType.toUpperCase();
    if (!isHeraldBlockType(blockType)) return;
    const entityId = entityIdOf(event.entity);
    if (entityId === null) return;

    const now = this.clock();
    const key = `${entityId}:${blockType}`;
    const previous = this.lastFiredAt.get(key);
    if (previous !== undefined && now - previous < REFIRE_SUPPRESS_MS) return;

    this.lastFiredAt.set(key, now);
    this.emit({ entityId, blockType });
  }
}

function isHeraldBlockType(blockType: string): blockType is HeraldTriggerBlockType {
  return HERALD_BLOCK_TYPES.has(blockType as HeraldTriggerBlockType);
}

function entityIdOf(ref: number | string | null | undefined): number | null {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') {
    const match = /\bid=(\d+)/i.exec(ref);
    if (match) return Number(match[1]);
  }
  return null;
}

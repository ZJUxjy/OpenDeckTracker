import type { PowerEvent } from '@hdt/hearthwatcher';

export type HeraldTriggerBlockType = 'TRIGGER' | 'POWER';

const HERALD_BLOCK_TYPES: ReadonlySet<HeraldTriggerBlockType> = new Set(['TRIGGER', 'POWER']);

export interface HeraldTriggerEvent {
  entityId: number;
  blockType: HeraldTriggerBlockType;
}

export class HeraldTriggerDetector {
  private readonly emit: (event: HeraldTriggerEvent) => void;

  constructor(args: {
    emit: (event: HeraldTriggerEvent) => void;
  }) {
    this.emit = args.emit;
  }

  reset(): void {
    // The detector is stateless; keep the hook for new-game reset wiring.
  }

  handle(event: PowerEvent): void {
    if (event.type !== 'block-start') return;
    const blockType = event.blockType.toUpperCase();
    if (!isHeraldBlockType(blockType)) return;
    const entityId = entityIdOf(event.entity);
    if (entityId === null) return;

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

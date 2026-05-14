const STATIC_HOVER_POOLS: Record<string, readonly string[]> = {
  CATA_527: ['CATA_527t2'],
  DINO_136: ['DINO_136t', 'DINO_136t', 'DINO_136t'],
  EDR_840: ['EDR_840t1', 'EDR_840t', 'EDR_840t2'],
  TIME_443: ['TIME_443t', 'TIME_443t'],
  TIME_020t2: [
    'TIME_020t2t',
    'TIME_020t3',
    'TIME_020t3t',
    'TIME_020t4',
    'TIME_020t4t',
    'TIME_020t5',
    'TIME_020t5t',
  ],
  TLC_902: ['TLC_630t', 'TLC_630t', 'TLC_903t', 'TLC_903t'],
};

export function getStaticHoverPoolCardIds(cardId: string): string[] {
  return [...(STATIC_HOVER_POOLS[cardId] ?? [])];
}

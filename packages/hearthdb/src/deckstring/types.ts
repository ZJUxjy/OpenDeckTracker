export const DeckFormat = {
  Wild: 1,
  Standard: 2,
  Classic: 3,
  Twist: 4,
} as const;

export type DeckFormat = (typeof DeckFormat)[keyof typeof DeckFormat];

export interface DeckCardEntry {
  dbfId: number;
  count: number;
}

export interface DeckBlueprint {
  format: DeckFormat;
  heroes: number[];
  cards: DeckCardEntry[];
}

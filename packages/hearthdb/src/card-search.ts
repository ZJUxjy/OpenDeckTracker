import type { CardClass, CardDef, CardType, Rarity } from './card-defs';

export interface SearchFilter {
  query?: string;
  cost?: number | { min?: number; max?: number };
  cardClass?: CardClass | CardClass[];
  rarity?: Rarity | Rarity[];
  set?: string | string[];
  type?: CardType | CardType[];
  mechanic?: string;
  limit?: number;
  offset?: number;
}

function inOneOf<T>(value: T | undefined, criteria: T | T[] | undefined): boolean {
  if (criteria === undefined) return true;
  if (value === undefined) return false;
  return Array.isArray(criteria) ? criteria.includes(value) : criteria === value;
}

export function matches(card: CardDef, f: SearchFilter): boolean {
  if (f.query) {
    const q = f.query.toLowerCase();
    const name = card.name.toLowerCase();
    const text = (card.text ?? '').toLowerCase();
    if (!name.includes(q) && !text.includes(q)) return false;
  }

  if (f.cost !== undefined) {
    if (typeof f.cost === 'number') {
      if (card.cost !== f.cost) return false;
    } else {
      const cost = card.cost;
      if (f.cost.min !== undefined && (cost === undefined || cost < f.cost.min)) return false;
      if (f.cost.max !== undefined && (cost === undefined || cost > f.cost.max)) return false;
    }
  }

  if (!inOneOf(card.cardClass, f.cardClass)) return false;
  if (!inOneOf(card.rarity, f.rarity)) return false;
  if (!inOneOf(card.set, f.set)) return false;
  if (!inOneOf(card.type, f.type)) return false;

  if (f.mechanic) {
    if (!(card.mechanics ?? []).includes(f.mechanic)) return false;
  }

  return true;
}

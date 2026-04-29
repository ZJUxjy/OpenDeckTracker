import type {
  Format,
  HeroClass,
  PopularDeck,
  PopularDeckArchetype,
} from './deck-types';

export type PopularDeckSort = 'popular' | 'winrate' | 'updated' | 'cheapest';

export interface PopularDeckFilterCriteria {
  classFilter?: HeroClass | 'all';
  archetypeFilter?: PopularDeckArchetype | 'all';
  formatFilter?: Format;
  maxDust?: number;
  includesCardName?: string;
  excludesCardName?: string;
  /**
   * Caller-provided card-name lookup keyed by deck id. The search function
   * does NOT decode deckstrings — the caller resolves card names once and
   * passes them in. Missing entries fall back to empty arrays.
   */
  cardNamesByDeckId?: Record<string, readonly string[]>;
}

export function filterPopularDecks<T extends PopularDeck>(
  list: readonly T[],
  criteria: PopularDeckFilterCriteria,
): T[] {
  const { classFilter, archetypeFilter, formatFilter, maxDust, includesCardName, excludesCardName, cardNamesByDeckId } = criteria;
  const includes = includesCardName?.toLowerCase() ?? '';
  const excludes = excludesCardName?.toLowerCase() ?? '';

  return list.filter((d) => {
    if (classFilter && classFilter !== 'all' && d.class !== classFilter) return false;
    if (archetypeFilter && archetypeFilter !== 'all' && d.archetype !== archetypeFilter) return false;
    if (formatFilter && d.format !== formatFilter) return false;
    if (typeof maxDust === 'number' && d.dustCost > maxDust) return false;

    if (includes || excludes) {
      const names = cardNamesByDeckId?.[d.id] ?? [];
      if (includes && !names.some((n) => n.toLowerCase().includes(includes))) return false;
      if (excludes && names.some((n) => n.toLowerCase().includes(excludes))) return false;
    }

    return true;
  });
}

export function sortPopularDecks<T extends PopularDeck>(
  list: readonly T[],
  sort: PopularDeckSort,
): T[] {
  const out = [...list];
  switch (sort) {
    case 'popular':
      out.sort((a, b) => b.gamesCount - a.gamesCount);
      break;
    case 'winrate':
      out.sort((a, b) => b.winratePercent - a.winratePercent);
      break;
    case 'updated':
      out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
    case 'cheapest':
      out.sort((a, b) => a.dustCost - b.dustCost);
      break;
  }
  return out;
}

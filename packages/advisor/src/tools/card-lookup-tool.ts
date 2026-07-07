import type { CardDb, CardDef } from '@hdt/hearthdb';

export interface CardLookupArgs {
  cardDb: Pick<CardDb, 'findById' | 'search'>;
  cardId?: string;
  name?: string;
}

export function lookupCard(args: CardLookupArgs): CardDef | null {
  const cardId = args.cardId?.trim();
  if (cardId) {
    const byId = args.cardDb.findById(cardId);
    if (byId !== undefined) return byId;
  }

  const name = args.name?.trim();
  if (!name) return null;

  const matches = args.cardDb.search({ query: name, limit: 10 });
  const normalizedName = name.toLowerCase();
  return matches.find((card) => card.name.toLowerCase() === normalizedName) ?? matches[0] ?? null;
}

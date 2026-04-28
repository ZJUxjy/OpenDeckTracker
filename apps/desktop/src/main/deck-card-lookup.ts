import type { CardClass, CardDb, CardDef } from '@hdt/hearthdb';
import type { HeroClass } from '@hdt/core';

import type { DeckCodecLookup } from './deck-codec';
import type { SaveFromLiveCardLookup } from './deck-store';

const HERO_CLASS_VALUES: ReadonlySet<string> = new Set<HeroClass>([
  'DEATHKNIGHT',
  'DEMONHUNTER',
  'DRUID',
  'HUNTER',
  'MAGE',
  'PALADIN',
  'PRIEST',
  'ROGUE',
  'SHAMAN',
  'WARLOCK',
  'WARRIOR',
  'NEUTRAL',
]);

function asHeroClass(c: CardClass): HeroClass {
  // CardClass includes 'DREAM' / 'WHIZBANG' which aren't real player classes;
  // coerce them to NEUTRAL for legality / class-restriction purposes.
  return HERO_CLASS_VALUES.has(c) ? (c as HeroClass) : 'NEUTRAL';
}

/**
 * Adapt a `@hdt/hearthdb` `CardDb` into the `DeckCodecLookup` shape used by
 * import/export pure functions in `@hdt/core/deck`.
 */
export function makeDeckCodecLookup(db: CardDb): DeckCodecLookup {
  // Once-per-CardDb cache mapping HeroClass → representative hero card dbfId.
  const heroDbfByClass = new Map<HeroClass, number>();
  return {
    byCardId(cardId) {
      const c = db.findById(cardId);
      if (!c) return null;
      return projectCard(c);
    },
    byDbfId(dbfId) {
      const c = db.findByDbfId(dbfId);
      if (!c) return null;
      return projectCard(c);
    },
    heroDbfIdForClass(heroClass) {
      const cached = heroDbfByClass.get(heroClass);
      if (cached !== undefined) return cached;
      const hero = db
        .search({ cardClass: heroClass as CardClass, type: 'HERO', limit: 50 })
        .find((c) => c.type === 'HERO' && c.cardClass === heroClass);
      if (!hero || typeof hero.dbfId !== 'number') return null;
      heroDbfByClass.set(heroClass, hero.dbfId);
      return hero.dbfId;
    },
  };
}

export function makeCollectibleLookup(db: CardDb): SaveFromLiveCardLookup {
  return (cardId: string) => {
    const c = db.findById(cardId);
    if (!c) return null;
    return { collectible: c.collectible === true };
  };
}

function projectCard(c: CardDef): {
  cardId: string;
  dbfId: number;
  class: HeroClass;
  rarity: string;
  type: string;
} {
  return {
    cardId: c.id,
    dbfId: c.dbfId,
    class: asHeroClass(c.cardClass),
    rarity: c.rarity ?? 'COMMON',
    type: c.type,
  };
}

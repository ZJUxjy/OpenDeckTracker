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

const PLAYER_CLASS_VALUES: ReadonlySet<string> = new Set<HeroClass>([
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
]);

function asHeroClass(c: CardClass): HeroClass {
  // CardClass includes 'DREAM' / 'WHIZBANG' which aren't real player classes;
  // coerce them to NEUTRAL for legality / class-restriction purposes.
  return HERO_CLASS_VALUES.has(c) ? (c as HeroClass) : 'NEUTRAL';
}

function asPlayerHeroClass(c: CardClass): HeroClass | null {
  return PLAYER_CLASS_VALUES.has(c) ? (c as HeroClass) : null;
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
    const collectible = c.collectible === true;
    return {
      collectible,
      validInLiveDeck: collectible || isKnownLiveDeckOnlyCard(db, c),
    };
  };
}

export function makeHeroClassLookup(db: CardDb): (cardId: string) => HeroClass | null {
  return (cardId: string) => {
    const c = db.findById(cardId);
    if (!c) return null;
    return asPlayerHeroClass(c.cardClass);
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

const KNOWN_FABLED_BUNDLE_CARD_IDS: ReadonlySet<string> = new Set([
  'TIME_005t1',
  'TIME_005t2',
  'TIME_005t3',
  'TIME_005t4',
  'TIME_005t5',
  'TIME_005t6',
  'TIME_005t7',
  'TIME_005t8',
  'TIME_005t9',
  'TIME_009t1',
  'TIME_009t2',
  'TIME_020t1',
  'TIME_020t2',
  'TIME_209t',
  'TIME_209t2',
  'TIME_211t1',
  'TIME_211t2',
  'TIME_609t1',
  'TIME_609t2',
  'TIME_619t',
  'TIME_619t2',
  'TIME_850t',
  'TIME_850t1',
  'TIME_852t1',
  'TIME_852t3',
  'TIME_875t',
  'TIME_875t1',
  'TIME_890t',
  'TIME_890t2',
]);

function isKnownLiveDeckOnlyCard(db: CardDb, c: CardDef): boolean {
  if (c.collectible) return false;
  if (KNOWN_FABLED_BUNDLE_CARD_IDS.has(c.id)) return true;

  const parentId = liveDeckBundleParentId(c.id);
  if (parentId === null) return false;
  const parent = db.findById(parentId);
  if (!parent?.collectible) return false;
  if (parent.set !== c.set || parent.cardClass !== c.cardClass) return false;
  return parent.rarity === 'LEGENDARY' && isFabledText(parent.text);
}

function liveDeckBundleParentId(cardId: string): string | null {
  const match = /^(.+)t\d*$/.exec(cardId);
  return match?.[1] ?? null;
}

function isFabledText(text: string | undefined): boolean {
  return text !== undefined && /\bFabled\+?/i.test(text);
}

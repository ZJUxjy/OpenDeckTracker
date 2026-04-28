import { decodeDeck, DeckFormat, encodeDeck } from '@hdt/hearthdb';

import {
  type CardLookup,
  createDeck,
  type Deck,
  type DeckCard,
  type Format,
  type HeroClass,
  validateDeck,
} from '@hdt/core';

/**
 * Lookup interface used by import/export. Adapters wrap a card database
 * (e.g. `@hdt/hearthdb`'s `CardDb`) to provide both `cardId ↔ dbfId`
 * translation and class → hero-card-dbfId resolution.
 */
export interface DeckCodecLookup {
  byCardId(cardId: string): { cardId: string; dbfId: number; class: HeroClass; rarity: string; type: string } | null;
  byDbfId(dbfId: number): { cardId: string; dbfId: number; class: HeroClass; rarity: string; type: string } | null;
  /** Returns the dbfId of a representative hero card for the given class. */
  heroDbfIdForClass(heroClass: HeroClass): number | null;
}

export class UnknownCardError extends Error {
  override name = 'UnknownCardError' as const;
  constructor(public readonly cardId: string, public readonly dbfId?: number) {
    super(`UnknownCardError: cardId=${cardId}${dbfId !== undefined ? ` dbfId=${dbfId}` : ''}`);
  }
}

export class DeckstringDecodeError extends Error {
  override name = 'DeckstringDecodeError' as const;
  constructor(message: string) {
    super(`DeckstringDecodeError: ${message}`);
  }
}

export class IllegalDeckExportError extends Error {
  override name = 'IllegalDeckExportError' as const;
  constructor(public readonly issues: ReadonlyArray<unknown>) {
    super(`IllegalDeckExportError: deck failed legality checks (${issues.length} issue(s))`);
  }
}

const FORMAT_TO_NUMBER: Record<Format, DeckFormat> = {
  Wild: DeckFormat.Wild,
  Standard: DeckFormat.Standard,
  Classic: DeckFormat.Classic,
  Twist: DeckFormat.Twist,
};

const NUMBER_TO_FORMAT: Record<DeckFormat, Format> = {
  [DeckFormat.Wild]: 'Wild',
  [DeckFormat.Standard]: 'Standard',
  [DeckFormat.Classic]: 'Classic',
  [DeckFormat.Twist]: 'Twist',
};

const HERO_CLASS_BY_DRUID_DBFID: Record<number, HeroClass> = {
  // Authoritative class-id → hero mapping is provided via the lookup; this
  // table is used only as a defensive fallback when the lookup cannot resolve
  // the hero dbfId during decode. Populated empty by default.
};

function adaptCardLookup(codec: DeckCodecLookup): CardLookup {
  return (cardId) => {
    const c = codec.byCardId(cardId);
    if (!c) return null;
    return { class: c.class, rarity: c.rarity, type: c.type };
  };
}

export function toDeckstring(deck: Deck, lookup: DeckCodecLookup): string {
  const validity = validateDeck(deck, adaptCardLookup(lookup));
  if (!validity.ok) {
    throw new IllegalDeckExportError(validity.issues);
  }
  const heroDbf = lookup.heroDbfIdForClass(deck.class);
  if (heroDbf === null) {
    throw new IllegalDeckExportError([
      { kind: 'unknown-hero-for-class', deckClass: deck.class },
    ]);
  }
  const blueprintCards = deck.cards.map((c) => {
    const info = lookup.byCardId(c.cardId);
    if (!info) {
      throw new UnknownCardError(c.cardId);
    }
    return { dbfId: info.dbfId, count: c.count };
  });
  return encodeDeck({
    format: FORMAT_TO_NUMBER[deck.format],
    heroes: [heroDbf],
    cards: blueprintCards,
  });
}

export function fromDeckstring(text: string, lookup: DeckCodecLookup): Deck {
  let blueprint;
  try {
    blueprint = decodeDeck(text);
  } catch (err) {
    throw new DeckstringDecodeError((err as Error).message);
  }

  const format = NUMBER_TO_FORMAT[blueprint.format];
  if (!format) {
    throw new DeckstringDecodeError(`unknown deck format ${blueprint.format}`);
  }

  // Resolve hero class from heroes[0].
  let heroClass: HeroClass | null = null;
  if (blueprint.heroes.length > 0) {
    const hero = lookup.byDbfId(blueprint.heroes[0]!);
    if (hero) {
      heroClass = hero.class;
    } else {
      heroClass = HERO_CLASS_BY_DRUID_DBFID[blueprint.heroes[0]!] ?? null;
    }
  }
  if (!heroClass || heroClass === 'NEUTRAL') {
    throw new DeckstringDecodeError(
      `cannot resolve hero class from heroes=${JSON.stringify(blueprint.heroes)}`,
    );
  }

  const cards: DeckCard[] = blueprint.cards.map((c) => {
    const info = lookup.byDbfId(c.dbfId);
    if (!info) {
      throw new UnknownCardError(`<dbfId=${c.dbfId}>`, c.dbfId);
    }
    return { cardId: info.cardId, count: c.count };
  });

  return createDeck({
    name: '',
    class: heroClass,
    format,
    cards,
  });
}

export interface DeckJsonEnvelope {
  schemaVersion: 1;
  deck: Deck;
}

export function toJson(deck: Deck): string {
  const envelope: DeckJsonEnvelope = { schemaVersion: 1, deck };
  return JSON.stringify(envelope);
}

export function fromJson(text: string): Deck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new DeckstringDecodeError(`json parse failed: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new DeckstringDecodeError('json envelope must be an object');
  }
  const envelope = parsed as Partial<DeckJsonEnvelope>;
  if (envelope.schemaVersion !== 1) {
    throw new DeckstringDecodeError(
      `unsupported schemaVersion ${String(envelope.schemaVersion)}`,
    );
  }
  if (!envelope.deck || typeof envelope.deck !== 'object') {
    throw new DeckstringDecodeError('deck field missing');
  }
  return envelope.deck;
}

import { describe, expect, it } from 'vitest';
import { decodeDeck, type CardDef } from '@hdt/hearthdb';
import { transformVariant } from './transformer';
import type { HsguruArchetypeRow, HsguruDeckVariant } from './parser';

const MAGE_DECKSTRING =
  'AAECAf0EAqebB/KyBw6b8gazhwfxkQewmwf6mwfVnQfRpgfLtgf5wweGxAeSxAeT2geG4AecgggAAA==';
const ROGUE_DECKSTRING =
  'AAECAaIHCsODB9GdB+ylB4aoB4eoB4ioB9C/B4rUB5vUB4jZBwr3nwT3gQeQgweMrQfHrgfZrweaswe0wQedxQfVxQcAAA==';

function fakeCard(over: { id: string; cardClass: CardDef['cardClass'] }): CardDef {
  return {
    id: over.id,
    dbfId: 0,
    name: over.id,
    cost: 0,
    cardClass: over.cardClass,
    set: 'TEST',
    type: 'HERO',
    collectible: true,
  } as CardDef;
}

function makeCtx(heroDbfId: number, cardClass: CardDef['cardClass']) {
  return {
    findByDbfId: (dbfId: number): CardDef | null =>
      dbfId === heroDbfId ? fakeCard({ id: `H${heroDbfId}`, cardClass }) : null,
  };
}

const FETCHED_AT = '2026-05-09T12:34:56Z';

const ARCHETYPE: HsguruArchetypeRow = {
  archetype: 'Tempo Rogue',
  archetypeUrl: 'https://www.hsguru.com/archetype/Tempo%20Rogue',
  winrate: 50.2,
  popularityPercent: 12.4,
  games: 43449,
};

const VARIANT_ROGUE: HsguruDeckVariant = {
  deckId: 39285857,
  title: 'Harold Rogue',
  deckUrl: 'https://www.hsguru.com/deck/39285857',
  code: ROGUE_DECKSTRING,
  winrate: 50.231,
  games: 43449,
};

function rogueCtx() {
  const bp = decodeDeck(ROGUE_DECKSTRING);
  return makeCtx(bp.heroes[0]!, 'ROGUE');
}

function mageCtx() {
  const bp = decodeDeck(MAGE_DECKSTRING);
  return makeCtx(bp.heroes[0]!, 'MAGE');
}

describe('transformVariant', () => {
  it('produces a fully-shaped PopularDeck for a valid (archetype, variant)', () => {
    const out = transformVariant(ARCHETYPE, VARIANT_ROGUE, FETCHED_AT, rogueCtx());
    expect(out).not.toBeNull();
    expect(out!.id).toBe('tempo-rogue-39285857');
    expect(out!.class).toBe('ROGUE');
    expect(out!.format).toBe('Standard');
    expect(out!.archetype).toBe('Tempo');
    expect(out!.deckstring).toBe(ROGUE_DECKSTRING);
    expect(out!.author).toBe('hsguru');
    expect(out!.updatedAt).toBe('2026-05-09');
    expect(out!.winratePercent).toBe(50.2);
    expect(out!.gamesCount).toBe(43449);
    expect(out!.name).toBe('Harold Rogue');
  });

  it('attaches class matchup rows when provided', () => {
    const out = transformVariant(ARCHETYPE, VARIANT_ROGUE, FETCHED_AT, rogueCtx(), [
      { opponentClass: 'MAGE', winratePercent: 61.5, gamesCount: 13, popularityPercent: 8.1 },
    ]);
    expect(out?.classMatchups).toEqual([
      { opponentClass: 'MAGE', winratePercent: 61.5, gamesCount: 13, popularityPercent: 8.1 },
    ]);
  });

  it('produces stable ids for the same (archetype, deckId)', () => {
    const a = transformVariant(ARCHETYPE, VARIANT_ROGUE, FETCHED_AT, rogueCtx());
    const b = transformVariant(ARCHETYPE, VARIANT_ROGUE, FETCHED_AT, rogueCtx());
    expect(a?.id).toBe(b?.id);
  });

  it('falls back to Midrange for unknown archetype labels', () => {
    const archetype: HsguruArchetypeRow = { ...ARCHETYPE, archetype: 'Big Priest' };
    const out = transformVariant(archetype, VARIANT_ROGUE, FETCHED_AT, rogueCtx());
    expect(out?.archetype).toBe('Midrange');
  });

  it('reads class from the decoded deckstring (not from the label)', () => {
    const malformedArchetype: HsguruArchetypeRow = {
      ...ARCHETYPE,
      archetype: 'unknown-bucket',
    };
    const variant: HsguruDeckVariant = {
      ...VARIANT_ROGUE,
      deckId: 1,
      code: MAGE_DECKSTRING,
    };
    const out = transformVariant(malformedArchetype, variant, FETCHED_AT, mageCtx());
    expect(out?.class).toBe('MAGE');
  });

  it('returns null when the deckstring fails to decode', () => {
    const variant: HsguruDeckVariant = { ...VARIANT_ROGUE, code: '!!!not-base64!!!' };
    const out = transformVariant(ARCHETYPE, variant, FETCHED_AT, rogueCtx());
    expect(out).toBeNull();
  });

  it('returns null when the hero card lookup yields no class', () => {
    const ctx = { findByDbfId: () => null };
    const out = transformVariant(ARCHETYPE, VARIANT_ROGUE, FETCHED_AT, ctx);
    expect(out).toBeNull();
  });
});

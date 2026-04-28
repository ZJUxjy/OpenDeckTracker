import { describe, expect, it } from 'vitest';

import { createDeck, type HeroClass } from './deck-types';
import { type CardLookup, validateDeck } from './validity';

const DRUID_CARD = { class: 'DRUID' as HeroClass, rarity: 'COMMON', type: 'SPELL' };
const NEUTRAL_LEG = { class: 'NEUTRAL' as HeroClass, rarity: 'LEGENDARY', type: 'MINION' };
const NEUTRAL_COMMON = { class: 'NEUTRAL' as HeroClass, rarity: 'COMMON', type: 'MINION' };
const WARRIOR_SPELL = { class: 'WARRIOR' as HeroClass, rarity: 'COMMON', type: 'SPELL' };
const NEUTRAL_HERO = { class: 'NEUTRAL' as HeroClass, rarity: 'EPIC', type: 'HERO' };

function makeLookup(overrides: Record<string, { class: HeroClass; rarity: string; type: string }>): CardLookup {
  return (cardId) => overrides[cardId] ?? null;
}

function legalDruidDeck() {
  // 14 unique commons × 2 + 2 legendaries × 1 = 30 cards
  const cards = [];
  for (let i = 0; i < 14; i += 1) cards.push({ cardId: `D_COMMON_${i}`, count: 2 });
  cards.push({ cardId: 'D_LEG_A', count: 1 });
  cards.push({ cardId: 'D_LEG_B', count: 1 });
  const lookup: Record<string, { class: HeroClass; rarity: string; type: string }> = {};
  for (let i = 0; i < 14; i += 1) lookup[`D_COMMON_${i}`] = DRUID_CARD;
  lookup.D_LEG_A = { class: 'DRUID' as HeroClass, rarity: 'LEGENDARY', type: 'MINION' };
  lookup.D_LEG_B = { class: 'NEUTRAL' as HeroClass, rarity: 'LEGENDARY', type: 'MINION' };
  return { cards, lookup };
}

describe('validateDeck', () => {
  it('flags an empty deck as under-card-limit with required=30 actual=0', () => {
    const deck = createDeck({ name: 'Empty', class: 'DRUID', format: 'Standard' });
    const result = validateDeck(deck, makeLookup({}));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ kind: 'under-card-limit', required: 30, actual: 0 });
  });

  it('flags a single Legendary with count=2', () => {
    const deck = createDeck({
      name: 'L',
      class: 'DRUID',
      format: 'Standard',
      cards: [{ cardId: 'LEG_X', count: 2 }],
    });
    const result = validateDeck(deck, makeLookup({ LEG_X: NEUTRAL_LEG }));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ kind: 'legendary-over-limit', cardId: 'LEG_X', count: 2 });
  });

  it('flags an off-class card', () => {
    const deck = createDeck({
      name: 'Off',
      class: 'MAGE',
      format: 'Standard',
      cards: [{ cardId: 'WAR_S', count: 1 }],
    });
    const result = validateDeck(deck, makeLookup({ WAR_S: WARRIOR_SPELL }));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      kind: 'off-class-card',
      cardId: 'WAR_S',
      cardClass: 'WARRIOR',
      deckClass: 'MAGE',
    });
  });

  it('flags a Hero card in main deck', () => {
    const deck = createDeck({
      name: 'Hero',
      class: 'DRUID',
      format: 'Standard',
      cards: [{ cardId: 'HERO_1', count: 1 }],
    });
    const result = validateDeck(deck, makeLookup({ HERO_1: NEUTRAL_HERO }));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ kind: 'hero-in-main-deck', cardId: 'HERO_1' });
  });

  it('flags three copies of a non-legendary as over-copy-limit', () => {
    const deck = createDeck({
      name: 'Triples',
      class: 'DRUID',
      format: 'Standard',
      cards: [{ cardId: 'NC', count: 3 }],
    });
    const result = validateDeck(deck, makeLookup({ NC: NEUTRAL_COMMON }));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ kind: 'over-copy-limit', cardId: 'NC', count: 3 });
  });

  it('passes a 30-card legal mono-class Druid deck', () => {
    const { cards, lookup } = legalDruidDeck();
    const deck = createDeck({ name: 'Legal', class: 'DRUID', format: 'Standard', cards });
    const result = validateDeck(deck, makeLookup(lookup));
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('passes a 30-card neutral-only deck (no class card)', () => {
    const cards = [];
    for (let i = 0; i < 15; i += 1) cards.push({ cardId: `N_${i}`, count: 2 });
    const lookup: Record<string, { class: HeroClass; rarity: string; type: string }> = {};
    for (let i = 0; i < 15; i += 1) lookup[`N_${i}`] = NEUTRAL_COMMON;
    const deck = createDeck({ name: 'Neutral', class: 'PALADIN', format: 'Standard', cards });
    const result = validateDeck(deck, makeLookup(lookup));
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags a 32-card deck as over-card-limit', () => {
    const cards = [];
    for (let i = 0; i < 16; i += 1) cards.push({ cardId: `N_${i}`, count: 2 });
    const lookup: Record<string, { class: HeroClass; rarity: string; type: string }> = {};
    for (let i = 0; i < 16; i += 1) lookup[`N_${i}`] = NEUTRAL_COMMON;
    const deck = createDeck({ name: '32', class: 'DRUID', format: 'Standard', cards });
    const result = validateDeck(deck, makeLookup(lookup));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ kind: 'over-card-limit', required: 30, actual: 32 });
  });
});

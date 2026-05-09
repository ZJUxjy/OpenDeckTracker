import {
  DeckFormat,
  decodeDeck,
  type CardDef,
  type DeckBlueprint,
} from '@hdt/hearthdb';
import type { Format, HeroClass, PopularDeck } from '@hdt/core';
import type { HsguruArchetypeRow, HsguruDeckVariant } from './parser';
import { classifyArchetypeLabel } from './classifier';

export interface TransformContext {
  findByDbfId: (dbfId: number) => CardDef | null;
}

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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatFromBlueprint(blueprint: DeckBlueprint): Format {
  switch (blueprint.format) {
    case DeckFormat.Wild:
      return 'Wild';
    case DeckFormat.Standard:
      return 'Standard';
    case DeckFormat.Classic:
      return 'Classic';
    case DeckFormat.Twist:
      return 'Twist';
    default:
      return 'Standard';
  }
}

function classFromBlueprint(
  blueprint: DeckBlueprint,
  ctx: TransformContext,
): HeroClass | null {
  const heroDbfId = blueprint.heroes[0];
  if (typeof heroDbfId !== 'number') return null;
  const card = ctx.findByDbfId(heroDbfId);
  if (!card) return null;
  const cls = card.cardClass;
  return HERO_CLASS_VALUES.has(cls) ? (cls as HeroClass) : null;
}

/**
 * Maps a single HSGuru (archetype, variant) tuple to a `PopularDeck`
 * record. Returns `null` when the deckstring fails to decode or the
 * hero class can't be resolved — those entries are skipped at the
 * orchestrator level rather than corrupting the persisted snapshot.
 *
 * `dustCost` is set to a `0` placeholder; the real cost is computed
 * downstream by the IPC enrichment pipeline against the live CardDb.
 */
export function transformVariant(
  archetype: HsguruArchetypeRow,
  variant: HsguruDeckVariant,
  fetchedAt: string,
  ctx: TransformContext,
): PopularDeck | null {
  let blueprint: DeckBlueprint;
  try {
    blueprint = decodeDeck(variant.code);
  } catch {
    return null;
  }
  const heroClass = classFromBlueprint(blueprint, ctx);
  if (!heroClass || heroClass === 'NEUTRAL') return null;

  const id = `${slugify(archetype.archetype)}-${variant.deckId}`;
  return {
    id,
    name: variant.title || archetype.archetype,
    class: heroClass,
    format: formatFromBlueprint(blueprint),
    archetype: classifyArchetypeLabel(archetype.archetype),
    deckstring: variant.code,
    winratePercent: Math.round(variant.winrate * 10) / 10,
    gamesCount: variant.games,
    author: 'hsguru',
    updatedAt: fetchedAt.slice(0, 10),
  };
}

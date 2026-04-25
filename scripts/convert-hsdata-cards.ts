import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SaxesParser, type SaxesTag } from 'saxes';
import type { CardClass, CardDef, CardType, Rarity } from '@hdt/hearthdb';

const DEFAULT_INPUT = 'data/cards/hsdata/CardDefs.xml';
const DEFAULT_OUT_DIR = 'data/cards/generated';
const LOCALES = ['enUS', 'zhCN'] as const;
type Locale = (typeof LOCALES)[number];

const CLASS_BY_VALUE: Record<number, CardClass> = {
  1: 'NEUTRAL',
  2: 'DRUID',
  3: 'HUNTER',
  4: 'MAGE',
  5: 'PALADIN',
  6: 'PRIEST',
  7: 'ROGUE',
  8: 'SHAMAN',
  9: 'WARLOCK',
  10: 'WARRIOR',
  11: 'DREAM',
  12: 'NEUTRAL',
  13: 'WHIZBANG',
  14: 'DEMONHUNTER',
  15: 'DEATHKNIGHT',
};

const TYPE_BY_VALUE: Record<number, CardType> = {
  3: 'HERO',
  4: 'MINION',
  5: 'SPELL',
  6: 'ENCHANTMENT',
  7: 'WEAPON',
  10: 'HERO_POWER',
  12: 'GAME_MODE_BUTTON',
  22: 'MOVE_MINION_HOVER_TARGET',
  23: 'MERCENARY_ABILITY',
  24: 'BATTLEGROUND_HERO_BUDDY',
  39: 'LOCATION',
  40: 'BATTLEGROUND_QUEST_REWARD',
  42: 'BATTLEGROUND_SPELL',
  43: 'BATTLEGROUND_TRINKET',
  44: 'BATTLEGROUND_ANOMALY',
  45: 'PET',
};

const RARITY_BY_VALUE: Record<number, Rarity> = {
  1: 'FREE',
  2: 'COMMON',
  3: 'RARE',
  4: 'EPIC',
  5: 'LEGENDARY',
};

const MECHANIC_TAGS = new Set([
  'ADAPT',
  'AURA',
  'BATTLECRY',
  'CHARGE',
  'CHOOSE_ONE',
  'COMBO',
  'CORRUPT',
  'DEATHRATTLE',
  'DISCOVER',
  'DIVINE_SHIELD',
  'DREDGE',
  'EXCAVATE',
  'FORGE',
  'FREEZE',
  'FRENZY',
  'IMMUNE',
  'INFUSE',
  'INSPIRE',
  'JADE_GOLEM',
  'LIFESTEAL',
  'MEGA_WINDFURY',
  'MINIATURIZE',
  'OUTCAST',
  'OVERKILL',
  'OVERLOAD',
  'POISONOUS',
  'QUEST',
  'QUICKDRAW',
  'REBORN',
  'RUSH',
  'SECRET',
  'SIDEQUEST',
  'SPELLBURST',
  'STEALTH',
  'TAUNT',
  'TITAN',
  'TRADEABLE',
  'TWINSPELL',
  'WINDFURY',
]);

interface RawEntity {
  id: string;
  dbfId: number;
  loc: Record<string, Record<string, string>>;
  ints: Record<string, number>;
  mechanics: Set<string>;
}

interface ConversionResult {
  build: string;
  totalCards: number;
  collectibleCards: number;
}

interface ConvertOptions {
  generatedAt?: string;
  locales?: readonly Locale[];
}

interface ActiveLocTag {
  tagName: string;
  locale: string | null;
  text: string;
}

function attr(node: SaxesTag, name: string): string | undefined {
  const value = node.attributes[name];
  return typeof value === 'string' ? value : undefined;
}

function parseInteger(value: string | undefined, context: string): number {
  if (value === undefined || value === '') {
    throw new Error(`${context}: expected integer value`);
  }
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new Error(`${context}: expected integer, got ${value}`);
  }
  return n;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function mapEnum<T extends string>(
  table: Record<number, T>,
  value: number | undefined,
  enumName: string,
  cardId: string,
): T | undefined {
  if (value === undefined) return undefined;
  const mapped = table[value];
  if (mapped === undefined) {
    throw new Error(`${cardId}: unsupported ${enumName} enum value ${value}`);
  }
  return mapped;
}

function chooseLoc(
  loc: Record<string, Record<string, string>>,
  tagName: string,
  locale: Locale,
  fallback: string,
): string {
  const values = loc[tagName] ?? {};
  return values[locale] ?? values.enUS ?? fallback;
}

function normalizeCard(entity: RawEntity, locale: Locale): CardDef {
  const id = entity.id;
  if (!id) throw new Error(`dbfId ${entity.dbfId}: missing CardID`);
  if (!Number.isInteger(entity.dbfId)) throw new Error(`${id}: missing integer dbfId`);

  const name = chooseLoc(entity.loc, 'CARDNAME', locale, id);
  if (name === '') throw new Error(`${id}: missing CARDNAME`);

  const cardClass = mapEnum(CLASS_BY_VALUE, entity.ints.CLASS, 'CLASS', id) ?? 'NEUTRAL';
  const type = mapEnum(TYPE_BY_VALUE, entity.ints.CARDTYPE, 'CARDTYPE', id);
  const rarity = mapEnum(RARITY_BY_VALUE, entity.ints.RARITY, 'RARITY', id);
  if (type === undefined) throw new Error(`${id}: missing CARDTYPE`);

  const card: CardDef = {
    id,
    dbfId: entity.dbfId,
    name,
    cardClass,
    set: `SET_${entity.ints.CARD_SET ?? 0}`,
    type,
    collectible: entity.ints.COLLECTIBLE === 1,
  };

  const text = chooseLoc(entity.loc, 'CARDTEXT_INHAND', locale, '') ||
    chooseLoc(entity.loc, 'CARDTEXT', locale, '');
  if (text !== '') card.text = text;
  if (entity.ints.COST !== undefined) card.cost = entity.ints.COST;
  if (entity.ints.ATK !== undefined) card.attack = entity.ints.ATK;
  if (entity.ints.HEALTH !== undefined) card.health = entity.ints.HEALTH;
  if (entity.ints.ARMOR !== undefined) card.armor = entity.ints.ARMOR;
  if (rarity !== undefined) card.rarity = rarity;
  if (entity.mechanics.size > 0) card.mechanics = [...entity.mechanics].sort();

  return card;
}

function stableCard(card: CardDef): CardDef {
  const out: CardDef = {
    id: card.id,
    dbfId: card.dbfId,
    name: card.name,
  } as CardDef;
  if (card.cost !== undefined) out.cost = card.cost;
  if (card.attack !== undefined) out.attack = card.attack;
  if (card.health !== undefined) out.health = card.health;
  if (card.armor !== undefined) out.armor = card.armor;
  if (card.text !== undefined) out.text = card.text;
  out.cardClass = card.cardClass;
  if (card.rarity !== undefined) out.rarity = card.rarity;
  out.set = card.set;
  out.type = card.type;
  if (card.mechanics !== undefined) out.mechanics = card.mechanics;
  out.collectible = card.collectible;
  return out;
}

function sortCards(cards: CardDef[]): CardDef[] {
  return [...cards].sort((a, b) => {
    if (a.dbfId !== b.dbfId) return a.dbfId - b.dbfId;
    return a.id.localeCompare(b.id);
  });
}

function stringifyStable(cards: CardDef[]): string {
  return `${JSON.stringify(sortCards(cards).map(stableCard), null, 2)}\n`;
}

function ensureUnique(entity: RawEntity, seenIds: Set<string>, seenDbfIds: Set<number>): void {
  if (seenIds.has(entity.id)) {
    throw new Error(`duplicate CardID ${entity.id}`);
  }
  seenIds.add(entity.id);

  if (entity.dbfId !== 0) {
    if (seenDbfIds.has(entity.dbfId)) {
      throw new Error(`duplicate dbfId ${entity.dbfId} for ${entity.id}`);
    }
    seenDbfIds.add(entity.dbfId);
  }
}

function writeGeneratedAt(options: ConvertOptions): string {
  return options.generatedAt ?? new Date().toISOString();
}

async function parseHsdataXml(inputPath: string): Promise<{ build: string; entities: RawEntity[] }> {
  const entities: RawEntity[] = [];
  const parser = new SaxesParser({ fileName: inputPath });
  let build = '';
  let currentEntity: RawEntity | null = null;
  let currentLoc: ActiveLocTag | null = null;
  let activeTagName: string | null = null;

  parser.on('opentag', (node) => {
    if (node.name === 'CardDefs') {
      build = attr(node, 'build') ?? '';
      return;
    }

    if (node.name === 'Entity') {
      const id = attr(node, 'CardID') ?? '';
      const dbfId = parseInteger(attr(node, 'ID'), `${id || '<missing CardID>'}: ID`);
      currentEntity = { id, dbfId, loc: {}, ints: {}, mechanics: new Set() };
      return;
    }

    if (!currentEntity) return;

    if (node.name === 'Tag') {
      const tagName = attr(node, 'name') ?? '';
      const type = attr(node, 'type') ?? '';
      activeTagName = tagName;

      if (type === 'LocString') {
        currentEntity.loc[tagName] = currentEntity.loc[tagName] ?? {};
        return;
      }

      if (type === 'Int') {
        const value = parseInteger(attr(node, 'value'), `${currentEntity.id}: ${tagName}`);
        currentEntity.ints[tagName] = value;
        if (value !== 0 && MECHANIC_TAGS.has(tagName)) {
          currentEntity.mechanics.add(tagName);
        }
      }
      return;
    }

    if (activeTagName && currentEntity.loc[activeTagName] && currentLoc === null) {
      currentLoc = { tagName: activeTagName, locale: node.name, text: '' };
    }
  });

  parser.on('text', (text) => {
    if (currentLoc) currentLoc.text += text;
  });

  parser.on('closetag', (node) => {
    const name = node.name;
    if (currentLoc && currentLoc.locale === name) {
      currentEntity!.loc[currentLoc.tagName]![currentLoc.locale] = currentLoc.text;
      currentLoc = null;
      return;
    }

    if (name === 'Tag') {
      activeTagName = null;
      currentLoc = null;
      return;
    }

    if (name === 'Entity') {
      if (currentEntity) entities.push(currentEntity);
      currentEntity = null;
    }
  });

  parser.on('error', (error) => {
    throw error;
  });

  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(inputPath, { encoding: 'utf8' });
    stream.on('data', (chunk) => {
      try {
        parser.write(chunk);
      } catch (error) {
        stream.destroy(asError(error));
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      try {
        parser.close();
        resolvePromise();
      } catch (error) {
        reject(asError(error));
      }
    });
  });

  return { build, entities };
}

export async function convertHsdataCardsForTest(
  inputPath: string,
  outDir: string,
  options: ConvertOptions = {},
): Promise<ConversionResult> {
  const locales = options.locales ?? LOCALES;
  const resolvedInput = path.resolve(inputPath);
  const { build, entities } = await parseHsdataXml(resolvedInput);
  const convertibleEntities = entities.filter((entity) => entity.ints.CARDTYPE !== undefined);
  const seenIds = new Set<string>();
  const seenDbfIds = new Set<number>();

  for (const entity of convertibleEntities) {
    ensureUnique(entity, seenIds, seenDbfIds);
  }

  await fs.mkdir(outDir, { recursive: true });

  const firstLocaleCards = sortCards(
    convertibleEntities.map((entity) => normalizeCard(entity, locales[0]!)),
  );
  const collectibleCards = firstLocaleCards.filter((card) => card.collectible);

  for (const locale of locales) {
    const all = sortCards(convertibleEntities.map((entity) => normalizeCard(entity, locale)));
    const collectible = all.filter((card) => card.collectible);
    await fs.writeFile(path.join(outDir, `cards.all.${locale}.json`), stringifyStable(all), 'utf8');
    await fs.writeFile(
      path.join(outDir, `cards.collectible.${locale}.json`),
      stringifyStable(collectible),
      'utf8',
    );
  }

  const metadata = {
    build,
    source: resolvedInput,
    generatedAt: writeGeneratedAt(options),
    totalCards: firstLocaleCards.length,
    collectibleCards: collectibleCards.length,
    locales: [...locales],
  };
  await fs.writeFile(path.join(outDir, 'card-build.json'), `${JSON.stringify(metadata, null, 2)}\n`);

  return {
    build,
    totalCards: firstLocaleCards.length,
    collectibleCards: collectibleCards.length,
  };
}

function printHelp(): void {
  console.log(`Usage: pnpm cards:convert [--input <CardDefs.xml>] [--out-dir <dir>]

Converts Hearthstone hsdata CardDefs.xml into generated JSON card datasets.
Defaults:
  --input   ${DEFAULT_INPUT}
  --out-dir ${DEFAULT_OUT_DIR}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  let input = DEFAULT_INPUT;
  let outDir = DEFAULT_OUT_DIR;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--input') {
      input = args[++i] ?? input;
    } else if (arg === '--out-dir') {
      outDir = args[++i] ?? outDir;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const result = await convertHsdataCardsForTest(input, outDir);
  console.log(
    `Converted hsdata build ${result.build}: ${result.totalCards} cards, ` +
      `${result.collectibleCards} collectible -> ${outDir}`,
  );
}

const isCli = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}

import type { DeckTrackerSnapshot } from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';

export type AdvisorSerializableDeck = Pick<
  NonNullable<DeckTrackerSnapshot['deck']>,
  'remaining' | 'knownPositions'
>;

export type AdvisorSerializableSnapshot = Pick<
  DeckTrackerSnapshot,
  | 'phase'
  | 'turn'
  | 'isMulligan'
  | 'friendlyMana'
  | 'friendlyHand'
  | 'boardAttackToFace'
  | 'friendlyHero'
  | 'opposingHero'
  | 'friendlyHeroPower'
  | 'opposingHeroPower'
  | 'friendlyWeapon'
  | 'opposingWeapon'
  | 'boardMinions'
> & {
  deck: AdvisorSerializableDeck | null;
};

export type AdvisorCardLookup = (cardId: string) => CardDef | null | undefined;

export interface SerializeAdvisorStateArgs {
  snapshot: AdvisorSerializableSnapshot;
  cardLookup: AdvisorCardLookup;
}

export function serializeAdvisorState(args: SerializeAdvisorStateArgs): string {
  const { snapshot, cardLookup } = args;
  const lines: string[] = [];

  lines.push('# Hearthstone State');
  lines.push(`- Phase: ${snapshot.phase}`);
  lines.push(`- Turn: ${snapshot.turn ?? 'unknown'}`);
  lines.push(`- Mulligan: ${snapshot.isMulligan === true ? 'yes' : 'no'}`);
  lines.push(`- Mana: ${formatMana(snapshot.friendlyMana)}`);
  lines.push(`- Friendly face damage this turn: ${snapshot.boardAttackToFace.friendly}`);

  lines.push('');
  lines.push('## Heroes');
  lines.push(`- Friendly: ${formatHero(snapshot.friendlyHero)}`);
  lines.push(`- Opposing: ${formatHero(snapshot.opposingHero)}`);
  appendHeroPower(lines, 'Friendly', snapshot.friendlyHeroPower, cardLookup);
  appendHeroPower(lines, 'Opposing', snapshot.opposingHeroPower, cardLookup);
  appendWeapon(lines, 'Friendly', snapshot.friendlyWeapon, cardLookup);
  appendWeapon(lines, 'Opposing', snapshot.opposingWeapon, cardLookup);

  lines.push('');
  lines.push('## Hand');
  if (snapshot.friendlyHand.length === 0) {
    lines.push('- (empty)');
  } else {
    for (const cardId of snapshot.friendlyHand) {
      lines.push(`- ${formatCardDetail(cardId, cardLookup)}`);
    }
  }

  lines.push('');
  lines.push('## Board');
  lines.push('Friendly:');
  appendBoard(lines, snapshot.boardMinions?.friendly ?? [], cardLookup);
  lines.push('Opposing:');
  appendBoard(lines, snapshot.boardMinions?.opposing ?? [], cardLookup);

  lines.push('');
  lines.push('## Deck');
  appendDeck(lines, snapshot.deck, cardLookup);

  return lines.join('\n');
}

function formatMana(mana: AdvisorSerializableSnapshot['friendlyMana']): string {
  if (mana === null || mana === undefined) return 'unknown';
  return `${mana.available}/${mana.total}`;
}

function formatHero(hero: AdvisorSerializableSnapshot['friendlyHero']): string {
  if (hero === null || hero === undefined) return 'unknown';
  return `${hero.health} health, ${hero.armor} armor, ${hero.effectiveHealth} effective`;
}

function appendHeroPower(
  lines: string[],
  side: 'Friendly' | 'Opposing',
  heroPower: AdvisorSerializableSnapshot['friendlyHeroPower'],
  cardLookup: AdvisorCardLookup,
): void {
  if (heroPower === null || heroPower === undefined) return;
  const card = cardLookup(heroPower.cardId);
  const text = sanitizeText(card?.text);
  lines.push(
    `- ${side} hero power: ${formatCardRef(heroPower.cardId, cardLookup)} (${card?.type ?? 'UNKNOWN'})${text ? ` - ${text}` : ''}`,
  );
}

function appendWeapon(
  lines: string[],
  side: 'Friendly' | 'Opposing',
  weapon: AdvisorSerializableSnapshot['friendlyWeapon'],
  cardLookup: AdvisorCardLookup,
): void {
  if (weapon === null || weapon === undefined) return;
  lines.push(
    `- ${side} weapon: ${formatCardRef(weapon.cardId, cardLookup)} ${weapon.atk} attack / ${weapon.durability ?? '?'} durability`,
  );
}

function formatCardRef(cardId: string, cardLookup: AdvisorCardLookup): string {
  return `${cardLookup(cardId)?.name ?? cardId} [${cardId}]`;
}

function formatCardDetail(cardId: string, cardLookup: AdvisorCardLookup): string {
  const card = cardLookup(cardId);
  if (card === null || card === undefined) return formatCardRef(cardId, cardLookup);

  const parts: string[] = [];
  if (card.cost !== undefined) parts.push(`cost ${card.cost}`);
  parts.push(card.type);
  if (card.attack !== undefined && card.health !== undefined) {
    parts.push(`${card.attack}/${card.health}`);
  }
  const text = sanitizeText(card.text);
  return `${formatCardRef(cardId, cardLookup)} ${parts.join(' ')}${text ? ` - ${text}` : ''}`;
}

function appendBoard(
  lines: string[],
  minions: NonNullable<AdvisorSerializableSnapshot['boardMinions']>['friendly'],
  cardLookup: AdvisorCardLookup,
): void {
  if (minions.length === 0) {
    lines.push('- (empty)');
    return;
  }
  for (const minion of minions) {
    const flags = minionFlags(minion);
    const suffix = flags.length > 0 ? `; ${flags.join(', ')}` : '';
    lines.push(
      `- ${formatCardRef(minion.cardId, cardLookup)} ${minion.health}/${minion.maxHealth}, atk ${minion.atk}${suffix}`,
    );
  }
}

function minionFlags(
  minion: NonNullable<AdvisorSerializableSnapshot['boardMinions']>['friendly'][number],
): string[] {
  const flags: string[] = [];
  if (minion.taunt) flags.push('taunt');
  if (minion.divineShield) flags.push('divineShield');
  if (minion.poisonous) flags.push('poisonous');
  if (minion.frozen) flags.push('frozen');
  if (minion.asleep) flags.push('asleep');
  if (minion.windfury) flags.push('windfury');
  if (minion.silenced) flags.push('silenced');
  return flags;
}

function appendDeck(
  lines: string[],
  deck: AdvisorSerializableDeck | null,
  cardLookup: AdvisorCardLookup,
): void {
  if (deck === null) {
    lines.push('- Remaining cards: unknown');
    return;
  }
  const remainingTotal = deck.remaining.reduce((sum, entry) => sum + entry.count, 0);
  lines.push(`- Remaining cards: ${remainingTotal}`);
  for (const entry of deck.remaining) {
    lines.push(`- ${formatCardRef(entry.cardId, cardLookup)} x${entry.count}`);
  }
  for (const known of deck.knownPositions.slice().sort((a, b) => a.insertedAt - b.insertedAt)) {
    lines.push(
      `- Known ${known.placement}: ${formatCardRef(known.cardId, cardLookup)} from ${formatCardRef(known.sourceCardId, cardLookup)}`,
    );
  }
}

function sanitizeText(text: string | undefined): string {
  return (text ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

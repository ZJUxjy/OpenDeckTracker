import type { BoardMinion, DeckTrackerSnapshot } from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';

import type { SuggestedActionKind } from '../types';

export type ActionEnumerationSnapshot = Pick<
  DeckTrackerSnapshot,
  'friendlyHand' | 'friendlyMana' | 'boardMinions' | 'friendlyHeroPower'
>;

export type ActionTargetType = 'opposingHero' | 'opposingMinion';

export type ActionCardMetadata = Pick<CardDef, 'id' | 'cost' | 'type'>;

export type ActionCardLookup = (cardId: string) => ActionCardMetadata | null | undefined;

export interface EnumeratedAction {
  kind: SuggestedActionKind;
  cardId?: string;
  sourceEntityId?: number;
  targetEntityId?: number;
  targetCardId?: string;
  targetType?: ActionTargetType;
  cost?: number;
  targetRequired: boolean;
  note: string;
}

export interface EnumerateActionsArgs {
  snapshot: ActionEnumerationSnapshot;
  cardLookup: ActionCardLookup;
  heroPowerCost?: number;
}

export function enumerateActions(args: EnumerateActionsArgs): EnumeratedAction[] {
  const { snapshot, cardLookup } = args;
  const manaAvailable = Math.max(0, snapshot.friendlyMana?.available ?? 0);
  const actions: EnumeratedAction[] = [];

  for (const cardId of snapshot.friendlyHand) {
    const card = cardLookup(cardId);
    if (card === null || card === undefined) continue;
    const cost = playableCost(card);
    if (cost === null || cost > manaAvailable) continue;
    const targetRequired = targetMayBeRequired(card);
    actions.push({
      kind: 'play',
      cardId,
      cost,
      targetRequired,
      note: playNote(cost, targetRequired),
    });
  }

  const boardMinions = snapshot.boardMinions ?? { friendly: [], opposing: [] };
  appendAttackActions(actions, boardMinions.friendly, boardMinions.opposing);

  const heroPowerCost = args.heroPowerCost ?? 2;
  const heroPowerCardId = snapshot.friendlyHeroPower?.cardId;
  if (heroPowerCardId !== undefined && heroPowerCardId !== '' && manaAvailable >= heroPowerCost) {
    actions.push({
      kind: 'heroPower',
      cardId: heroPowerCardId,
      cost: heroPowerCost,
      targetRequired: true,
      note: `Hero power is available for ${heroPowerCost} mana; target may be required.`,
    });
  }

  actions.push(
    { kind: 'hold', targetRequired: false, note: 'Hold resources for later.' },
    { kind: 'endTurn', targetRequired: false, note: 'End the turn.' },
  );

  return actions;
}

function playableCost(card: ActionCardMetadata): number | null {
  if (!Number.isFinite(card.cost)) return null;
  return Math.max(0, card.cost ?? 0);
}

function targetMayBeRequired(card: ActionCardMetadata): boolean {
  return card.type === 'SPELL' || card.type === 'HERO_POWER';
}

function playNote(cost: number, targetRequired: boolean): string {
  if (targetRequired) return `Playable for ${cost} mana; target may be required.`;
  return `Playable for ${cost} mana.`;
}

function appendAttackActions(
  actions: EnumeratedAction[],
  friendly: readonly BoardMinion[],
  opposing: readonly BoardMinion[],
): void {
  const taunts = opposing.filter((minion) => minion.taunt && minion.health > 0);
  const minionTargets = taunts.length > 0 ? taunts : opposing.filter((minion) => minion.health > 0);

  for (const attacker of friendly) {
    if (!canAttack(attacker)) continue;

    if (taunts.length === 0) {
      actions.push({
        kind: 'attack',
        cardId: attacker.cardId,
        sourceEntityId: attacker.entityId,
        targetType: 'opposingHero',
        targetRequired: false,
        note: 'Attack the opposing hero.',
      });
    }

    for (const target of minionTargets) {
      actions.push({
        kind: 'trade',
        cardId: attacker.cardId,
        sourceEntityId: attacker.entityId,
        targetEntityId: target.entityId,
        targetCardId: target.cardId,
        targetType: 'opposingMinion',
        targetRequired: false,
        note: target.taunt ? 'Attack opposing taunt minion.' : 'Attack opposing minion.',
      });
    }
  }
}

function canAttack(minion: BoardMinion): boolean {
  if (minion.atk <= 0) return false;
  if (minion.health <= 0) return false;
  if (minion.frozen) return false;
  if (minion.asleep) return false;
  return true;
}

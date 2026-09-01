/**
 * Card ids and shared keys for 36.4 extra-display tracking.
 *
 * Keep this file data-only: detectors and MatchExtraDisplayState import
 * these constants instead of scattering CAP_/JAIL_ literals.
 */

export const IMP_FORMANT_CARD_ID = 'CAP_400t2t';

export const KABAL_MASTERMIND_ENCHANTMENT_ID = 'CAP_406e';

export const SLIME_EM_CARD_ID = 'CAP_805';
export const SLIME_EM_TOKEN_CARD_ID = 'CAP_805t';

export const TRICKS_OF_THE_TRADE_CARD_ID = 'CAP_006';

export const JAILBIRD_CARD_ID = 'JAIL_453';
export const BOUND_ARCHMAGE_CARD_ID = 'JAIL_974';

export const COLLAPSING_STAR_HERO_POWER_ID = 'JAIL_EVENT_101hp';
export const SOUL_SACRIFICE_CARD_ID = 'JAIL_EVENT_101';

/** Bloodsport minions summoned from 血斗士洛戈什. */
export const BLOODSPORT_HAND_CARD_IDS: ReadonlySet<string> = new Set([
  'TIME_850t',
  'TIME_850t1',
]);

export const IMP_FORMANTS_IN_OPPONENT_DECK_KEY = 'impFormantsInOpponentDeck';
export const IMP_FORMANTS_SUMMONED_THIS_GAME_KEY = 'impFormantsSummonedThisGame';
export const KABAL_MASTERMIND_ACTIVE_KEY = 'kabalMastermindActive';
export const MINIONS_REBORN_THIS_GAME_KEY = 'minionsRebornThisGame';
export const CARDS_DISCARDED_THIS_GAME_KEY = 'cardsDiscardedThisGame';
export const FRIENDLY_CHARACTER_ATTACKS_THIS_GAME_KEY = 'friendlyCharacterAttacksThisGame';
export const FRIENDLY_HERO_ATTACKS_THIS_GAME_KEY = 'friendlyHeroAttacksThisGame';
export const STEALTH_ATTACKED_WHILE_IN_HAND_KEY = 'stealthMinionAttackedWhileThisEntityInHand';
export const COLLAPSING_STAR_DAMAGE_KEY = 'collapsingStarDamage';
export const COLLAPSING_STAR_ACTIVE_KEY = 'collapsingStarHeroPowerActive';
export const SLIME_EM_DESTROYED_FRIENDLY_KEY = 'slimeEmDestroyedFriendlyMinions';
export const BLOODSPORT_MINIONS_IN_HAND_KEY = 'bloodsportMinionsInHand';
export const JAILBIRD_PREPARE_DISCOUNT_KEY = 'jailbirdPrepareDiscountForEntity';
export const BOUND_ARCHMAGES_DIED_THIS_GAME_KEY = 'boundArchmagesDiedThisGame';

export function entityScopedKey(base: string, entityId: number): string {
  return `${base}.${entityId}`;
}

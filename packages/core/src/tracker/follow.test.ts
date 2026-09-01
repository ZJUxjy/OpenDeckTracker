import { describe, expect, it } from 'vitest';
import { isDisguised } from './disguise';
import { followSourceCardId, isFollowEnchantment, isStealthMinion } from './follow';
import { IMP_FORMANT_CARD_ID } from './extra-display-ids';
import { FOLLOW_ENCHANTMENT_IDS } from './follow';

describe('isDisguised', () => {
  it('detects the DISGUISED mechanic', () => {
    expect(isDisguised({ mechanics: ['DISGUISED', 'RUSH'] })).toBe(true);
    expect(isDisguised({ mechanics: ['STEALTH'] })).toBe(false);
    expect(isDisguised(null)).toBe(false);
  });
});

describe('Follow enchantments', () => {
  it('maps each Follow enchantment back to its source spell', () => {
    expect(isFollowEnchantment('CAP_002e')).toBe(true);
    expect(followSourceCardId('CAP_101e')).toBe('CAP_101');
    expect(followSourceCardId('CAP_802e1')).toBe('CAP_802');
    expect(isFollowEnchantment('CAP_406e')).toBe(false);
    expect(FOLLOW_ENCHANTMENT_IDS.size).toBe(4);
  });

  it('treats stealth minions as attack sources for Tricks of the Trade', () => {
    expect(isStealthMinion({ type: 'MINION', mechanics: ['STEALTH'] })).toBe(true);
    expect(isStealthMinion({ type: 'SPELL', mechanics: ['STEALTH'] })).toBe(false);
  });
});

describe('extra-display ids', () => {
  it('keeps the Imp-formant token id stable', () => {
    expect(IMP_FORMANT_CARD_ID).toBe('CAP_400t2t');
  });
});

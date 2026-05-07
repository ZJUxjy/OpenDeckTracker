import type { EffectDef } from '../types';

/**
 * Deepminer Brann (Warrior, SET_1810 / Core 2024).
 *
 * "Battlecry: If your deck started with no duplicates, your Battlecries
 * trigger twice for the rest of the game."
 *
 * Conditional on the caster's starting-deck shape — checked at cast
 * time. From the played-card event alone we can't tell whether the
 * condition was satisfied, so the effect is marked `pending`; the UI
 * surfaces a "may not be live" badge until a follow-up resolution
 * watcher is added.
 */
const deepminerBrann: EffectDef = {
  id: 'deepminer-brann',
  sourceCardId: 'DEEP_020',
  side: 'caster',
  mode: 'STANDARD',
  pending: true,
};

export default deepminerBrann;

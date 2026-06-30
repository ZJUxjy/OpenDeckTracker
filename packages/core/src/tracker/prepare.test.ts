import { describe, expect, it } from 'vitest';
import {
  PREPARE_COUNTER_KEY,
  isPrepareCaster,
  isPreparePayoff,
  isPrepareRelatedCard,
  type PrepareCardMetadata,
} from './prepare';

const card = (metadata: PrepareCardMetadata): PrepareCardMetadata => metadata;

describe('Prepare helpers', () => {
  it('uses a stable counter key', () => {
    expect(PREPARE_COUNTER_KEY).toBe('prepareCountThisGame');
  });

  it('recognizes Prepare caster and reference cards', () => {
    expect(isPrepareRelatedCard(card({ mechanics: ['PREPARE'] }))).toBe(true);
    expect(isPrepareRelatedCard(card({ referencedTags: ['PREPARE'] }))).toBe(true);
    expect(isPrepareRelatedCard(card({ mechanics: ['BATTLECRY'] }))).toBe(false);
  });

  it('distinguishes casters from reference-only cards', () => {
    expect(isPrepareCaster(card({ mechanics: ['PREPARE'] }))).toBe(true);
    expect(isPrepareCaster(card({ referencedTags: ['PREPARE'] }))).toBe(false);
    expect(isPreparePayoff(card({ referencedTags: ['PREPARE'] }))).toBe(true);
    expect(isPreparePayoff(card({ mechanics: ['PREPARE'], referencedTags: ['PREPARE'] }))).toBe(false);
  });
});

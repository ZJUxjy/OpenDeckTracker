import { describe, expect, it } from 'vitest';
import {
  HERALD_COUNTER_KEY,
  heraldBlockTypeForTiming,
  heraldTriggerTiming,
  isHeraldRelatedCard,
  type HeraldCardMetadata,
} from './herald';

const card = (metadata: HeraldCardMetadata): HeraldCardMetadata => metadata;

describe('Herald helpers', () => {
  it('uses a stable counter key', () => {
    expect(HERALD_COUNTER_KEY).toBe('heraldCountThisGame');
  });

  it('recognizes Herald caster and payoff cards', () => {
    expect(isHeraldRelatedCard(card({ mechanics: ['HERALD'] }))).toBe(true);
    expect(isHeraldRelatedCard(card({ referencedTags: ['HERALD'] }))).toBe(true);
    expect(isHeraldRelatedCard(card({ mechanics: ['BATTLECRY'] }))).toBe(false);
  });

  it('classifies ordinary Herald cards as play-triggered', () => {
    expect(
      heraldTriggerTiming(card({
        type: 'MINION',
        mechanics: ['HERALD', 'BATTLECRY'],
        text: '<b>Battlecry:</b> <b>Herald</b> {0}.',
      })),
    ).toBe('play');
  });

  it('classifies Deathrattle Herald cards as trigger-triggered', () => {
    expect(
      heraldTriggerTiming(card({
        type: 'MINION',
        mechanics: ['HERALD', 'DEATHRATTLE'],
        text: '<b>Deathrattle:</b> <b>Herald</b> {0}.',
      })),
    ).toBe('trigger');
  });

  it('classifies Chinese Deathrattle Herald cards as trigger-triggered', () => {
    expect(
      heraldTriggerTiming(card({
        type: 'MINION',
        mechanics: ['HERALD', 'DEATHRATTLE'],
        text: '<b>亡语：</b><b>兆示</b> {0}。',
      })),
    ).toBe('trigger');
  });

  it('returns null trigger timing for Herald payoff cards that are not casters', () => {
    expect(
      heraldTriggerTiming(card({
        type: 'SPELL',
        referencedTags: ['HERALD'],
        text: 'If you have Heralded this game, draw a card.',
      })),
    ).toBeNull();
  });

  it('classifies Location Herald cards as power-triggered', () => {
    expect(
      heraldTriggerTiming(card({
        type: 'LOCATION',
        mechanics: ['HERALD'],
        text: '<b>Herald</b> {0}. Draw a card.',
      })),
    ).toBe('power');
  });

  it('maps non-play timing to Power.log block types', () => {
    expect(heraldBlockTypeForTiming('trigger')).toBe('TRIGGER');
    expect(heraldBlockTypeForTiming('power')).toBe('POWER');
  });
});

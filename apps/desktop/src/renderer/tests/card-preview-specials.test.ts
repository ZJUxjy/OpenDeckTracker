import { describe, expect, it } from 'vitest';
import { getStaticHoverPoolCardIds } from '../src/lib/card-preview-specials';

describe('card preview static hover pools', () => {
  it.each([
    ['CORE_REV_314', ['REV_314t']],
    ['EDR_271', ['EDR_271t']],
    ['END_009', ['END_009t', 'END_009t']],
    ['CATA_132', ['CATA_132t', 'CATA_132t']],
    ['CATA_553', ['CATA_553t']],
    [
      'EDR_846',
      [
        'DREAM_01',
        'DREAM_02',
        'DREAM_03',
        'DREAM_04',
        'DREAM_05',
        'EDR_846t3',
        'EDR_846t4',
        'EDR_846t5',
        'EDR_846t2',
        'EDR_846t1',
      ],
    ],
    ['MEND_304', ['NEW1_032', 'NEW1_033', 'NEW1_034']],
    [
      'TIME_005',
      [
        'TIME_005t1',
        'TIME_005t2',
        'TIME_005t3',
        'TIME_005t4',
        'TIME_005t5',
        'TIME_005t6',
        'TIME_005t7',
        'TIME_005t8',
        'TIME_005t9',
        'TIME_005t9t',
      ],
    ],
    ['CORE_REV_372', ['REV_372t']],
    ['CORE_REV_373', ['REV_373t', 'REV_373t']],
    ['CORE_REV_750', ['REV_750t2']],
    ['TIME_619', ['TIME_619t', 'TIME_619t2', 'TIME_619t3', 'TIME_619t4', 'TIME_619t5']],
    ['TIME_850', ['TIME_850t', 'TIME_850t1']],
  ] as const)('maps %s to its fixed derived cards', (cardId, expectedPool) => {
    expect(getStaticHoverPoolCardIds(cardId)).toEqual(expectedPool);
  });

  it('returns a copy so callers cannot mutate the registry', () => {
    const first = getStaticHoverPoolCardIds('TIME_850');
    first.push('BROKEN');

    expect(getStaticHoverPoolCardIds('TIME_850')).toEqual(['TIME_850t', 'TIME_850t1']);
  });
});

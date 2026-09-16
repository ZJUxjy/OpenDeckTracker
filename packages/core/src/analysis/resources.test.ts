import { expect, it } from 'vitest';
import { summarizeResources } from './resources';

it('separates observed copies from generated cards and predicted unplayed copies', () => {
  const result = summarizeResources({ cardIds: ['A'], deck: [{ cardId: 'A', count: 2 }],
    observed: [{ entityId: 1, cardId: 'A', created: false }, { entityId: 1, cardId: 'A', created: false },
      { entityId: 2, cardId: 'A', created: true }], predicted: true });
  expect(result).toMatchObject({ observedOriginal: 1, observedGenerated: 1, predictedUnplayed: 1, inHand: null, inDeck: null });
});
it('counts local hand and deck directly instead of treating played or generated cards as unavailable', () => {
  expect(summarizeResources({ cardIds: ['A', 'B', 'A'], deck: [{ cardId: 'A', count: 2 }],
    hand: ['A', 'B'], remaining: [{ cardId: 'B', count: 3 }], observed: [], predicted: false }))
    .toMatchObject({ inHand: 2, inDeck: 3, predictedUnplayed: null });
});

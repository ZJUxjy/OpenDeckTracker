import { expect, it } from 'vitest';
import { PlayerDrawState } from './player-draw-state';

it('keeps unknown values, resolves controller changes and resets match state', () => {
  const state = new PlayerDrawState();
  expect(state.forController(1, () => 1)).toMatchObject({ fatigueTaken: null, handLimit: null });
  state.record(10, 'FATIGUE', 2);
  state.record(10, 'MAXHANDSIZE', 12);
  expect(state.forController(1, () => 2)).toMatchObject({ fatigueTaken: null, handLimit: null });
  expect(state.forController(2, () => 2)).toMatchObject({ fatigueTaken: 2, handLimit: 12 });
  state.record(10, 'FATIGUE', -1);
  expect(state.forController(2, () => 2).fatigueTaken).toBe(2);
  state.reset();
  expect(state.forController(2, () => 2).fatigueTaken).toBeNull();
});

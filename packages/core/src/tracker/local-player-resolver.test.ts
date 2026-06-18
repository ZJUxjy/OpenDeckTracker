import { describe, expect, it } from 'vitest';
import { createLocalPlayerResolver } from './local-player-resolver';

describe('LocalPlayerResolver', () => {
  it('resolves the controller whose HAND entity has a known cardId', () => {
    const r = createLocalPlayerResolver();
    r.observe([
      { zone: 'HAND', controllerId: 2, cardId: '' },        // opponent hand (hidden)
      { zone: 'HAND', controllerId: 1, cardId: 'CS2_062' }, // my hand (known)
    ]);
    expect(r.localControllerId).toBe(1);
  });

  it('stays null until a known HAND card is seen', () => {
    const r = createLocalPlayerResolver();
    r.observe([{ zone: 'HAND', controllerId: 2, cardId: '' }]);
    expect(r.localControllerId).toBeNull();
  });

  it('ignores non-HAND zones for resolution', () => {
    const r = createLocalPlayerResolver();
    r.observe([{ zone: 'PLAY', controllerId: 1, cardId: 'CS2_062' }]);
    expect(r.localControllerId).toBeNull();
  });

  it('reset() clears resolution', () => {
    const r = createLocalPlayerResolver();
    r.observe([{ zone: 'HAND', controllerId: 1, cardId: 'CS2_062' }]);
    r.reset();
    expect(r.localControllerId).toBeNull();
  });

  it('keeps the first resolved controller (does not flip)', () => {
    const r = createLocalPlayerResolver();
    r.observe([{ zone: 'HAND', controllerId: 1, cardId: 'CS2_062' }]);
    r.observe([{ zone: 'HAND', controllerId: 2, cardId: 'CS2_063' }]); // opponent card later revealed
    expect(r.localControllerId).toBe(1);
  });
});

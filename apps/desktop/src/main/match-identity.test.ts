import { describe, expect, it } from 'vitest';

import { createLiveMatchIdentityStore } from './match-identity';

describe('live match identity', () => {
  it('creates a stable Windows-safe fingerprint for the current live match', () => {
    const store = createLiveMatchIdentityStore();

    const first = store.beginLiveMatch(1_000);

    expect(first.fingerprint).toMatch(/^match-v2-1000-\d+$/);
    expect(first.startedAt).toBe(1_000);
    expect(store.current()).toBe(first);
    expect(store.current()).toBe(first);

    const second = store.beginLiveMatch(2_000);
    expect(second.fingerprint).toMatch(/^match-v2-2000-\d+$/);
    expect(second.fingerprint).not.toBe(first.fingerprint);
    expect(store.current()).toBe(second);

    store.clear();
    expect(store.current()).toBeNull();
  });
});

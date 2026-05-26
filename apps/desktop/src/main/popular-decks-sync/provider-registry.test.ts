import { describe, expect, it, vi } from 'vitest';
import { createPopularDeckProviders, createUnsupportedProvider } from './provider-registry';
import { PopularDeckProviderError } from './provider-types';

describe('createPopularDeckProviders', () => {
  it('registers HSGuru, HSReplay, and Lushi in deterministic order', () => {
    const providers = createPopularDeckProviders();

    expect(providers.map((provider) => provider.id)).toEqual([
      'hsguru',
      'hsreplay',
      'lushi',
    ]);
    expect(providers.map((provider) => provider.label)).toEqual([
      'HSGuru',
      'HSReplay',
      'Lushi',
    ]);
  });

  it('marks only HSGuru as enabled and supported by default', () => {
    const providers = createPopularDeckProviders();

    expect(providers.map((provider) => ({
      id: provider.id,
      defaultEnabled: provider.defaultEnabled,
      status: provider.getStatus(),
    }))).toEqual([
      { id: 'hsguru', defaultEnabled: true, status: { status: 'supported' } },
      {
        id: 'hsreplay',
        defaultEnabled: false,
        status: { status: 'unsupported', reason: 'blocked-by-cloudflare' },
      },
      {
        id: 'lushi',
        defaultEnabled: false,
        status: { status: 'unsupported', reason: 'no-public-deck-api-found' },
      },
    ]);
  });
});

describe('createUnsupportedProvider', () => {
  it('reports unsupported metadata and never calls fetch when invoked defensively', async () => {
    const provider = createUnsupportedProvider({
      id: 'hsreplay',
      label: 'HSReplay',
      reason: 'blocked-by-cloudflare',
    });
    const fetchImpl = vi.fn();

    await expect(provider.sync({
      fetchImpl,
      delay: async () => undefined,
      findByDbfId: () => null,
      fetchedAt: '2026-05-26T00:00:00.000Z',
      archetypeLimit: 20,
      variantLimit: 5,
      progressCb: () => undefined,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: 'unsupported',
      reason: 'blocked-by-cloudflare',
    } satisfies Partial<PopularDeckProviderError>);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

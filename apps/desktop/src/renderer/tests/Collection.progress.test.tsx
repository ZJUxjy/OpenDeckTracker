import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetProgress } from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';
import { I18nProvider } from '../src/i18n';
import { Collection } from '../src/components/Collection';

interface ProgressResponse {
  standard: SetProgress[];
  wild: SetProgress[];
  mirrorAlive: boolean;
  source?: 'live' | 'cache' | 'empty';
  lastUpdatedAt?: number | null;
  lastSyncedAt?: number | null;
  liveReadSkipped?: boolean;
  ownedCards?: Array<{ dbfId: number; count: number; premium: number }>;
}

function row(overrides: Partial<SetProgress> & { setCode: string }): SetProgress {
  return {
    setCode: overrides.setCode,
    format: overrides.format ?? 'standard',
    totalCards: overrides.totalCards ?? 100,
    totalCopies: overrides.totalCopies ?? 200,
    ownedCopies: overrides.ownedCopies ?? 0,
    ownedUniqueCards: overrides.ownedUniqueCards ?? 0,
  };
}

function mockProgressApi(response: ProgressResponse): void {
  const normalized: ProgressResponse = {
    source: response.mirrorAlive ? 'live' : 'empty',
    lastUpdatedAt: null,
    lastSyncedAt: null,
    liveReadSkipped: false,
    ownedCards: [],
    ...response,
  };
  (window as unknown as { hdt: typeof window.hdt }).hdt = {
    ...(window.hdt ?? ({} as typeof window.hdt)),
    cards: {
      // The page also makes a cards.search() call for the DB Cards chip.
      search: vi.fn(async () => []),
    } as unknown as typeof window.hdt.cards,
    collection: {
      getProgress: vi.fn(async () => normalized),
    } as unknown as typeof window.hdt.collection,
  };
}

function renderWithLocale(locale?: 'en-US' | 'zh-CN') {
  return render(
    <I18nProvider {...(locale ? { preference: locale } : {})}>
      <Collection />
    </I18nProvider>,
  );
}

describe('Collection — set progress', () => {
  beforeEach(() => {
    // Reset between tests; localStorage carries no state for this page.
    vi.restoreAllMocks();
  });

  it('renders one tile per Standard SetProgress row when Standard tab is active', async () => {
    mockProgressApi({
      standard: [
        row({ setCode: 'SET_1810', totalCards: 50, totalCopies: 100, ownedCopies: 25, ownedUniqueCards: 18 }),
        row({ setCode: 'SET_1897', totalCards: 30, totalCopies: 60, ownedCopies: 12, ownedUniqueCards: 8 }),
      ],
      wild: [row({ setCode: 'SET_12', format: 'wild' })],
      mirrorAlive: true,
    });

    renderWithLocale('en-US');

    await waitFor(() => {
      expect(screen.getByText('Core')).toBeInTheDocument();
    });
    expect(screen.getByText("Whizbang's Workshop")).toBeInTheDocument();
    // Wild row not rendered while Standard tab is active
    expect(screen.queryByText('Naxxramas')).not.toBeInTheDocument();
  });

  it('switches to Wild rows when the Wild tab is clicked', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [row({ setCode: 'SET_12', format: 'wild' })],
      mirrorAlive: true,
    });

    renderWithLocale('en-US');

    await waitFor(() => expect(screen.getByText('Core')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Wild' }));

    await waitFor(() => expect(screen.getByText('Naxxramas')).toBeInTheDocument());
    expect(screen.queryByText('Core')).not.toBeInTheDocument();
  });

  it('shows the mirror banner when mirrorAlive is false', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [],
      mirrorAlive: false,
    });

    renderWithLocale('en-US');

    await waitFor(() => {
      expect(screen.getByText(/Launch Hearthstone for live numbers/i)).toBeInTheDocument();
    });
  });

  it('does NOT show the mirror banner when mirrorAlive is true', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [],
      mirrorAlive: true,
    });

    renderWithLocale('en-US');

    await waitFor(() => expect(screen.getByText('Core')).toBeInTheDocument());
    expect(screen.queryByText(/Launch Hearthstone/i)).not.toBeInTheDocument();
  });

  it('renders the complete ribbon only when ownedCopies === totalCopies', async () => {
    mockProgressApi({
      standard: [
        row({ setCode: 'SET_1810', totalCopies: 100, ownedCopies: 100 }),
        row({ setCode: 'SET_1897', totalCopies: 100, ownedCopies: 50 }),
      ],
      wild: [],
      mirrorAlive: true,
    });

    renderWithLocale('en-US');

    await waitFor(() => expect(screen.getByText('Core')).toBeInTheDocument());

    const ribbons = screen.getAllByText('Complete');
    expect(ribbons).toHaveLength(1);
  });

  it('falls back to "Unknown set (CODE)" for unknown set codes', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_FAKE9999' })],
      wild: [],
      mirrorAlive: true,
    });

    renderWithLocale('en-US');

    await waitFor(() => {
      expect(screen.getByText('Unknown set (SET_FAKE9999)')).toBeInTheDocument();
    });
  });

  it('renders Chinese set labels under zh-CN locale', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [],
      mirrorAlive: true,
    });

    renderWithLocale('zh-CN');

    await waitFor(() => expect(screen.getByText('核心')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '标准' })).toBeInTheDocument();
  });

  it('shows the cached banner with last-updated timestamp when source=cache', async () => {
    const cachedAt = Date.parse('2026-04-25T10:00:00Z');
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810', ownedCopies: 30 })],
      wild: [],
      mirrorAlive: false,
      source: 'cache',
      lastUpdatedAt: cachedAt,
    });

    renderWithLocale('en-US');

    const banner = await screen.findByTestId('collection-banner');
    expect(banner).toHaveAttribute('data-banner-source', 'cache');
    expect(banner).toHaveTextContent(/Showing cached collection/i);
    expect(screen.queryByText(/Launch Hearthstone/i)).not.toBeInTheDocument();
  });

  it('retries cached collection progress and updates when live data becomes available', async () => {
    vi.useFakeTimers();
    try {
      const getProgress = vi
        .fn()
        .mockResolvedValueOnce({
          standard: [row({ setCode: 'SET_1810', ownedCopies: 1 })],
          wild: [],
          mirrorAlive: false,
          source: 'cache',
          lastUpdatedAt: 1_000,
        })
        .mockResolvedValueOnce({
          standard: [row({ setCode: 'SET_1897', ownedCopies: 20 })],
          wild: [],
          mirrorAlive: true,
          source: 'live',
          lastUpdatedAt: 2_000,
        });
      (window as unknown as { hdt: typeof window.hdt }).hdt = {
        ...(window.hdt ?? ({} as typeof window.hdt)),
        cards: {
          search: vi.fn(async () => []),
        } as unknown as typeof window.hdt.cards,
        collection: {
          getProgress,
        } as unknown as typeof window.hdt.collection,
        decks: {
          ...(window.hdt.decks ?? ({} as typeof window.hdt.decks)),
          syncFromLive: vi.fn(async () => ({
            ok: false,
            source: 'unavailable' as const,
            synced: 0,
            skippedNonCollectible: 0,
            skippedUnknownClass: 0,
            startedAt: 0,
            finishedAt: 0,
          })),
        },
      };

      renderWithLocale('en-US');

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId('collection-banner')).toHaveAttribute(
        'data-banner-source',
        'cache',
      );

      await act(async () => {
        vi.advanceTimersByTime(2_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText("Whizbang's Workshop")).toBeInTheDocument();
      expect(screen.queryByTestId('collection-banner')).not.toBeInTheDocument();
      expect(getProgress).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('triggers live deck sync without blocking progress', async () => {
    const syncFromLive = vi.fn().mockResolvedValue({
      ok: false,
      source: 'unavailable',
      synced: 0,
      skippedNonCollectible: 0,
      skippedUnknownClass: 0,
      startedAt: 0,
      finishedAt: 0,
    });
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [],
      mirrorAlive: true,
    });
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...(window.hdt.decks ?? ({} as typeof window.hdt.decks)),
      syncFromLive,
    };

    renderWithLocale('en-US');

    await waitFor(() => expect(syncFromLive).toHaveBeenCalledTimes(1));
    // Progress still renders even though sync was requested.
    expect(await screen.findByText('Core')).toBeInTheDocument();
  });

  it('uses automatic cooldown cache without syncing live decks or scheduling retries', async () => {
    vi.useFakeTimers();
    try {
      const getProgress = vi.fn(async (_request?: unknown) => ({
        standard: [row({ setCode: 'SET_1810', ownedCopies: 1 })],
        wild: [],
        mirrorAlive: false,
        source: 'cache' as const,
        lastUpdatedAt: 1_000,
        lastSyncedAt: 2_000,
        liveReadSkipped: true,
        ownedCards: [{ dbfId: 100, count: 1, premium: 0 }],
      }));
      const syncFromLive = vi.fn(async () => ({
        ok: true,
        source: 'live' as const,
        synced: 0,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
        startedAt: 0,
        finishedAt: 0,
      }));
      (window as unknown as { hdt: typeof window.hdt }).hdt = {
        ...(window.hdt ?? ({} as typeof window.hdt)),
        cards: { search: vi.fn(async () => []) } as unknown as typeof window.hdt.cards,
        collection: { getProgress } as unknown as typeof window.hdt.collection,
        decks: {
          ...(window.hdt.decks ?? ({} as typeof window.hdt.decks)),
          syncFromLive,
        },
      };

      renderWithLocale('en-US');

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText('Core')).toBeInTheDocument();
      expect(getProgress).toHaveBeenCalledTimes(1);
      expect(getProgress.mock.calls[0]?.[0]).toEqual({ cooldownMs: 600_000 });
      expect(syncFromLive).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(2_000);
        await Promise.resolve();
      });
      expect(getProgress).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps showing progress when live deck sync rejects', async () => {
    const syncFromLive = vi.fn().mockRejectedValue(new Error('boom'));
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [],
      mirrorAlive: true,
    });
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...(window.hdt.decks ?? ({} as typeof window.hdt.decks)),
      syncFromLive,
    };

    renderWithLocale('en-US');

    await waitFor(() => expect(syncFromLive).toHaveBeenCalled());
    expect(await screen.findByText('Core')).toBeInTheDocument();
  });

  it('renders set tiles in a 5-column layout at xl', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' }), row({ setCode: 'SET_1897' })],
      wild: [],
      mirrorAlive: true,
    });
    renderWithLocale('en-US');
    const grid = await screen.findByTestId('set-grid');
    expect(grid.className).toContain('xl:grid-cols-5');
  });

  it('renders 5 tabs with only the cards tab active and interactive', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [],
      mirrorAlive: true,
    });
    renderWithLocale('en-US');
    await screen.findByText('Core');
    for (const tab of ['cards', 'cardBacks', 'heroes', 'coins', 'packs']) {
      expect(screen.getByTestId(`category-tab-${tab}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('category-tab-cards')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('category-tab-heroes')).toHaveAttribute('aria-disabled', 'true');
  });

  it('clicking a disabled tab does not change the active tab', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [],
      mirrorAlive: true,
    });
    renderWithLocale('en-US');
    await screen.findByText('Core');
    fireEvent.click(screen.getByTestId('category-tab-heroes'));
    expect(screen.getByTestId('category-tab-cards')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Core')).toBeInTheDocument();
  });

  it('standard/wild segment toggle filters tiles by format', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [row({ setCode: 'SET_12', format: 'wild' })],
      mirrorAlive: true,
    });
    renderWithLocale('en-US');
    await screen.findByText('Core');
    // The mode-dropdown was removed; clicking the Wild segment is now
    // the single way to switch the visible format.
    fireEvent.click(screen.getByRole('button', { name: 'Wild' }));
    await waitFor(() => expect(screen.getByText('Naxxramas')).toBeInTheDocument());
    expect(screen.queryByText('Core')).not.toBeInTheDocument();
  });

  it('search filters tiles by localized set name', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' }), row({ setCode: 'SET_1897' })],
      wild: [],
      mirrorAlive: true,
    });
    renderWithLocale('en-US');
    await screen.findByText('Core');
    fireEvent.change(screen.getByTestId('tile-search'), { target: { value: 'whiz' } });
    await waitFor(() => expect(screen.queryByText('Core')).not.toBeInTheDocument());
    expect(screen.getByText("Whizbang's Workshop")).toBeInTheDocument();
  });

  it('gives the set search field a real accessible name without fake shortcut text', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [],
      mirrorAlive: true,
    });
    renderWithLocale('en-US');
    await screen.findByText('Core');

    expect(screen.getByRole('textbox', { name: 'Search sets…' })).toBeInTheDocument();
    expect(screen.queryByText('Ctrl')).not.toBeInTheDocument();
    expect(screen.queryByText('K')).not.toBeInTheDocument();
  });

  it('uses cached ownedCards from collection progress in the set detail view', async () => {
    const cachedCard = {
      id: 'CARD_CACHED',
      dbfId: 100,
      name: 'Cached Card',
      cardClass: 'MAGE',
      type: 'SPELL',
      collectible: true,
      rarity: 'COMMON',
      set: 'SET_1810',
      cost: 2,
    } as CardDef;
    const search = vi.fn(async (filter?: { set?: string }) => {
      if (filter?.set === 'SET_1810') return [cachedCard];
      return [cachedCard];
    });
    const getProgress = vi.fn(async (_request?: unknown) => ({
      standard: [
        row({
          setCode: 'SET_1810',
          totalCards: 1,
          totalCopies: 2,
          ownedCopies: 1,
          ownedUniqueCards: 1,
        }),
      ],
      wild: [],
      mirrorAlive: false,
      source: 'cache' as const,
      lastUpdatedAt: 1_000,
      lastSyncedAt: 2_000,
      liveReadSkipped: true,
      ownedCards: [{ dbfId: 100, count: 1, premium: 0 }],
    }));
    (window as unknown as { hdt: typeof window.hdt }).hdt = {
      ...(window.hdt ?? ({} as typeof window.hdt)),
      cards: { search } as unknown as typeof window.hdt.cards,
      collection: { getProgress } as unknown as typeof window.hdt.collection,
    };

    renderWithLocale('en-US');

    await screen.findByText('Core');
    fireEvent.click(screen.getByTestId('set-tile-SET_1810'));

    expect(await screen.findByText('Cached Card')).toBeInTheDocument();
    expect(screen.getByTestId('cell-owned-badge')).toHaveTextContent('Owned x1/2');
  });

  it('clicking the sync button calls decks.syncFromLive and forces collection.getProgress', async () => {
    const getProgress = vi.fn(async (_request?: unknown) => ({
      standard: [row({ setCode: 'SET_1810', ownedCopies: 5 })],
      wild: [],
      mirrorAlive: true,
      source: 'live' as const,
      lastUpdatedAt: 1000,
      lastSyncedAt: 1000,
      liveReadSkipped: false,
      ownedCards: [{ dbfId: 100, count: 1, premium: 0 }],
    }));
    const syncFromLive = vi.fn().mockResolvedValue({
      ok: true,
      source: 'live' as const,
      synced: 1,
      skippedNonCollectible: 0,
      skippedUnknownClass: 0,
      startedAt: 0,
      finishedAt: 0,
    });
    const getCollectionDiagnostic = vi.fn().mockResolvedValue(null);
    (window as unknown as { hdt: typeof window.hdt }).hdt = {
      ...(window.hdt ?? ({} as typeof window.hdt)),
      cards: { search: vi.fn(async () => []) } as unknown as typeof window.hdt.cards,
      collection: { getProgress } as unknown as typeof window.hdt.collection,
      decks: {
        ...(window.hdt.decks ?? ({} as typeof window.hdt.decks)),
        syncFromLive,
      },
      hearthmirror: {
        ...(window.hdt?.hearthmirror ?? ({} as typeof window.hdt.hearthmirror)),
        getCollectionDiagnostic,
      } as unknown as typeof window.hdt.hearthmirror,
    };

    renderWithLocale('en-US');

    await waitFor(() => expect(screen.getByText('Core')).toBeInTheDocument());

    const initialGetProgressCalls = getProgress.mock.calls.length;
    const initialSyncCalls = syncFromLive.mock.calls.length;
    const initialDiagnosticCalls = getCollectionDiagnostic.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByTestId('collection-sync-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getProgress.mock.calls.length).toBeGreaterThan(initialGetProgressCalls);
    expect(getProgress.mock.calls.at(-1)?.[0]).toEqual({ force: true });
    expect(syncFromLive.mock.calls.length).toBeGreaterThan(initialSyncCalls);
    expect(getCollectionDiagnostic.mock.calls.length).toBeGreaterThan(initialDiagnosticCalls);
  });

  it('sync button shows success label when getProgress resolves', async () => {
    const getProgress = vi.fn(async () => ({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [],
      mirrorAlive: true,
      source: 'live' as const,
      lastUpdatedAt: 1000,
    }));
    (window as unknown as { hdt: typeof window.hdt }).hdt = {
      ...(window.hdt ?? ({} as typeof window.hdt)),
      cards: { search: vi.fn(async () => []) } as unknown as typeof window.hdt.cards,
      collection: { getProgress } as unknown as typeof window.hdt.collection,
      decks: {
        ...(window.hdt.decks ?? ({} as typeof window.hdt.decks)),
        syncFromLive: vi.fn(async () => ({
          ok: true,
          source: 'live' as const,
          synced: 0,
          skippedNonCollectible: 0,
          skippedUnknownClass: 0,
          startedAt: 0,
          finishedAt: 0,
        })),
      },
      hearthmirror: {
        ...(window.hdt?.hearthmirror ?? ({} as typeof window.hdt.hearthmirror)),
        getCollection: vi.fn(async () => []),
      } as unknown as typeof window.hdt.hearthmirror,
    };
    renderWithLocale('en-US');
    await waitFor(() => expect(screen.getByText('Core')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('collection-sync-button'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId('collection-sync-button').getAttribute('data-state')).toBe('success');
    });
  });

  it('sync button shows error label when getProgress rejects', async () => {
    let callCount = 0;
    const getProgress = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          standard: [row({ setCode: 'SET_1810' })],
          wild: [],
          mirrorAlive: true,
          source: 'live' as const,
          lastUpdatedAt: 1000,
        };
      }
      throw new Error('boom');
    });
    (window as unknown as { hdt: typeof window.hdt }).hdt = {
      ...(window.hdt ?? ({} as typeof window.hdt)),
      cards: { search: vi.fn(async () => []) } as unknown as typeof window.hdt.cards,
      collection: { getProgress } as unknown as typeof window.hdt.collection,
      decks: {
        ...(window.hdt.decks ?? ({} as typeof window.hdt.decks)),
        syncFromLive: vi.fn(async () => ({
          ok: false,
          source: 'unavailable' as const,
          synced: 0,
          skippedNonCollectible: 0,
          skippedUnknownClass: 0,
          startedAt: 0,
          finishedAt: 0,
        })),
      },
      hearthmirror: {
        ...(window.hdt?.hearthmirror ?? ({} as typeof window.hdt.hearthmirror)),
        getCollection: vi.fn(async () => null),
      } as unknown as typeof window.hdt.hearthmirror,
    };
    renderWithLocale('en-US');
    await waitFor(() => expect(screen.getByText('Core')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('collection-sync-button'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId('collection-sync-button').getAttribute('data-state')).toBe('error');
    });
  });

  it('progress tiles re-render after a successful manual sync', async () => {
    let progressCallCount = 0;
    const getProgress = vi.fn(async () => {
      progressCallCount += 1;
      const newCardSet = progressCallCount === 1 ? 'SET_1810' : 'SET_1897';
      return {
        standard: [row({ setCode: newCardSet })],
        wild: [],
        mirrorAlive: true,
        source: 'live' as const,
        lastUpdatedAt: 1000,
      };
    });
    (window as unknown as { hdt: typeof window.hdt }).hdt = {
      ...(window.hdt ?? ({} as typeof window.hdt)),
      cards: { search: vi.fn(async () => []) } as unknown as typeof window.hdt.cards,
      collection: { getProgress } as unknown as typeof window.hdt.collection,
      decks: {
        ...(window.hdt.decks ?? ({} as typeof window.hdt.decks)),
        syncFromLive: vi.fn(async () => ({
          ok: true,
          source: 'live' as const,
          synced: 0,
          skippedNonCollectible: 0,
          skippedUnknownClass: 0,
          startedAt: 0,
          finishedAt: 0,
        })),
      },
      hearthmirror: {
        ...(window.hdt?.hearthmirror ?? ({} as typeof window.hdt.hearthmirror)),
        getCollection: vi.fn(async () => []),
      } as unknown as typeof window.hdt.hearthmirror,
    };
    renderWithLocale('en-US');
    await waitFor(() => expect(screen.getByText('Core')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('collection-sync-button'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText("Whizbang's Workshop")).toBeInTheDocument());
  });

  it('shows the launch-game banner when source=empty', async () => {
    mockProgressApi({
      standard: [row({ setCode: 'SET_1810' })],
      wild: [],
      mirrorAlive: false,
      source: 'empty',
      lastUpdatedAt: null,
    });

    renderWithLocale('en-US');

    const banner = await screen.findByTestId('collection-banner');
    expect(banner).toHaveAttribute('data-banner-source', 'empty');
    expect(banner).toHaveTextContent(/Launch Hearthstone for live numbers/i);
  });
});

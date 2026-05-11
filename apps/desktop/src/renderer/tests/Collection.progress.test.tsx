import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetProgress } from '@hdt/core';
import { I18nProvider } from '../src/i18n';
import { Collection } from '../src/components/Collection';

interface ProgressResponse {
  standard: SetProgress[];
  wild: SetProgress[];
  mirrorAlive: boolean;
  source?: 'live' | 'cache' | 'empty';
  lastUpdatedAt?: number | null;
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
  (window as unknown as { hdt: typeof window.hdt }).hdt = {
    ...(window.hdt ?? ({} as typeof window.hdt)),
    cards: {
      // The page also makes a cards.search() call for the DB Cards chip.
      search: vi.fn(async () => []),
    } as unknown as typeof window.hdt.cards,
    collection: {
      getProgress: vi.fn(async () => response),
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

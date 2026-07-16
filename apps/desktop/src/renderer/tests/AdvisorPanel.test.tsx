import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdvisorMainState } from '../../main/advisor';
import { AdvisorPanel } from '../src/components/AdvisorPanel';
import { I18nProvider } from '../src/i18n';
import { useAdvisorStore } from '../src/stores/advisor-store';

const readyState: AdvisorMainState = {
  status: 'ready',
  suggestion: {
    actions: [
      { kind: 'play', cardId: 'CS2_029', targetCardId: 'HERO_08', note: 'Point damage face.' },
      { kind: 'endTurn', note: 'End after spending mana.' },
    ],
    reasoning: 'This line presents lethal next turn.',
    alerts: [{ type: 'lethal', detail: 'Lethal setup is available.' }],
  },
  alerts: [{ type: 'lethal', detail: 'Lethal setup is available.' }],
  error: null,
  updatedAt: 100,
};

function resetAdvisorStore(): void {
  useAdvisorStore.setState({
    status: 'idle',
    suggestion: null,
    alerts: [],
    error: null,
    updatedAt: 0,
  });
}

function renderPanel() {
  return render(
    <I18nProvider preference="en-US">
      <AdvisorPanel />
    </I18nProvider>,
  );
}

beforeEach(() => {
  resetAdvisorStore();
  window.hdt.cards.findById = vi.fn(async (cardId: string) => {
    if (cardId === 'CS2_029') {
      return { id: cardId, name: 'Fireball' } as Awaited<
        ReturnType<typeof window.hdt.cards.findById>
      >;
    }
    if (cardId === 'HERO_08') {
      return { id: cardId, name: 'Mage hero' } as Awaited<
        ReturnType<typeof window.hdt.cards.findById>
      >;
    }
    return null;
  });
  (window as unknown as { hdt: typeof window.hdt }).hdt = {
    ...window.hdt,
    cardPreview: {
      show: vi.fn(),
      hide: vi.fn(),
    } as unknown as typeof window.hdt.cardPreview,
  };
});

afterEach(() => {
  resetAdvisorStore();
  vi.restoreAllMocks();
});

describe('AdvisorPanel', () => {
  it('renders lethal alerts, suggestion actions, reasoning, and previewable card names', async () => {
    act(() => {
      useAdvisorStore.getState().applyState(readyState);
    });

    renderPanel();

    expect(screen.getByTestId('advisor-panel')).toBeInTheDocument();
    expect(screen.getByTestId('advisor-alert')).toHaveClass('advisor-alert-lethal');
    expect(screen.getByText('Lethal setup is available.')).toBeInTheDocument();
    expect(screen.getByText('Point damage face.')).toBeInTheDocument();
    expect(screen.getByText('This line presents lethal next turn.')).toBeInTheDocument();

    const fireball = await screen.findByText('Fireball');
    expect(await screen.findByText('Mage hero')).toBeInTheDocument();

    fireEvent.mouseEnter(fireball);
    await waitFor(() => {
      expect(window.hdt.cardPreview.show).toHaveBeenCalledWith(
        'CS2_029',
        expect.objectContaining({ side: expect.any(String) }),
      );
    });

    fireEvent.mouseLeave(fireball);
    expect(window.hdt.cardPreview.hide).toHaveBeenCalled();
  });

  it('shows explicit status surfaces for loading, stale, error, and idle', () => {
    const { rerender } = renderPanel();
    expect(screen.getByTestId('advisor-state-idle')).toBeInTheDocument();

    act(() => {
      useAdvisorStore.getState().applyState({
        status: 'loading',
        suggestion: null,
        alerts: [],
        error: null,
        updatedAt: 101,
      });
    });
    rerender(
      <I18nProvider preference="en-US">
        <AdvisorPanel />
      </I18nProvider>,
    );
    expect(screen.getByTestId('advisor-state-loading')).toBeInTheDocument();

    act(() => {
      useAdvisorStore.getState().applyState(readyState);
      useAdvisorStore.getState().applyState({
        status: 'stale',
        suggestion: null,
        alerts: [],
        error: null,
        updatedAt: 102,
      });
    });
    rerender(
      <I18nProvider preference="en-US">
        <AdvisorPanel />
      </I18nProvider>,
    );
    expect(screen.getByTestId('advisor-state-stale')).toBeInTheDocument();
    expect(screen.getByText('Point damage face.')).toBeInTheDocument();

    act(() => {
      useAdvisorStore.getState().applyState({
        status: 'error',
        suggestion: null,
        alerts: [],
        error: 'provider failed',
        updatedAt: 103,
      });
    });
    rerender(
      <I18nProvider preference="en-US">
        <AdvisorPanel />
      </I18nProvider>,
    );
    expect(screen.getByTestId('advisor-state-error')).toHaveTextContent('provider failed');
  });
});

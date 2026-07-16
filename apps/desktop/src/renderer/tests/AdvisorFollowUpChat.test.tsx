import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvisorFollowUpChat } from '../src/components/AdvisorFollowUpChat';
import { I18nProvider } from '../src/i18n';
import { useAdvisorStore } from '../src/stores/advisor-store';

function renderChat() {
  return render(
    <I18nProvider preference="en-US">
      <AdvisorFollowUpChat />
    </I18nProvider>,
  );
}

function resetAdvisorStore(): void {
  useAdvisorStore.setState({
    status: 'ready',
    suggestion: null,
    alerts: [],
    error: null,
    updatedAt: 0,
  });
}

beforeEach(() => {
  resetAdvisorStore();
});

afterEach(() => {
  resetAdvisorStore();
  vi.restoreAllMocks();
});

describe('AdvisorFollowUpChat', () => {
  it('sends a question, disables controls while pending, and appends streamed chunks', async () => {
    let resolveAsk: (answer: string) => void = () => {};
    let chunkListener: ((chunk: string) => void) | null = null;
    const off = vi.fn();
    window.hdt.advisor.ask = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveAsk = resolve;
        }),
    );
    window.hdt.advisor.onAskChunk = vi.fn((cb) => {
      chunkListener = cb;
      return off;
    });

    const { unmount } = renderChat();
    const input = screen.getByTestId('advisor-chat-input');
    const send = screen.getByTestId('advisor-chat-send');

    fireEvent.change(input, { target: { value: 'Why trade?' } });
    fireEvent.click(send);

    expect(window.hdt.advisor.ask).toHaveBeenCalledWith('Why trade?');
    expect(input).toBeDisabled();
    expect(send).toBeDisabled();
    expect(screen.getByText('Why trade?')).toBeInTheDocument();

    act(() => {
      chunkListener?.('Trade first. ');
      chunkListener?.('Then push damage.');
    });
    expect(screen.getByText('Trade first. Then push damage.')).toBeInTheDocument();

    await act(async () => {
      resolveAsk('Trade first. Then push damage.');
    });
    expect(input).not.toBeDisabled();

    unmount();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('uses the ask return value when no stream chunks arrive', async () => {
    window.hdt.advisor.ask = vi.fn().mockResolvedValue('Hold removal for the next threat.');
    window.hdt.advisor.onAskChunk = vi.fn(() => () => {});

    renderChat();
    fireEvent.change(screen.getByTestId('advisor-chat-input'), {
      target: { value: 'What if I pass?' },
    });
    fireEvent.click(screen.getByTestId('advisor-chat-send'));

    await screen.findByText('Hold removal for the next threat.');
  });

  it('clears local history when the advisor returns to idle', async () => {
    window.hdt.advisor.ask = vi.fn().mockResolvedValue('Pass is safe.');
    window.hdt.advisor.onAskChunk = vi.fn(() => () => {});

    renderChat();
    fireEvent.change(screen.getByTestId('advisor-chat-input'), {
      target: { value: 'Can I pass?' },
    });
    fireEvent.click(screen.getByTestId('advisor-chat-send'));
    await screen.findByText('Pass is safe.');

    act(() => {
      useAdvisorStore.getState().applyState({
        status: 'idle',
        suggestion: null,
        alerts: [],
        error: null,
        updatedAt: 10,
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('Can I pass?')).not.toBeInTheDocument();
      expect(screen.queryByText('Pass is safe.')).not.toBeInTheDocument();
    });
  });
});

import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameProgressNarrationFrame } from '@hdt/core';
import { LiveNarrationPanel } from '../src/components/LiveNarrationPanel';
import { I18nProvider } from '../src/i18n';

function frame(
  sequence: number,
  text: string,
  sourceEventIndex = sequence,
): GameProgressNarrationFrame {
  return { sequence, sourceEventIndex, eventKind: 'card-played', text, facts: {} };
}

type NarrationListener = (frame: GameProgressNarrationFrame) => void;

interface NarrationStub {
  getRecent: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  emit: (frame: GameProgressNarrationFrame) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function stubNarration(recent: GameProgressNarrationFrame[]): NarrationStub {
  const listeners = new Set<NarrationListener>();
  const unsubscribe = vi.fn(() => {});
  const subscribe = vi.fn((cb: NarrationListener) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
      unsubscribe();
    };
  });
  const getRecent = vi.fn(async () => recent);
  (window.hdt as unknown as { gameProgressNarration: unknown }).gameProgressNarration = {
    getRecent,
    subscribe,
  };
  return {
    getRecent,
    subscribe,
    unsubscribe,
    emit: (f) => {
      for (const cb of listeners) cb(f);
    },
  };
}

function renderPanel() {
  return render(
    <I18nProvider preference="zh-CN">
      <LiveNarrationPanel />
    </I18nProvider>,
  );
}

afterEach(() => {
  delete (window.hdt as unknown as { gameProgressNarration?: unknown }).gameProgressNarration;
});

describe('LiveNarrationPanel', () => {
  it('seeds from getRecent and renders frames in sequence order', async () => {
    stubNarration([frame(1, '我方使用了驯服宠物'), frame(2, '对手使用了寒冰箭')]);
    renderPanel();
    await waitFor(() => {
      const rendered = screen.getAllByTestId('live-narration-frame');
      expect(rendered).toHaveLength(2);
      expect(rendered[0]!.textContent).toContain('我方使用了驯服宠物');
      expect(rendered[1]!.textContent).toContain('对手使用了寒冰箭');
    });
  });

  it('shows the empty state when no frames have been narrated', async () => {
    stubNarration([]);
    renderPanel();
    expect(await screen.findByTestId('live-narration-empty')).toBeInTheDocument();
  });

  it('appends live frames pushed through the subscription', async () => {
    const narration = stubNarration([frame(1, '对局开始。')]);
    renderPanel();
    await screen.findByText('对局开始。');
    act(() => narration.emit(frame(2, '我方使用了驯服宠物')));
    expect(await screen.findByText('我方使用了驯服宠物')).toBeInTheDocument();
  });

  it('ignores duplicate sequences from a seed/live race', async () => {
    const narration = stubNarration([frame(1, '对局开始。')]);
    renderPanel();
    await screen.findByText('对局开始。');
    act(() => narration.emit(frame(1, '对局开始。')));
    await waitFor(() => {
      expect(screen.getAllByTestId('live-narration-frame')).toHaveLength(1);
    });
  });

  it('unsubscribes on unmount', async () => {
    const narration = stubNarration([]);
    const { unmount } = renderPanel();
    await waitFor(() => expect(narration.subscribe).toHaveBeenCalled());
    unmount();
    expect(narration.unsubscribe).toHaveBeenCalled();
  });
});

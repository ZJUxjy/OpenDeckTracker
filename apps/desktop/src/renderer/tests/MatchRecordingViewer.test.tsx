import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { MatchRecordingDetail } from '@hdt/core';

import { MatchRecordingViewer } from '../src/components/MatchRecordingViewer';
import { I18nProvider } from '../src/i18n';

function fakeDetail(overrides: Partial<MatchRecordingDetail> = {}): MatchRecordingDetail {
  return {
    recordingId: 'rec-1',
    status: 'completed',
    startedAt: 0,
    endedAt: 1000,
    metadata: {
      deckId: 42,
      deckName: 'Test Druid',
      opponentName: null,
      result: 'win',
      gameType: 3,
      formatType: 2,
      missionId: 0,
    },
    initialState: {
      originalDeck: [{ cardId: 'EX1_169', count: 2 }],
      startingHand: [{ entityId: 1, cardId: 'EX1_169', controllerId: 1 }],
      postMulliganHand: [{ entityId: 2, cardId: 'EX1_400', controllerId: 1 }],
    },
    finalSummary: null,
    timeline: [{ kind: 'draw', sourceEventIndex: 0 } as never],
    analysisEvents: [],
    narrationFrames: [],
    rawEvents: [],
    rawEventRefs: [],
    ...overrides,
  } as MatchRecordingDetail;
}

describe('MatchRecordingViewer', () => {
  let savedRecordings: typeof window.hdt.recordings;

  beforeEach(() => {
    savedRecordings = window.hdt.recordings;
  });

  afterEach(() => {
    (window.hdt as { recordings: typeof window.hdt.recordings }).recordings = savedRecordings;
  });

  function renderViewer(props: { open: boolean; recordingId: string | null }) {
    return render(
      <I18nProvider preference="en-US">
        <MatchRecordingViewer open={props.open} onOpenChange={() => undefined} recordingId={props.recordingId} />
      </I18nProvider>,
    );
  }

  it('calls window.hdt.recordings.get with the provided recordingId', async () => {
    const get = vi.fn().mockResolvedValue(fakeDetail());
    (window.hdt as { recordings: typeof window.hdt.recordings }).recordings = {
      ...savedRecordings,
      get,
    };

    await act(async () => {
      renderViewer({ open: true, recordingId: 'rec-1' });
    });

    await waitFor(() => expect(get).toHaveBeenCalledWith('rec-1'));
  });

  it('renders deck, hand, and timeline sections from the detail', async () => {
    const get = vi.fn().mockResolvedValue(fakeDetail());
    (window.hdt as { recordings: typeof window.hdt.recordings }).recordings = {
      ...savedRecordings,
      get,
    };

    await act(async () => {
      renderViewer({ open: true, recordingId: 'rec-1' });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('recording-deck')).not.toBeNull();
    });
    expect(screen.getByTestId('recording-deck').textContent).toContain('Test Druid');
    expect(screen.getByTestId('recording-starting-hand').textContent).toContain('EX1_169');
    expect(screen.getByTestId('recording-mulligan-hand').textContent).toContain('EX1_400');
    expect(screen.getByTestId('recording-timeline').textContent).toContain('draw');
  });

  it('renders narration frames in order', async () => {
    const get = vi.fn().mockResolvedValue(
      fakeDetail({
        narrationFrames: [
          {
            sequence: 0,
            sourceEventIndex: 0,
            eventKind: 'card-played',
            text: '我方使用了驯服宠物。',
            facts: { cardId: 'MEND_300' },
          },
          {
            sequence: 1,
            sourceEventIndex: 1,
            eventKind: 'card-played',
            text: '对手使用了心灵咒术师。',
            facts: { cardId: 'CORE_EX1_339' },
          },
        ],
      }),
    );
    (window.hdt as { recordings: typeof window.hdt.recordings }).recordings = {
      ...savedRecordings,
      get,
    };

    await act(async () => {
      renderViewer({ open: true, recordingId: 'rec-1' });
    });

    await waitFor(() => expect(screen.queryByTestId('recording-narration')).not.toBeNull());
    const text = screen.getByTestId('recording-narration').textContent ?? '';
    expect(text).toContain('我方使用了驯服宠物');
    expect(text).toContain('对手使用了心灵咒术师');
    expect(text.indexOf('我方使用了驯服宠物')).toBeLessThan(text.indexOf('对手使用了心灵咒术师'));
  });

  it('renders narration empty state for recordings without narration frames', async () => {
    const get = vi.fn().mockResolvedValue(fakeDetail({ narrationFrames: [] }));
    (window.hdt as { recordings: typeof window.hdt.recordings }).recordings = {
      ...savedRecordings,
      get,
    };

    await act(async () => {
      renderViewer({ open: true, recordingId: 'rec-1' });
    });

    await waitFor(() => expect(screen.queryByTestId('recording-narration')).not.toBeNull());
    expect(screen.getByTestId('recording-narration').textContent).toContain('No narration frames recorded.');
  });

  it('renders empty state when get returns null', async () => {
    const get = vi.fn().mockResolvedValue(null);
    (window.hdt as { recordings: typeof window.hdt.recordings }).recordings = {
      ...savedRecordings,
      get,
    };

    await act(async () => {
      renderViewer({ open: true, recordingId: 'missing' });
    });

    await waitFor(() => expect(screen.queryByTestId('recording-empty')).not.toBeNull());
  });

  it('does not call get when recordingId is null', async () => {
    const get = vi.fn();
    (window.hdt as { recordings: typeof window.hdt.recordings }).recordings = {
      ...savedRecordings,
      get,
    };

    await act(async () => {
      renderViewer({ open: true, recordingId: null });
    });

    expect(get).not.toHaveBeenCalled();
  });
});

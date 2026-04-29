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

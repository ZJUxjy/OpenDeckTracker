import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildMatchRecordingSummary,
  createEmptyMatchRecording,
  type MatchRecording,
} from '@hdt/core';
import { createMatchRecordingStore } from './match-recording-store';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hdt-match-recordings-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function completedRecording(overrides: Partial<MatchRecording> = {}): MatchRecording {
  const recording: MatchRecording = {
    ...createEmptyMatchRecording({
      recordingId: 'rec-a',
      startedAt: Date.parse('2026-04-28T10:00:00Z'),
    }),
    status: 'completed',
    endedAt: Date.parse('2026-04-28T10:10:00Z'),
    metadata: {
      deckId: 42,
      deckName: 'Tempo Mage',
      opponentName: 'Opponent',
      result: 'win',
      gameType: 4,
      formatType: 2,
      missionId: 0,
    },
    timeline: [{ kind: 'game-completed', sourceEventIndex: 2 }],
    ...overrides,
  };
  return {
    ...recording,
    finalSummary: buildMatchRecordingSummary(recording),
  };
}

describe('match-recording-store', () => {
  it('appends raw events to events.jsonl', () => {
    const store = createMatchRecordingStore(dir);
    store.appendRawEvent('rec-a', { type: 'create-game', raw: 'raw', content: 'content' });

    const path = join(dir, 'rec-a', 'events.jsonl');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8').trim()).toBe(
      JSON.stringify({ type: 'create-game', raw: 'raw', content: 'content' }),
    );
  });

  it('writes recording.json and lists completed summaries newest first', () => {
    const store = createMatchRecordingStore(dir);
    store.writeRecording(completedRecording({
      recordingId: 'older',
      startedAt: 100,
      endedAt: 200,
      finalSummary: null,
    }));
    store.writeRecording(completedRecording({
      recordingId: 'newer',
      startedAt: 300,
      endedAt: 400,
      finalSummary: null,
    }));
    store.writeRecording(createEmptyMatchRecording({ recordingId: 'in-progress', startedAt: 500 }));

    expect(store.listCompleted()).toMatchObject([
      { recordingId: 'newer', endedAt: 400 },
      { recordingId: 'older', endedAt: 200 },
    ]);
  });

  it('loads recording detail and returns null for missing IDs', () => {
    const store = createMatchRecordingStore(dir);
    const recording = completedRecording();
    store.writeRecording(recording);
    store.appendRawEvent(recording.recordingId, { type: 'create-game', raw: '', content: '' });
    store.appendRawEvent(recording.recordingId, { type: 'tag-change', raw: '', content: '' });

    expect(store.loadRecording('missing')).toBeNull();
    expect(store.loadRecording(recording.recordingId)).toMatchObject({
      recordingId: recording.recordingId,
      rawEvents: [{ type: 'create-game' }, { type: 'tag-change' }],
      finalSummary: { recordingId: recording.recordingId },
    });
  });

  it('loads recording detail by match fingerprint', () => {
    const store = createMatchRecordingStore(dir);
    const base = completedRecording({ recordingId: 'rec-1' });
    const recording: MatchRecording = {
      ...base,
      metadata: {
        ...base.metadata,
        matchFingerprint: 'match-v2-1000-1',
      },
      finalSummary: null,
    };
    store.writeRecording(recording);

    expect(store.loadRecording('match-v2-1000-1')?.recordingId).toBe('rec-1');
  });

  it('loads legacy recordings with empty analysis and narration arrays', async () => {
    const store = createMatchRecordingStore(dir);
    const legacy = completedRecording({ recordingId: 'legacy' }) as Partial<MatchRecording>;
    delete legacy.analysisEvents;
    delete legacy.narrationFrames;
    legacy.finalSummary = {
      recordingId: 'legacy',
      status: 'completed',
      startedAt: legacy.startedAt!,
      endedAt: legacy.endedAt!,
      deckId: 42,
      deckName: 'Tempo Mage',
      opponentName: 'Opponent',
      result: 'win',
      timelineEventCount: 1,
    } as MatchRecording['finalSummary'];
    await mkdir(join(dir, 'legacy'), { recursive: true });
    await writeFile(join(dir, 'legacy', 'recording.json'), `${JSON.stringify(legacy, null, 2)}\n`);

    expect(store.loadRecording('legacy')).toMatchObject({
      analysisEvents: [],
      narrationFrames: [],
      finalSummary: {
        analysisEventCount: 0,
        narrationFrameCount: 0,
      },
    });
    expect(store.listCompleted()[0]).toMatchObject({
      recordingId: 'legacy',
      analysisEventCount: 0,
      narrationFrameCount: 0,
    });
  });

  it('drops narration frames whose source event index is outside raw refs', async () => {
    const store = createMatchRecordingStore(dir);
    const recording = completedRecording({
      recordingId: 'rec-with-corrupt-frame',
      rawEventRefs: [{ index: 0, type: 'create-game' }],
      narrationFrames: [
        {
          sequence: 0,
          sourceEventIndex: 0,
          eventKind: 'game-started',
          text: '对局开始。',
          facts: {},
        },
        {
          sequence: 1,
          sourceEventIndex: 99,
          eventKind: 'card-played',
          text: 'corrupt',
          facts: {},
        },
      ],
    });
    store.writeRecording(recording);

    expect(store.loadRecording('rec-with-corrupt-frame')?.narrationFrames).toEqual([
      {
        sequence: 0,
        sourceEventIndex: 0,
        eventKind: 'game-started',
        text: '对局开始。',
        facts: {},
      },
    ]);
  });

  it('does not load by endedAt-only key', () => {
    const store = createMatchRecordingStore(dir);
    store.writeRecording(
      completedRecording({
        recordingId: 'rec-1',
        endedAt: 5_000,
      }),
    );

    expect(store.loadRecording('match-v2-1000-1')).toBeNull();
  });

  it('skips malformed recording directories', async () => {
    const store = createMatchRecordingStore(dir);
    await mkdir(join(dir, 'bad'), { recursive: true });
    await writeFile(join(dir, 'bad', 'recording.json'), '{bad json');

    expect(store.listCompleted()).toEqual([]);
    expect(store.loadRecording('bad')).toBeNull();
  });
});

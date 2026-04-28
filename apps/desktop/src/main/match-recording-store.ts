import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildMatchRecordingSummary,
  type MatchRecording,
  type MatchRecordingDetail,
  type MatchRecordingSummary,
} from '@hdt/core';

export interface MatchRecordingStore {
  appendRawEvent(recordingId: string, event: unknown): void;
  writeRecording(recording: MatchRecording): void;
  listCompleted(): MatchRecordingSummary[];
  loadRecording(recordingId: string): MatchRecordingDetail | null;
}

export function createMatchRecordingStore(rootDir: string): MatchRecordingStore {
  mkdirSync(rootDir, { recursive: true });

  return {
    appendRawEvent(recordingId, event) {
      const dir = ensureRecordingDir(rootDir, recordingId);
      appendFileSync(join(dir, 'events.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
    },

    writeRecording(recording) {
      const dir = ensureRecordingDir(rootDir, recording.recordingId);
      const normalized: MatchRecording = {
        ...recording,
        finalSummary:
          recording.status === 'completed' ? buildMatchRecordingSummary(recording) : recording.finalSummary,
      };
      writeFileSync(join(dir, 'recording.json'), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    },

    listCompleted() {
      return readRecordingDirs(rootDir)
        .map((recordingId) => readRecordingFile(rootDir, recordingId))
        .filter((recording): recording is MatchRecording => recording?.status === 'completed')
        .map((recording) => recording.finalSummary ?? buildMatchRecordingSummary(recording))
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    },

    loadRecording(recordingId) {
      const recording = readRecordingFile(rootDir, recordingId);
      if (recording === null) return null;
      return {
        ...recording,
        finalSummary: recording.finalSummary ?? buildMatchRecordingSummary(recording),
        rawEvents: readRawEvents(rootDir, recordingId),
      };
    },
  };
}

function ensureRecordingDir(rootDir: string, recordingId: string): string {
  const dir = join(rootDir, recordingId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readRecordingDirs(rootDir: string): string[] {
  if (!existsSync(rootDir)) return [];
  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function readRecordingFile(rootDir: string, recordingId: string): MatchRecording | null {
  const path = join(rootDir, recordingId, 'recording.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as MatchRecording;
  } catch {
    return null;
  }
}

function readRawEvents(rootDir: string, recordingId: string): unknown[] {
  const path = join(rootDir, recordingId, 'events.jsonl');
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((line) => line.length > 0);
  const events: unknown[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Ignore a partial/corrupt tail; the structured recording remains loadable.
    }
  }
  return events;
}

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  buildMatchRecordingSummary,
  type GameProgressAnalysisEvent,
  type GameProgressNarrationFrame,
  type MatchRecording,
  type MatchRecordingDetail,
  type MatchRecordingSummary,
  type RawEventRef,
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
      if (dir === null) return;
      appendFileSync(join(dir, 'events.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
    },

    writeRecording(recording) {
      const dir = ensureRecordingDir(rootDir, recording.recordingId);
      if (dir === null) return;
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

    loadRecording(idOrFingerprint) {
      const resolvedRecordingId = resolveRecordingId(rootDir, idOrFingerprint);
      if (resolvedRecordingId === null) return null;
      const recording = readRecordingFile(rootDir, resolvedRecordingId);
      if (recording === null) return null;
      return {
        ...recording,
        finalSummary: recording.finalSummary ?? buildMatchRecordingSummary(recording),
        rawEvents: readRawEvents(rootDir, resolvedRecordingId),
      };
    },
  };
}

// Renderer-supplied recordingId hits disk paths via `recordings:get` and
// the recorder's own appendRawEvent/writeRecording. Treat every join as
// potentially adversarial — reject anything that escapes `rootDir` or
// contains separators / parent-traversal segments / NUL. Returns the
// safe absolute path on success, or null when the input is malformed.
function safeRecordingPath(
  rootDir: string,
  recordingId: string,
  ...rest: string[]
): string | null {
  if (typeof recordingId !== 'string' || recordingId.length === 0 || recordingId.length > 256) {
    return null;
  }
  if (/[\\/\x00]/.test(recordingId) || recordingId === '.' || recordingId === '..') {
    return null;
  }
  const root = resolve(rootDir);
  const target = resolve(root, recordingId, ...rest);
  const rel = relative(root, target);
  if (rel.length === 0 || rel.startsWith('..') || /^[A-Za-z]:/.test(rel)) {
    return null;
  }
  return target;
}

function ensureRecordingDir(rootDir: string, recordingId: string): string | null {
  const dir = safeRecordingPath(rootDir, recordingId);
  if (dir === null) return null;
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
  const path = safeRecordingPath(rootDir, recordingId, 'recording.json');
  if (path === null) return null;
  if (!existsSync(path)) return null;
  try {
    return normalizeRecording(JSON.parse(readFileSync(path, 'utf8')) as MatchRecording);
  } catch {
    return null;
  }
}

function normalizeRecording(recording: MatchRecording): MatchRecording {
  const rawEventRefs = readArray<RawEventRef>(recording.rawEventRefs);
  const validSourceIndexes = new Set(rawEventRefs.map((ref) => ref.index));
  const normalized: MatchRecording = {
    ...recording,
    timeline: readArray(recording.timeline),
    rawEventRefs,
    analysisEvents: filterByValidSourceIndex(
      readArray<GameProgressAnalysisEvent>(recording.analysisEvents),
      validSourceIndexes,
    ),
    narrationFrames: filterByValidSourceIndex(
      readArray<GameProgressNarrationFrame>(recording.narrationFrames),
      validSourceIndexes,
    ),
    entities: readArray(recording.entities),
  };
  return {
    ...normalized,
    finalSummary: normalized.finalSummary === null
      ? null
      : buildMatchRecordingSummary(normalized),
  };
}

function readArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function filterByValidSourceIndex<T extends { sourceEventIndex: number }>(
  events: T[],
  validSourceIndexes: ReadonlySet<number>,
): T[] {
  return events.filter((event) => validSourceIndexes.has(event.sourceEventIndex));
}

function resolveRecordingId(rootDir: string, idOrFingerprint: string): string | null {
  if (readRecordingFile(rootDir, idOrFingerprint) !== null) return idOrFingerprint;
  for (const recordingId of readRecordingDirs(rootDir)) {
    const recording = readRecordingFile(rootDir, recordingId);
    if (recording === null) continue;
    if (recording.status !== 'completed' && recording.status !== 'incomplete') continue;
    if (recording.metadata.matchFingerprint === idOrFingerprint) return recording.recordingId;
  }
  return null;
}

function readRawEvents(rootDir: string, recordingId: string): unknown[] {
  const path = safeRecordingPath(rootDir, recordingId, 'events.jsonl');
  if (path === null) return [];
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

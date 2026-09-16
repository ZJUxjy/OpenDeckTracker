import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  buildMatchRecordingSummary,
  type GameProgressAnalysisEvent,
  type GameProgressNarrationFrame,
  type MatchRecording,
  type MatchRecordingDetail,
  type MatchRecordingSummary,
  type RawEventRef,
  type RecordedAdvisorHistoryEntry,
  type RecordingAnnotation,
} from '@hdt/core';

// Both real id shapes are confined to [A-Za-z0-9_-]: the recorder-generated
// `${isoStamp}_${hex}` and the `match-v2-${ts}-${seq}` fingerprint. This
// rejects any path metacharacter (`..`, `/`, `\`, `:`, …) before it reaches
// join(); a follow-up path.relative() containment check is defence-in-depth.
const RECORDING_ID_RE = /^[A-Za-z0-9_-]+$/;

function assertValidRecordingId(recordingId: string): void {
  if (!RECORDING_ID_RE.test(recordingId)) {
    throw new Error(`invalid recordingId: ${recordingId}`);
  }
}

function resolveRecordingDir(rootDir: string, recordingId: string): string {
  assertValidRecordingId(recordingId);
  const rootPath = resolve(rootDir);
  const resolvedDir = resolve(rootPath, recordingId);
  const rel = relative(rootPath, resolvedDir);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('invalid recording path outside recordings root');
  }
  return resolvedDir;
}

export interface MatchRecordingStore {
  appendRawEvent(recordingId: string, event: unknown): void;
  writeRecording(recording: MatchRecording): void;
  listCompleted(): MatchRecordingSummary[];
  loadRecording(recordingId: string, options?: { includeRawEvents?: boolean }): MatchRecordingDetail | null;
  saveAnnotation(recordingId: string, annotation: RecordingAnnotation): RecordingAnnotation[];
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

    loadRecording(idOrFingerprint, options) {
      const resolvedRecordingId = resolveRecordingId(rootDir, idOrFingerprint);
      if (resolvedRecordingId === null) return null;
      const recording = readRecordingFile(rootDir, resolvedRecordingId);
      if (recording === null) return null;
      return {
        ...recording,
        finalSummary: recording.finalSummary ?? buildMatchRecordingSummary(recording),
        rawEvents: options?.includeRawEvents === false ? [] : readRawEvents(rootDir, resolvedRecordingId),
        annotations: readAnnotations(rootDir, resolvedRecordingId),
      };
    },
    saveAnnotation(idOrFingerprint, annotation) {
      const id = resolveRecordingId(rootDir, idOrFingerprint);
      if (!id) throw new Error('Recording not found');
      const recording = readRecordingFile(rootDir, id);
      if (!validAnnotation(annotation) || !recording?.rawEventRefs.some(ref => ref.index === annotation.sourceEventIndex)) {
        throw new Error('Invalid recording annotation');
      }
      const annotations = readAnnotations(rootDir, id).filter(item => item.sourceEventIndex !== annotation.sourceEventIndex);
      if (annotation.bookmarked || annotation.note.trim()) annotations.push({
        sourceEventIndex: annotation.sourceEventIndex, bookmarked: annotation.bookmarked, note: annotation.note,
      });
      annotations.sort((a, b) => a.sourceEventIndex - b.sourceEventIndex);
      const path = join(resolveRecordingDir(rootDir, id), 'annotations.json');
      writeFileSync(`${path}.tmp`, JSON.stringify(annotations), 'utf8');
      renameSync(`${path}.tmp`, path);
      return annotations;
    },
  };
}

function ensureRecordingDir(rootDir: string, recordingId: string): string {
  const dir = resolveRecordingDir(rootDir, recordingId);
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
  const path = join(resolveRecordingDir(rootDir, recordingId), 'recording.json');
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
    advisorHistory: readArray<RecordedAdvisorHistoryEntry>(recording.advisorHistory),
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
  const path = join(resolveRecordingDir(rootDir, recordingId), 'events.jsonl');
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const events: unknown[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Preserve physical indexes so bookmarks never jump to a different event.
      events.push(null);
    }
  }
  return events;
}

function validAnnotation(value: unknown): value is RecordingAnnotation {
  if (!value || typeof value !== 'object') return false;
  const item = value as RecordingAnnotation;
  return Number.isSafeInteger(item.sourceEventIndex) && item.sourceEventIndex >= 0
    && typeof item.bookmarked === 'boolean' && typeof item.note === 'string' && item.note.length <= 4000;
}

function readAnnotations(rootDir: string, id: string): RecordingAnnotation[] {
  const path = join(resolveRecordingDir(rootDir, id), 'annotations.json');
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed) || !parsed.every(validAnnotation)) throw new Error('Invalid recording annotations');
  return parsed.map(item => ({ sourceEventIndex: item.sourceEventIndex, bookmarked: item.bookmarked, note: item.note }));
}

import { mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogFileWatcher, type HearthWatcherDiagnostic } from '..';

let dir: string;

beforeEach(async () => {
  vi.useFakeTimers();
  dir = await mkdtemp(join(tmpdir(), 'hdt-hearthwatcher-'));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

describe('LogFileWatcher', () => {
  it('starts live mode at EOF and emits only appended lines', async () => {
    const path = join(dir, 'Power.log');
    await writeFile(path, 'old\n');
    const lines: string[] = [];
    const watcher = new LogFileWatcher({ path, pollIntervalMs: 10 });
    watcher.onLine((line) => lines.push(line));

    await watcher.start();
    await appendFile(path, 'new\n');
    await watcher.poll();

    expect(lines).toEqual(['new']);
    watcher.stop();
  });

  it('replays from beginning when requested', async () => {
    const path = join(dir, 'Power.log');
    await writeFile(path, 'old\n');
    const lines: string[] = [];
    const watcher = new LogFileWatcher({ path, readFrom: 'beginning', pollIntervalMs: 10 });
    watcher.onLine((line) => lines.push(line));

    await watcher.start();

    expect(lines).toEqual(['old']);
    watcher.stop();
  });

  it('buffers partial lines until newline arrives', async () => {
    const path = join(dir, 'Power.log');
    await writeFile(path, '');
    const lines: string[] = [];
    const watcher = new LogFileWatcher({ path, pollIntervalMs: 10 });
    watcher.onLine((line) => lines.push(line));

    await watcher.start();
    await appendFile(path, 'par');
    await watcher.poll();
    await appendFile(path, 'tial\n');
    await watcher.poll();

    expect(lines).toEqual(['partial']);
    watcher.stop();
  });

  it('resets after truncation', async () => {
    const path = join(dir, 'Power.log');
    await writeFile(path, 'existing\n');
    const diagnostics: HearthWatcherDiagnostic[] = [];
    const lines: string[] = [];
    const watcher = new LogFileWatcher({ path, pollIntervalMs: 10 });
    watcher.onDiagnostic((diagnostic) => diagnostics.push(diagnostic));
    watcher.onLine((line) => lines.push(line));

    await watcher.start();
    await writeFile(path, 'fresh\n');
    await watcher.poll();

    expect(lines).toEqual(['fresh']);
    expect(diagnostics.some((diagnostic) => diagnostic.kind === 'rotation-or-truncation')).toBe(true);
    watcher.stop();
  });
});

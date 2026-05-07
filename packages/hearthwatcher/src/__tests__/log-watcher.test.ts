import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createHearthWatcher,
  type EventPhase,
  type HearthWatcherDiagnostic,
  type PowerEvent,
} from '..';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hdt-log-watcher-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('HearthWatcher', () => {
  it('emits parsed events from tailed Power.log lines', async () => {
    const path = join(dir, 'Power.log');
    await writeFile(path, '');
    const events: PowerEvent[] = [];
    const statuses: HearthWatcherDiagnostic[] = [];
    const watcher = createHearthWatcher({ powerLogPath: path, pollIntervalMs: 10 });
    watcher.onEvent((event) => events.push(event));
    watcher.onStatus((status) => statuses.push(status));

    await watcher.start();
    await appendFile(
      path,
      'D 00:00:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=64 tag=ZONE value=HAND\n',
    );
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tag-change', entity: 64, tag: 'ZONE', value: 'HAND' }),
    );
    expect(statuses.map((status) => status.kind)).toContain('ready');
    watcher.stop();
  });

  it('emits missing-log status when Power.log cannot be found', async () => {
    const statuses: HearthWatcherDiagnostic[] = [];
    const watcher = createHearthWatcher({
      powerLogPath: join(dir, 'missing.log'),
      discovery: { exists: async () => false },
    });
    watcher.onStatus((status) => statuses.push(status));

    await watcher.start();

    expect(statuses[0]?.kind).toBe('missing-log');
  });

  it('retries discovery after an initial missing-log status', async () => {
    const path = join(dir, 'Power.log');
    const statuses: HearthWatcherDiagnostic[] = [];
    const events: PowerEvent[] = [];
    let exists = false;
    const watcher = createHearthWatcher({
      pollIntervalMs: 10,
      discovery: {
        env: {},
        detectInstallDir: () => null,
        exists: async (candidate) => exists && candidate === path,
        candidatePaths: [path],
      },
    });
    watcher.onStatus((status) => statuses.push(status));
    watcher.onEvent((event) => events.push(event));

    await watcher.start();
    expect(statuses[0]?.kind).toBe('missing-log');

    await writeFile(path, '');
    exists = true;
    await new Promise((resolve) => setTimeout(resolve, 30));
    await appendFile(
      path,
      'D 00:00:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=64 tag=ZONE value=HAND  \n',
    );
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tag-change', entity: 64, tag: 'ZONE', value: 'HAND' }),
    );
    expect(statuses.at(-1)?.kind).toBe('ready');
    watcher.stop();
  });

  it('includes record type and raw line in parser-error diagnostics', async () => {
    const path = join(dir, 'Power.log');
    const malformedLine =
      'D 00:00:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE bad\n';
    await writeFile(path, malformedLine);
    const statuses: HearthWatcherDiagnostic[] = [];
    const watcher = createHearthWatcher({
      powerLogPath: path,
      readFrom: 'beginning',
      pollIntervalMs: 10,
    });
    watcher.onStatus((status) => statuses.push(status));

    await watcher.start();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(statuses).toContainEqual(
      expect.objectContaining({
        kind: 'parser-error',
        recordType: 'TAG_CHANGE',
        line: malformedLine.trimEnd(),
        path,
      }),
    );
    watcher.stop();
  });

  it('replays events from an active match before live tail starts', async () => {
    // Compose a Power.log that already contains a CREATE_GAME and
    // a few in-match events. The watcher should fire those as
    // phase='replay', then switch to phase='live' for anything
    // appended after start.
    const path = join(dir, 'Power.log');
    const preamble =
      'D 18:30:00.0000000 GameState.DebugPrintPower() - some prior log noise\n';
    const createGame =
      'D 18:42:00.0000000 GameState.DebugPrintPower() - CREATE_GAME\n';
    const replayedTagChange =
      'D 18:42:01.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=64 tag=ZONE value=HAND\n';
    await writeFile(path, preamble + createGame + replayedTagChange);

    const events: Array<{ event: PowerEvent; phase: EventPhase }> = [];
    const watcher = createHearthWatcher({ powerLogPath: path, pollIntervalMs: 10 });
    watcher.onEvent((event, phase) => events.push({ event, phase }));

    await watcher.start();
    // Live event after replay completes.
    await appendFile(
      path,
      'D 18:42:02.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=65 tag=ZONE value=DECK\n',
    );
    await new Promise((resolve) => setTimeout(resolve, 40));

    const replayed = events.filter((e) => e.phase === 'replay').map((e) => e.event);
    const live = events.filter((e) => e.phase === 'live').map((e) => e.event);

    expect(replayed).toContainEqual(
      expect.objectContaining({ type: 'create-game' }),
    );
    expect(replayed).toContainEqual(
      expect.objectContaining({ type: 'tag-change', entity: 64, tag: 'ZONE', value: 'HAND' }),
    );
    expect(live).toContainEqual(
      expect.objectContaining({ type: 'tag-change', entity: 65, tag: 'ZONE', value: 'DECK' }),
    );
    // Replayed events must NOT also be re-emitted as live.
    expect(live).not.toContainEqual(
      expect.objectContaining({ type: 'tag-change', entity: 64, tag: 'ZONE', value: 'HAND' }),
    );
    watcher.stop();
  });

  it('does not replay when the latest match has already completed', async () => {
    const path = join(dir, 'Power.log');
    const content =
      'D 18:42:00.0000000 GameState.DebugPrintPower() - CREATE_GAME\n' +
      'D 18:42:01.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=64 tag=ZONE value=HAND\n' +
      'D 18:48:42.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STATE value=COMPLETE\n';
    await writeFile(path, content);

    const events: Array<{ event: PowerEvent; phase: EventPhase }> = [];
    const watcher = createHearthWatcher({ powerLogPath: path, pollIntervalMs: 10 });
    watcher.onEvent((event, phase) => events.push({ event, phase }));

    await watcher.start();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(events.filter((e) => e.phase === 'replay')).toHaveLength(0);
    watcher.stop();
  });

  it('switches to a newer timestamped Power.log while running', async () => {
    const installDir = dir;
    const logsDir = join(installDir, 'Logs');
    const oldLogDir = join(logsDir, 'Hearthstone_2026_04_27_15_34_09');
    const newLogDir = join(logsDir, 'Hearthstone_2026_04_27_16_00_00');
    const oldPowerLog = join(oldLogDir, 'Power.log');
    const newPowerLog = join(newLogDir, 'Power.log');
    await mkdir(oldLogDir, { recursive: true });
    await writeFile(oldPowerLog, '');

    const statuses: HearthWatcherDiagnostic[] = [];
    const events: PowerEvent[] = [];
    const watcher = createHearthWatcher({
      pollIntervalMs: 10,
      latestLogCheckIntervalMs: 10,
      discovery: { env: {}, installDirs: [installDir], detectInstallDir: () => null },
    });
    watcher.onStatus((status) => statuses.push(status));
    watcher.onEvent((event) => events.push(event));

    await watcher.start();
    await appendFile(
      oldPowerLog,
      'D 00:00:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=64 tag=ZONE value=HAND\n',
    );
    await new Promise((resolve) => setTimeout(resolve, 30));

    await mkdir(newLogDir, { recursive: true });
    await writeFile(newPowerLog, '');
    await new Promise((resolve) => setTimeout(resolve, 40));
    await appendFile(
      newPowerLog,
      'D 00:00:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=65 tag=ZONE value=DECK\n',
    );
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(statuses).toContainEqual(expect.objectContaining({ path: newPowerLog }));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tag-change', entity: 64, tag: 'ZONE', value: 'HAND' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tag-change', entity: 65, tag: 'ZONE', value: 'DECK' }),
    );
    watcher.stop();
  });
});

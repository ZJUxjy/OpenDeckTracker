import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHearthWatcher, type HearthWatcherDiagnostic, type PowerEvent } from '..';

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
    const watcher = createHearthWatcher({ powerLogPath: path, pollIntervalMs: 10 });
    watcher.onEvent((event) => events.push(event));

    await watcher.start();
    await appendFile(
      path,
      'D 00:00:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=64 tag=ZONE value=HAND\n',
    );
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tag-change', entity: 64, tag: 'ZONE', value: 'HAND' }),
    );
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
});

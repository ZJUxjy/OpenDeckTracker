import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findCurrentMatchStartOffset } from './match-boundary';

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'hdt-match-boundary-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

let counter = 0;
async function fixture(content: string): Promise<string> {
  const path = join(workDir, `power-${counter++}.log`);
  await writeFile(path, content, 'utf8');
  return path;
}

const CREATE_LINE = 'D 18:42:01.0000000 GameState.DebugPrintPower() - CREATE_GAME\n';
const COMPLETE_LINE =
  'D 18:48:42.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STATE value=COMPLETE\n';
const FILLER = 'D 18:42:02.0000000 GameState.DebugPrintPower() - some unrelated event\n';

describe('findCurrentMatchStartOffset', () => {
  it('returns null when the file is empty', async () => {
    const path = await fixture('');
    expect(await findCurrentMatchStartOffset(path)).toBeNull();
  });

  it('returns null when the file has no CREATE_GAME marker', async () => {
    const path = await fixture(FILLER.repeat(50));
    expect(await findCurrentMatchStartOffset(path)).toBeNull();
  });

  it('returns the line-start offset of the only CREATE_GAME (active match)', async () => {
    const prelude = FILLER.repeat(3);
    const tail = FILLER.repeat(5);
    const path = await fixture(prelude + CREATE_LINE + tail);
    const offset = await findCurrentMatchStartOffset(path);
    expect(offset).toBe(Buffer.byteLength(prelude, 'utf8'));
  });

  it('returns null when the only CREATE_GAME is already followed by STATE=COMPLETE', async () => {
    const path = await fixture(FILLER + CREATE_LINE + FILLER + COMPLETE_LINE + FILLER);
    expect(await findCurrentMatchStartOffset(path)).toBeNull();
  });

  it('returns the latest CREATE_GAME when the previous match completed and a new one began', async () => {
    const oldMatch = FILLER + CREATE_LINE + FILLER + COMPLETE_LINE + FILLER;
    const newMatch = CREATE_LINE + FILLER.repeat(3);
    const path = await fixture(oldMatch + newMatch);
    const offset = await findCurrentMatchStartOffset(path);
    expect(offset).toBe(Buffer.byteLength(oldMatch, 'utf8'));
  });

  it('returns null when even the newest CREATE_GAME has already completed', async () => {
    const oldMatch = CREATE_LINE + FILLER + COMPLETE_LINE;
    const newMatch = CREATE_LINE + FILLER + COMPLETE_LINE;
    const path = await fixture(oldMatch + newMatch);
    expect(await findCurrentMatchStartOffset(path)).toBeNull();
  });

  it('finds the marker even when a chunk boundary slices the CREATE_GAME line in half', async () => {
    // Compose a file where the chunk boundary lands in the MIDDLE of
    // the CREATE_GAME literal when a small chunk window is used.
    // The locator must splice the new chunk with the previous tail
    // to detect the marker. Use FILLER (which ends in '\n') for the
    // prelude so the CREATE_GAME line genuinely starts after a
    // newline rather than running into it.
    const prelude = FILLER;
    const path = await fixture(prelude + CREATE_LINE + FILLER);
    // chunkSize chosen so the backward window's leading edge lands
    // inside the CREATE_GAME literal. Total length is around 211;
    // a 64-byte chunk means the first read covers [~147, 211) — the
    // boundary at byte 147 sits inside the CREATE_GAME line.
    const offset = await findCurrentMatchStartOffset(path, { chunkSize: 64 });
    expect(offset).toBe(Buffer.byteLength(prelude, 'utf8'));
  });

  it('handles a CREATE_GAME at the very start of the file (no preceding newline)', async () => {
    const path = await fixture(CREATE_LINE + FILLER);
    expect(await findCurrentMatchStartOffset(path)).toBe(0);
  });

  it('returns the latest CREATE_GAME among many, when the latest is still active', async () => {
    let blob = '';
    let lastOffset = 0;
    for (let i = 0; i < 5; i++) {
      lastOffset = Buffer.byteLength(blob, 'utf8');
      blob += CREATE_LINE + FILLER + COMPLETE_LINE + FILLER;
    }
    const lastActiveOffset = Buffer.byteLength(blob, 'utf8');
    blob += CREATE_LINE + FILLER.repeat(3); // active, no COMPLETE
    const path = await fixture(blob);
    expect(lastOffset).toBeLessThan(lastActiveOffset); // sanity
    expect(await findCurrentMatchStartOffset(path)).toBe(lastActiveOffset);
  });
});

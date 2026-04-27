import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createParserDiagnostics, parsePowerLine } from '..';

const testDir = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string[] =>
  readFileSync(join(testDir, 'fixtures', name), 'utf8').trim().split(/\r?\n/);

describe('parsePowerLine', () => {
  it('parses core Power.log records', () => {
    const events = fixture('power-basic-game.log').map((line) => parsePowerLine(line));

    expect(events[0]?.type).toBe('create-game');
    expect(events[1]).toMatchObject({
      type: 'full-entity',
      entityId: 64,
      cardId: 'CS2_029',
      tags: { CONTROLLER: 1, ZONE: 'DECK' },
    });
    expect(events[2]).toMatchObject({
      type: 'tag-change',
      entity: 64,
      tag: 'ZONE',
      value: 'HAND',
    });
    expect(events[3]).toMatchObject({
      type: 'show-entity',
      entity: 64,
      cardId: 'CS2_029',
    });
    expect(events[4]).toMatchObject({
      type: 'hide-entity',
      entity: 65,
      tags: { ZONE: 'HAND' },
    });
    expect(events[5]).toMatchObject({
      type: 'change-entity',
      entity: 64,
      cardId: 'CS2_032',
    });
    expect(events[6]).toMatchObject({
      type: 'block-start',
      blockType: 'PLAY',
      entity: 64,
      effectCardId: '',
      target: null,
      subOption: -1,
    });
    expect(events[7]?.type).toBe('block-end');
    expect(events[8]).toMatchObject({ type: 'shuffle-deck', playerId: 1 });
  });

  it('ignores unknown lines without incrementing diagnostics', () => {
    const diagnostics = createParserDiagnostics();
    expect(parsePowerLine('D 00:00:00.0000000 GameState.DebugPrintPower() - NOISE', { diagnostics }))
      .toBeNull();
    expect(diagnostics.malformedRecords).toBe(0);
  });

  it('diagnoses malformed supported lines', () => {
    const diagnostics = createParserDiagnostics();
    expect(parsePowerLine('D 00:00:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE bad', { diagnostics }))
      .toBeNull();
    expect(diagnostics.malformedRecords).toBe(1);
    expect(diagnostics.byRecordType.TAG_CHANGE).toBe(1);
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createParserDiagnostics, parsePowerLine, PowerLineStreamingParser } from '..';

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

  it('parses TAG_CHANGE records with trailing whitespace', () => {
    const diagnostics = createParserDiagnostics();
    const event = parsePowerLine(
      'D 00:00:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=1 tag=STATE value=RUNNING  ',
      { diagnostics },
    );

    expect(event).toMatchObject({
      type: 'tag-change',
      entity: 1,
      tag: 'STATE',
      value: 'RUNNING',
    });
    expect(diagnostics.malformedRecords).toBe(0);
  });

  it('parses TAG_CHANGE records with definition-change value suffixes', () => {
    const diagnostics = createParserDiagnostics();
    const event = parsePowerLine(
      'D 20:39:07.9485103 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=foo id=130 zone=SETASIDE zonePos=0 cardId=TLC_100t1 player=1] tag=MODULAR_ENTITY_PART_1 value=117779 DEF CHANGE',
      { diagnostics },
    );

    expect(event).toMatchObject({
      type: 'tag-change',
      entity: 130,
      tag: 'MODULAR_ENTITY_PART_1',
      value: '117779 DEF CHANGE',
    });
    expect(diagnostics.malformedRecords).toBe(0);
  });

  it('parses BLOCK_START records with EffectIndex and collection EffectCardId', () => {
    const diagnostics = createParserDiagnostics();
    const event = parsePowerLine(
      'D 17:57:12.7673221 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=foo id=26 zone=HAND zonePos=1 cardId=EDR_270 player=1] EffectCardId=System.Collections.Generic.List`1[System.String] EffectIndex=0 Target=0 SubOption=-1 ',
      { diagnostics },
    );

    expect(event).toMatchObject({
      type: 'block-start',
      blockType: 'PLAY',
      entity: 26,
      effectCardId: 'System.Collections.Generic.List`1[System.String]',
      target: null,
      subOption: -1,
    });
    expect(diagnostics.malformedRecords).toBe(0);
  });

  it('emits indented tag continuations as tag-change events targeting the open block', () => {
    // The Power.log emits FULL_ENTITY / SHOW_ENTITY etc. as multi-line
    // blocks: a header followed by indented `tag=KEY value=VAL` rows
    // carrying the intrinsic stats. The line-at-a-time `parsePowerLine`
    // returns null for those continuations; the streaming variant
    // re-emits them as synthetic tag-change events for the most recent
    // entity block.
    const parser = new PowerLineStreamingParser();
    const lines = [
      'D 21:56:59.8995687 PowerTaskList.DebugPrintPower() -     SHOW_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=10 zone=DECK zonePos=0 cardId= player=1] CardID=DINO_434',
      'D 21:56:59.8995687 PowerTaskList.DebugPrintPower() -         tag=ATK value=4',
      'D 21:56:59.8995687 PowerTaskList.DebugPrintPower() -         tag=HEALTH value=4',
      'D 21:56:59.8995687 PowerTaskList.DebugPrintPower() -         tag=TAUNT value=1',
      'D 21:56:59.8995687 PowerTaskList.DebugPrintPower() -         tag=DIVINE_SHIELD value=1',
    ];
    const events = lines.map((line) => parser.parse(line));

    expect(events[0]?.type).toBe('show-entity');
    expect(events[1]).toMatchObject({ type: 'tag-change', entity: 10, tag: 'ATK', value: 4 });
    expect(events[2]).toMatchObject({ type: 'tag-change', entity: 10, tag: 'HEALTH', value: 4 });
    expect(events[3]).toMatchObject({ type: 'tag-change', entity: 10, tag: 'TAUNT', value: 1 });
    expect(events[4]).toMatchObject({
      type: 'tag-change',
      entity: 10,
      tag: 'DIVINE_SHIELD',
      value: 1,
    });
  });

  it('a non-continuation line (TAG_CHANGE / BLOCK_START / fresh FULL_ENTITY) closes the block', () => {
    const parser = new PowerLineStreamingParser();
    const lines = [
      // FULL_ENTITY block opens.
      'D 17:57:12.7769580 PowerTaskList.DebugPrintPower() -         FULL_ENTITY - Updating [entityName=foo id=82 zone=SETASIDE zonePos=0 cardId=END_009 player=1] CardID=END_009',
      'D 17:57:12.7769580 PowerTaskList.DebugPrintPower() -             tag=ATK value=2',
      // Independent TAG_CHANGE — should NOT inherit entity 82.
      'D 17:57:12.7769580 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[id=99 zone=PLAY] tag=DAMAGE value=3',
      // After that close, a stray indented `tag=` line has no open block,
      // so it must NOT be re-emitted.
      'D 17:57:12.7769580 PowerTaskList.DebugPrintPower() -             tag=HEALTH value=5',
    ];
    const events = lines.map((line) => parser.parse(line));

    expect(events[0]?.type).toBe('full-entity');
    expect(events[1]).toMatchObject({ type: 'tag-change', entity: 82, tag: 'ATK' });
    expect(events[2]).toMatchObject({ type: 'tag-change', entity: 99, tag: 'DAMAGE' });
    expect(events[3]).toBeNull();
  });

  it('parses FULL_ENTITY updating records', () => {
    const diagnostics = createParserDiagnostics();
    const event = parsePowerLine(
      'D 17:57:12.7769580 PowerTaskList.DebugPrintPower() -         FULL_ENTITY - Updating [entityName=foo id=82 zone=SETASIDE zonePos=0 cardId=END_009 player=1] CardID=END_009',
      { diagnostics },
    );

    expect(event).toMatchObject({
      type: 'full-entity',
      entityId: 82,
      cardId: 'END_009',
      tags: { ZONE: 'SETASIDE' },
    });
    expect(diagnostics.malformedRecords).toBe(0);
  });
});

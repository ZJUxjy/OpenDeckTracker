import { parseLogLine, type LogLine } from '../log-line';
import {
  createParserDiagnostics,
  recordMalformedRecord,
  type ParserDiagnostics,
} from '../types/diagnostics';
import type { PowerEvent, PowerEntityRef } from '../types/power-events';
import {
  normalizePowerTagName,
  parsePowerTagValue,
  type PowerTagMap,
} from '../types/power-tags';
import {
  BLOCK_END_RE,
  BLOCK_START_RE,
  CHANGE_ENTITY_RE,
  CREATE_GAME_RE,
  FULL_ENTITY_RE,
  HIDE_ENTITY_RE,
  SHOW_ENTITY_RE,
  SHUFFLE_DECK_RE,
  TAG_CHANGE_RE,
} from './power-patterns';

export interface ParsePowerLineOptions {
  diagnostics?: ParserDiagnostics;
}

export function parsePowerLine(
  rawOrLine: string | LogLine,
  options: ParsePowerLineOptions = {},
): PowerEvent | null {
  const line = typeof rawOrLine === 'string' ? parseLogLine(rawOrLine) : rawOrLine;
  const diagnostics = options.diagnostics ?? createParserDiagnostics();
  const base = basePowerEvent(line);

  const content = line.content.trim();
  if (CREATE_GAME_RE.test(content)) {
    return { ...base, type: 'create-game' };
  }

  if (content.startsWith('FULL_ENTITY')) {
    const match = FULL_ENTITY_RE.exec(content);
    if (!match) return malformed(diagnostics, 'FULL_ENTITY');
    const entityId =
      match[1] === undefined ? numericEntityRef(parseEntityRef(match[3] ?? '')) : Number(match[1]);
    if (entityId === null) return malformed(diagnostics, 'FULL_ENTITY');
    return {
      ...base,
      type: 'full-entity',
      entityId,
      cardId: match[2] ?? match[4] ?? '',
      tags: parseInlineTags(content),
    };
  }

  if (content.startsWith('SHOW_ENTITY')) {
    const match = SHOW_ENTITY_RE.exec(content);
    if (!match) return malformed(diagnostics, 'SHOW_ENTITY');
    return {
      ...base,
      type: 'show-entity',
      entity: parseEntityRef(match[1] ?? ''),
      cardId: match[2] ?? '',
      tags: parseInlineTags(content),
    };
  }

  if (content.startsWith('HIDE_ENTITY')) {
    const match = HIDE_ENTITY_RE.exec(content);
    if (!match) return malformed(diagnostics, 'HIDE_ENTITY');
    return {
      ...base,
      type: 'hide-entity',
      entity: parseEntityRef(match[1] ?? ''),
      tags: parseInlineTags(content),
    };
  }

  if (content.startsWith('CHANGE_ENTITY')) {
    const match = CHANGE_ENTITY_RE.exec(content);
    if (!match) return malformed(diagnostics, 'CHANGE_ENTITY');
    return {
      ...base,
      type: 'change-entity',
      entity: parseEntityRef(match[1] ?? ''),
      cardId: match[2] ?? '',
      tags: parseInlineTags(content),
    };
  }

  if (content.startsWith('TAG_CHANGE')) {
    const match = TAG_CHANGE_RE.exec(content);
    if (!match) return malformed(diagnostics, 'TAG_CHANGE');
    return {
      ...base,
      type: 'tag-change',
      entity: parseEntityRef(match[1] ?? ''),
      tag: normalizePowerTagName(match[2] ?? ''),
      value: parsePowerTagValue((match[3] ?? '').trim()),
    };
  }

  if (content.startsWith('BLOCK_START')) {
    const match = BLOCK_START_RE.exec(content);
    if (!match) return malformed(diagnostics, 'BLOCK_START');
    return {
      ...base,
      type: 'block-start',
      blockType: match[1] ?? '',
      entity: parseNullableEntityRef(match[2] ?? ''),
      effectCardId: (match[3] ?? '').trim(),
      target: parseNullableEntityRef(match[4] ?? ''),
      subOption: match[5] === undefined ? null : Number(match[5]),
    };
  }

  if (BLOCK_END_RE.test(content)) {
    return { ...base, type: 'block-end' };
  }

  if (content.startsWith('SHUFFLE_DECK')) {
    const match = SHUFFLE_DECK_RE.exec(content);
    if (!match) return malformed(diagnostics, 'SHUFFLE_DECK');
    return {
      ...base,
      type: 'shuffle-deck',
      playerId: match[1] === undefined ? null : Number(match[1]),
    };
  }

  return null;
}

/**
 * Streaming variant that captures Power.log block continuations.
 *
 * Power.log emits multi-line blocks like:
 *
 *   FULL_ENTITY - Updating [id=10 ... cardId=DINO_434]
 *       tag=ATK value=4
 *       tag=HEALTH value=4
 *       tag=TAUNT value=1
 *
 * The header line ('FULL_ENTITY ...') carries minimal inline data; the
 * intrinsic tags (ATK / HEALTH / TAUNT / DIVINE_SHIELD / etc.) appear on
 * indented continuation lines. The stateless `parsePowerLine` returns
 * `null` for those continuations because they don't match any record-
 * type prefix, which means downstream consumers never see them.
 *
 * This streaming parser keeps the entity ref of the most recently
 * opened FULL_/SHOW_/CHANGE_/HIDE_ENTITY block and re-emits each
 * continuation `tag=K value=V` line as a synthetic `tag-change`
 * targeting that entity. Any line that's not a continuation closes the
 * block context — TAG_CHANGE / BLOCK_START / a fresh FULL_ENTITY etc.
 *
 * One instance must back the whole stream (replay + live tail) so
 * blocks straddling the replay→live boundary stay correctly attributed.
 */
const TAG_CONTINUATION_RE = /^tag=([A-Za-z0-9_]+)\s+value=(.+?)\s*$/;

export class PowerLineStreamingParser {
  private lastBlockEntityRef: PowerEntityRef | null = null;

  parse(
    rawOrLine: string | LogLine,
    options: ParsePowerLineOptions = {},
  ): PowerEvent | null {
    const line = typeof rawOrLine === 'string' ? parseLogLine(rawOrLine) : rawOrLine;
    const trimmed = line.content.trim();

    // Tag-continuation: only meaningful while a block is open.
    if (this.lastBlockEntityRef !== null) {
      const tagMatch = TAG_CONTINUATION_RE.exec(trimmed);
      if (tagMatch !== null) {
        return {
          ...basePowerEvent(line),
          type: 'tag-change',
          entity: this.lastBlockEntityRef,
          tag: normalizePowerTagName(tagMatch[1] ?? ''),
          value: parsePowerTagValue((tagMatch[2] ?? '').trim()),
        };
      }
    }

    const event = parsePowerLine(line, options);
    if (event === null) {
      // An unhandled / malformed line ends the current block.
      this.lastBlockEntityRef = null;
      return null;
    }
    switch (event.type) {
      case 'full-entity':
        this.lastBlockEntityRef = event.entityId;
        break;
      case 'show-entity':
      case 'change-entity':
      case 'hide-entity':
        this.lastBlockEntityRef = event.entity;
        break;
      default:
        // TAG_CHANGE, BLOCK_START/END, CREATE_GAME, SHUFFLE_DECK all close
        // the current FULL_ENTITY-style block context.
        this.lastBlockEntityRef = null;
    }
    return event;
  }

  reset(): void {
    this.lastBlockEntityRef = null;
  }
}

export function parseEntityRef(value: string): PowerEntityRef {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const idMatch = /\bid=(\d+)\b/.exec(trimmed);
  if (idMatch) return Number(idMatch[1]);

  return trimmed;
}

function parseNullableEntityRef(value: string): PowerEntityRef | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '0' || trimmed === 'null') return null;
  return parseEntityRef(trimmed);
}

function parseInlineTags(content: string): PowerTagMap {
  const tags: PowerTagMap = {};
  for (const match of content.matchAll(/\btag=([A-Za-z0-9_]+)\s+value=([^\]\s]+)/g)) {
    tags[normalizePowerTagName(match[1] ?? '')] = parsePowerTagValue(match[2] ?? '');
  }
  for (const match of content.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z0-9_]+)\b/g)) {
    const rawKey = match[1] ?? '';
    const key = normalizePowerTagName(rawKey === 'player' ? 'PLAYER_ID' : rawKey);
    if (
      key === 'CARDID' ||
      key === 'ENTITY' ||
      key === 'ID' ||
      key === 'ENTITYNAME' ||
      key === 'CARDTYPE' ||
      key === 'ZONEPOS'
    ) {
      continue;
    }
    tags[key] = parsePowerTagValue(match[2] ?? '');
  }
  return tags;
}

function malformed(diagnostics: ParserDiagnostics, recordType: string): null {
  recordMalformedRecord(diagnostics, recordType);
  return null;
}

function numericEntityRef(value: PowerEntityRef): number | null {
  return typeof value === 'number' ? value : null;
}

function basePowerEvent(line: LogLine): Pick<PowerEvent, 'raw' | 'content' | 'timestamp'> {
  return line.timestamp === undefined
    ? { raw: line.raw, content: line.content }
    : { raw: line.raw, content: line.content, timestamp: line.timestamp };
}

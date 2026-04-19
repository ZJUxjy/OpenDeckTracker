import { writeVarint } from './varint';
import type { DeckBlueprint, DeckCardEntry } from './types';

const RESERVED = 0x00;
const VERSION = 0x01;

export function encodeDeck(blueprint: DeckBlueprint): string {
  const out: number[] = [RESERVED, VERSION];
  writeVarint(out, blueprint.format);

  const writeArray = (arr: readonly number[]): void => {
    writeVarint(out, arr.length);
    for (const v of arr) writeVarint(out, v);
  };

  writeArray(blueprint.heroes);

  const oneCopy: number[] = [];
  const twoCopy: number[] = [];
  const nCopy: DeckCardEntry[] = [];

  for (const c of blueprint.cards) {
    if (!Number.isInteger(c.count) || c.count <= 0) {
      throw new Error(
        `encodeDeck: card count must be positive integer, got ${c.count} (dbfId=${c.dbfId})`,
      );
    }
    if (c.count === 1) oneCopy.push(c.dbfId);
    else if (c.count === 2) twoCopy.push(c.dbfId);
    else nCopy.push({ dbfId: c.dbfId, count: c.count });
  }

  oneCopy.sort((a, b) => a - b);
  twoCopy.sort((a, b) => a - b);
  nCopy.sort((a, b) => a.dbfId - b.dbfId);

  writeArray(oneCopy);
  writeArray(twoCopy);

  writeVarint(out, nCopy.length);
  for (const { dbfId, count } of nCopy) {
    writeVarint(out, dbfId);
    writeVarint(out, count);
  }

  return Buffer.from(out).toString('base64');
}

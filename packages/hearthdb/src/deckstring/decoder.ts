import { readVarint } from './varint';
import type { DeckBlueprint, DeckCardEntry, DeckFormat } from './types';

const RESERVED = 0x00;
const VERSION = 0x01;

export function decodeDeck(deckstring: string): DeckBlueprint {
  if (!deckstring) throw new Error('decodeDeck: empty input');

  let buf: Buffer;
  try {
    buf = Buffer.from(deckstring, 'base64');
  } catch (e) {
    throw new Error(`decodeDeck: invalid base64: ${(e as Error).message}`);
  }
  if (buf.length === 0) throw new Error('decodeDeck: empty buffer (invalid base64?)');
  if (buf.length < 4) throw new Error(`decodeDeck: too short (${buf.length} bytes)`);
  if (buf[0] !== RESERVED) {
    throw new Error(`decodeDeck: reserved byte must be 0x00, got 0x${buf[0]!.toString(16)}`);
  }
  if (buf[1] !== VERSION) {
    throw new Error(`decodeDeck: unsupported version ${buf[1]}, expected ${VERSION}`);
  }

  let off = 2;
  const [formatVal, fmtLen] = readVarint(buf, off);
  off += fmtLen;

  const readArray = (): number[] => {
    const [count, lenA] = readVarint(buf, off);
    off += lenA;
    const arr: number[] = [];
    for (let i = 0; i < count; i++) {
      const [v, lenB] = readVarint(buf, off);
      off += lenB;
      arr.push(v);
    }
    return arr;
  };

  const heroes = readArray();
  const oneCopy = readArray();
  const twoCopy = readArray();

  const [nCount, lenN] = readVarint(buf, off);
  off += lenN;
  const nCopy: DeckCardEntry[] = [];
  for (let i = 0; i < nCount; i++) {
    const [dbfId, lenA] = readVarint(buf, off);
    off += lenA;
    const [count, lenB] = readVarint(buf, off);
    off += lenB;
    nCopy.push({ dbfId, count });
  }

  const cards: DeckCardEntry[] = [
    ...oneCopy.map((dbfId) => ({ dbfId, count: 1 })),
    ...twoCopy.map((dbfId) => ({ dbfId, count: 2 })),
    ...nCopy,
  ];

  return { format: formatVal as DeckFormat, heroes, cards };
}

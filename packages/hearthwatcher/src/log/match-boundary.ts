import { open, type FileHandle } from 'node:fs/promises';

/**
 * Power.log markers used to bracket a match.
 *
 * Hearthstone's Power.log appends an unambiguous "CREATE_GAME" line
 * at the start of every match, and tags the GameEntity with
 * `STATE value=COMPLETE` when the match ends. We use those two
 * landmarks to locate the byte offset where the *currently active*
 * match begins — the live tail can then read forward from there to
 * replay events the watcher missed by starting late.
 */
const CREATE_GAME_MARKER = 'CREATE_GAME';
const COMPLETE_MARKER = 'TAG_CHANGE Entity=GameEntity tag=STATE value=COMPLETE';

const DEFAULT_CHUNK_SIZE = 64 * 1024;
const LINE_LOOKBACK_CHUNK = 4 * 1024;

/**
 * Find the byte offset where the *current active* match begins in a
 * Power.log file.
 *
 * Returns:
 *   - `null` if the file has no `CREATE_GAME` marker at all
 *   - `null` if the most recent `CREATE_GAME` is followed by a
 *     `STATE value=COMPLETE` tag (the latest match has already ended,
 *     so there's nothing live to replay)
 *   - the byte offset of the first character of the most recent
 *     `CREATE_GAME` line otherwise (replay candidate)
 *
 * The search reads the file *backward* in bounded chunks so a
 * Power.log of arbitrary size (these accumulate across sessions and
 * can reach hundreds of MB) doesn't cost a full scan.
 *
 * Two passes:
 *   1. Locate the rightmost (= latest) "CREATE_GAME" literal by
 *      scanning chunks back-to-front; chunks overlap by the marker
 *      length so a marker straddling a boundary is still detected.
 *   2. Walk backward from that literal byte-by-byte to find the
 *      preceding newline (line start). Done as a separate small read
 *      pass so the line prefix can be longer than the marker
 *      overlap without affecting correctness.
 */
export async function findCurrentMatchStartOffset(
  filePath: string,
  options: { chunkSize?: number } = {},
): Promise<number | null> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  if (chunkSize <= 0) throw new Error('chunkSize must be positive');

  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const size = stat.size;
    if (size === 0) return null;

    const createGameLiteralOffset = await findLastMarkerOffset(
      handle,
      size,
      CREATE_GAME_MARKER,
      chunkSize,
    );
    if (createGameLiteralOffset === null) return null;

    const lineStart = await findLineStartBefore(handle, createGameLiteralOffset);

    // Active vs completed: if the COMPLETE marker appears anywhere
    // after the CREATE_GAME line, the latest match has finished.
    const tailAfter = await readRangeAsUtf8(handle, lineStart, size);
    if (tailAfter.includes(COMPLETE_MARKER)) return null;

    return lineStart;
  } finally {
    await handle.close();
  }
}

/**
 * Locate the rightmost occurrence of `marker` in the file. Returns
 * the byte offset of the first character of the marker literal, or
 * `null` if the marker never appears.
 *
 * Scans backward in `chunkSize` chunks; each chunk is concatenated
 * with `marker.length - 1` bytes of overlap from the previous chunk
 * so a marker straddling the boundary is still detected.
 */
async function findLastMarkerOffset(
  handle: FileHandle,
  size: number,
  marker: string,
  chunkSize: number,
): Promise<number | null> {
  const overlap = marker.length - 1;
  let endByte = size;
  let tail = '';

  while (endByte > 0) {
    const readLen = Math.min(chunkSize, endByte);
    const startByte = endByte - readLen;
    const buffer = Buffer.alloc(readLen);
    await handle.read(buffer, 0, readLen, startByte);
    const text = buffer.toString('utf8') + tail;

    const idxInText = text.lastIndexOf(marker);
    if (idxInText !== -1) {
      return startByte + idxInText;
    }

    tail = text.slice(0, Math.min(overlap, text.length));
    endByte = startByte;
  }

  return null;
}

/**
 * Walk backward from `byteOffset` to the byte right after the most
 * recent `\n`, or to 0 if no newline exists earlier in the file.
 * Reads in `LINE_LOOKBACK_CHUNK`-sized batches so we don't issue a
 * read per byte.
 */
async function findLineStartBefore(handle: FileHandle, byteOffset: number): Promise<number> {
  if (byteOffset === 0) return 0;
  let pos = byteOffset;
  while (pos > 0) {
    const start = Math.max(0, pos - LINE_LOOKBACK_CHUNK);
    const len = pos - start;
    const buffer = Buffer.alloc(len);
    await handle.read(buffer, 0, len, start);
    for (let i = buffer.length - 1; i >= 0; i--) {
      if (buffer[i] === 0x0a /* '\n' */) return start + i + 1;
    }
    pos = start;
  }
  return 0;
}

async function readRangeAsUtf8(handle: FileHandle, start: number, end: number): Promise<string> {
  const length = end - start;
  if (length <= 0) return '';
  const buffer = Buffer.alloc(length);
  await handle.read(buffer, 0, length, start);
  return buffer.toString('utf8');
}

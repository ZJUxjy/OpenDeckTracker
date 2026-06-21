import { open, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import type { HearthWatcherDiagnostic } from './types/diagnostics';

export type LogFileReadMode = 'end' | 'beginning';

export interface LogFileWatcherOptions {
  path: string;
  readFrom?: LogFileReadMode;
  /**
   * Explicit byte offset to start tailing from. When provided, takes
   * precedence over `readFrom`. Used by the live tailer after a
   * mid-match replay so we resume exactly where the replay left off.
   */
  startOffset?: number;
  pollIntervalMs?: number;
  maxBytesPerTick?: number;
  maxBufferedLines?: number;
}

type LineHandler = (line: string) => void;
type DiagnosticHandler = (diagnostic: HearthWatcherDiagnostic) => void;

export class LogFileWatcher {
  private readonly path: string;
  private readonly readFrom: LogFileReadMode;
  private readonly explicitStartOffset: number | null;
  private readonly pollIntervalMs: number;
  private readonly maxBytesPerTick: number;
  private readonly maxBufferedLines: number;
  private readonly lineHandlers = new Set<LineHandler>();
  private readonly diagnosticHandlers = new Set<DiagnosticHandler>();
  private timer: NodeJS.Timeout | null = null;
  private offset = 0;
  // Held as raw bytes (not a decoded string) so a multi-byte UTF-8 sequence
  // split across a read boundary (the 256 KB tick cap or a short OS read) is
  // reassembled on the next chunk instead of being turned into U+FFFD.
  private partial = Buffer.alloc(0);
  private started = false;
  private polling = false;

  constructor(options: LogFileWatcherOptions) {
    this.path = options.path;
    this.readFrom = options.readFrom ?? 'end';
    this.explicitStartOffset = options.startOffset ?? null;
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.maxBytesPerTick = options.maxBytesPerTick ?? 256 * 1024;
    this.maxBufferedLines = options.maxBufferedLines ?? 5_000;
  }

  onLine(handler: LineHandler): () => void {
    this.lineHandlers.add(handler);
    return () => this.lineHandlers.delete(handler);
  }

  onDiagnostic(handler: DiagnosticHandler): () => void {
    this.diagnosticHandlers.add(handler);
    return () => this.diagnosticHandlers.delete(handler);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      const info = await stat(this.path);
      if (this.explicitStartOffset !== null) {
        this.offset = Math.min(this.explicitStartOffset, info.size);
      } else {
        this.offset = this.readFrom === 'end' ? info.size : 0;
      }
      this.emitDiagnostic({
        kind: info.size === this.offset ? 'waiting-for-lines' : 'ready',
        message: `Watching ${this.path}`,
        path: this.path,
      });
    } catch {
      this.offset = 0;
      this.emitDiagnostic({
        kind: 'missing-log',
        message: `Log file not found: ${this.path}`,
        path: this.path,
      });
    }

    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    await this.poll();
  }

  stop(): void {
    this.started = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll(): Promise<void> {
    if (!this.started || this.polling) return;
    this.polling = true;
    try {
      const info = await stat(this.path);
      if (info.size < this.offset) {
        this.offset = 0;
        this.partial = Buffer.alloc(0);
        this.emitDiagnostic({
          kind: 'rotation-or-truncation',
          message: `Log file was truncated or rotated: ${this.path}`,
          path: this.path,
        });
      }

      if (info.size === this.offset) return;

      const bytesToRead = Math.min(info.size - this.offset, this.maxBytesPerTick);
      const handle = await open(this.path, 'r');
      try {
        await this.readChunk(handle, bytesToRead);
      } finally {
        await handle.close();
      }

      if (info.size - this.offset > 0) {
        this.emitDiagnostic({
          kind: 'lag',
          message: `Log watcher is behind on ${this.path}`,
          path: this.path,
        });
      }
    } catch {
      this.emitDiagnostic({
        kind: 'missing-log',
        message: `Log file not found: ${this.path}`,
        path: this.path,
      });
    } finally {
      this.polling = false;
    }
  }

  private async readChunk(handle: FileHandle, bytesToRead: number): Promise<void> {
    const buffer = Buffer.alloc(bytesToRead);
    const result = await handle.read(buffer, 0, bytesToRead, this.offset);
    if (result.bytesRead <= 0) return;
    this.offset += result.bytesRead;

    // Concatenate the leftover bytes from the previous chunk with the new
    // bytes, then split at the last line terminator. Everything up to it is
    // complete (no codepoint can straddle it — \n/\r are single-byte in
    // UTF-8 and never appear as continuation bytes), so we decode only the
    // complete span. The trailing bytes stay raw for the next chunk.
    const combined = Buffer.concat([this.partial, buffer.subarray(0, result.bytesRead)]);
    const lastNewline = combined.lastIndexOf(0x0a);
    if (lastNewline === -1) {
      this.partial = combined;
      return;
    }
    const text = combined.subarray(0, lastNewline).toString('utf8');
    this.partial = combined.subarray(lastNewline + 1);

    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const parts = normalized.split('\n');
    // `parts` now contains only complete lines (the trailing fragment lives
    // in `this.partial` as raw bytes), so there is no partial tail to pop.
    const lines = parts.filter((line) => line.length > 0);
    if (lines.length > this.maxBufferedLines) {
      const dropped = lines.length - this.maxBufferedLines;
      this.emitDiagnostic({
        kind: 'lag',
        message: `Dropped ${dropped} buffered log lines from ${this.path}`,
        path: this.path,
        droppedLines: dropped,
      });
      lines.splice(0, dropped);
    }

    for (const line of lines) {
      for (const handler of this.lineHandlers) handler(line);
    }
  }

  private emitDiagnostic(
    diagnostic: Omit<HearthWatcherDiagnostic, 'timestamp'>,
  ): void {
    const payload = { ...diagnostic, timestamp: Date.now() };
    for (const handler of this.diagnosticHandlers) handler(payload);
  }
}

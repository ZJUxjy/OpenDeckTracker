import { open, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import type { HearthWatcherDiagnostic } from './types/diagnostics';

export type LogFileReadMode = 'end' | 'beginning';

export interface LogFileWatcherOptions {
  path: string;
  readFrom?: LogFileReadMode;
  pollIntervalMs?: number;
  maxBytesPerTick?: number;
  maxBufferedLines?: number;
}

type LineHandler = (line: string) => void;
type DiagnosticHandler = (diagnostic: HearthWatcherDiagnostic) => void;

export class LogFileWatcher {
  private readonly path: string;
  private readonly readFrom: LogFileReadMode;
  private readonly pollIntervalMs: number;
  private readonly maxBytesPerTick: number;
  private readonly maxBufferedLines: number;
  private readonly lineHandlers = new Set<LineHandler>();
  private readonly diagnosticHandlers = new Set<DiagnosticHandler>();
  private timer: NodeJS.Timeout | null = null;
  private offset = 0;
  private partial = '';
  private started = false;
  private polling = false;

  constructor(options: LogFileWatcherOptions) {
    this.path = options.path;
    this.readFrom = options.readFrom ?? 'end';
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
      this.offset = this.readFrom === 'end' ? info.size : 0;
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
        this.partial = '';
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

    const text = this.partial + buffer.subarray(0, result.bytesRead).toString('utf8');
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const parts = normalized.split('\n');
    this.partial = parts.pop() ?? '';

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

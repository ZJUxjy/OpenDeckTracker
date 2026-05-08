import { open, stat } from 'node:fs/promises';
import { LogFileWatcher, type LogFileWatcherOptions } from './log-file-watcher';
import { findCurrentMatchStartOffset } from './log/match-boundary';
import { discoverPowerLog, type LogDiscoveryOptions } from './log-paths';
import { PowerLineStreamingParser } from './parsers/power-parser';
import type { HearthWatcherDiagnostic } from './types/diagnostics';
import { createParserDiagnostics } from './types/diagnostics';
import type { PowerEvent } from './types/power-events';

/**
 * `'replay'` events were read from the file in a one-shot pass at
 * watcher startup so the consumers can backfill state for a match
 * that was already in progress when we connected. `'live'` events
 * stream from the tail as Hearthstone writes them. Phase is the
 * second arg on `EventHandler` so existing handlers (which only
 * declare one parameter) continue to work unchanged.
 */
export type EventPhase = 'replay' | 'live';
type EventHandler = (event: PowerEvent, phase: EventPhase) => void;
type StatusHandler = (status: HearthWatcherDiagnostic) => void;

export interface HearthWatcherOptions {
  powerLogPath?: string;
  readFrom?: LogFileWatcherOptions['readFrom'];
  pollIntervalMs?: number;
  maxBytesPerTick?: number;
  maxBufferedLines?: number;
  discovery?: Omit<LogDiscoveryOptions, 'overridePath'>;
  /**
   * How often to re-run `discoverPowerLog` when Power.log is missing.
   * Defaults to `pollIntervalMs`, which keeps the retry cadence consistent
   * with tailing polls. Set to 0 to disable retries (useful for tests).
   */
  discoveryRetryIntervalMs?: number;
  /**
   * How often to check whether Hearthstone has started writing to a newer
   * timestamped Power.log. Defaults to 2000ms. Set to 0 to disable.
   */
  latestLogCheckIntervalMs?: number;
}

export class HearthWatcher {
  private readonly options: HearthWatcherOptions;
  private readonly eventHandlers = new Set<EventHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private tailer: LogFileWatcher | null = null;
  private running = false;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private latestLogTimer: NodeJS.Timeout | null = null;
  private latestLogCheckInFlight = false;
  private currentPowerLogPath: string | null = null;
  /**
   * One streaming parser per log session so block-continuation context
   * (FULL_ENTITY → indented `tag=` lines) carries across the
   * replay→live boundary. Reset on every new log path.
   */
  private parser = new PowerLineStreamingParser();

  constructor(options: HearthWatcherOptions = {}) {
    this.options = options;
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.attemptDiscoveryAndTail();
  }

  stop(): void {
    this.running = false;
    if (this.discoveryTimer !== null) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    if (this.latestLogTimer !== null) {
      clearTimeout(this.latestLogTimer);
      this.latestLogTimer = null;
    }
    this.tailer?.stop();
    this.tailer = null;
    this.currentPowerLogPath = null;
    this.parser.reset();
  }

  private async attemptDiscoveryAndTail(): Promise<void> {
    if (!this.running || this.tailer !== null) return;

    const discoveryOptions: LogDiscoveryOptions = { ...this.options.discovery };
    if (this.options.powerLogPath !== undefined) {
      discoveryOptions.overridePath = this.options.powerLogPath;
    }
    const discovery = await discoverPowerLog(discoveryOptions);

    if (discovery.powerLogPath === null) {
      if (discovery.diagnostic !== null) {
        this.emitStatus(discovery.diagnostic);
      }
      this.scheduleDiscoveryRetry();
      return;
    }

    this.currentPowerLogPath = discovery.powerLogPath;

    // If Hearthstone is mid-match when we start (or restart) the
    // watcher, re-emit everything from this match's CREATE_GAME up
    // to current EOF so downstream consumers can backfill their
    // state. Events from this pass are tagged `phase='replay'` so
    // recorders that should not double-write (match-recording,
    // power-match) can skip them while the global-effects detector
    // and tag-overlay reducer still see them.
    let liveStartOffset: number | undefined;
    try {
      const replayStart = await findCurrentMatchStartOffset(discovery.powerLogPath);
      if (replayStart !== null) {
        const replayEnd = (await stat(discovery.powerLogPath)).size;
        if (replayEnd > replayStart) {
          await this.replayMatchHistory(discovery.powerLogPath, replayStart, replayEnd);
        }
        liveStartOffset = replayEnd;
      }
    } catch (err) {
      // Locating / replaying history is best-effort; if it fails we
      // just fall through to a normal end-of-file tail and lose the
      // backfill rather than blocking the live path entirely.
      this.emitStatus({
        kind: 'parser-error',
        message: `Failed to replay active match history: ${err instanceof Error ? err.message : String(err)}`,
        path: discovery.powerLogPath,
        timestamp: Date.now(),
      });
    }

    this.tailer = this.buildTailer(discovery.powerLogPath, liveStartOffset);
    await this.tailer.start();
    this.scheduleLatestLogCheck();
  }

  private async replayMatchHistory(
    path: string,
    start: number,
    end: number,
  ): Promise<void> {
    const length = end - start;
    if (length <= 0) return;
    const handle = await open(path, 'r');
    let buffer: Buffer;
    try {
      buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
    } finally {
      await handle.close();
    }
    const text = buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').filter((l) => l.length > 0);
    const diagnostics = createParserDiagnostics();
    let replayedEvents = 0;
    for (const line of lines) {
      const event = this.parser.parse(line, { diagnostics });
      if (event !== null) {
        this.emitEvent(event, 'replay');
        replayedEvents += 1;
      }
    }
    this.emitStatus({
      kind: 'ready',
      message: `Replayed ${replayedEvents} events from active match history`,
      path,
      timestamp: Date.now(),
    });
  }

  private buildTailer(powerLogPath: string, startOffset?: number): LogFileWatcher {
    const diagnostics = createParserDiagnostics();
    const tailerOptions: LogFileWatcherOptions = { path: powerLogPath };
    if (startOffset !== undefined) tailerOptions.startOffset = startOffset;
    if (this.options.readFrom !== undefined) tailerOptions.readFrom = this.options.readFrom;
    if (this.options.pollIntervalMs !== undefined) {
      tailerOptions.pollIntervalMs = this.options.pollIntervalMs;
    }
    if (this.options.maxBytesPerTick !== undefined) {
      tailerOptions.maxBytesPerTick = this.options.maxBytesPerTick;
    }
    if (this.options.maxBufferedLines !== undefined) {
      tailerOptions.maxBufferedLines = this.options.maxBufferedLines;
    }

    const tailer = new LogFileWatcher(tailerOptions);
    tailer.onDiagnostic((diagnostic) => this.emitStatus(diagnostic));

    let readyEmitted = false;
    tailer.onLine((line) => {
      const before = diagnostics.malformedRecords;
      const event = this.parser.parse(line, { diagnostics });
      if (event !== null) {
        if (!readyEmitted) {
          readyEmitted = true;
          this.emitStatus({
            kind: 'ready',
            message: `Parsing Power.log events from ${powerLogPath}`,
            path: powerLogPath,
            timestamp: Date.now(),
          });
        }
        this.emitEvent(event, 'live');
      } else if (diagnostics.malformedRecords > before) {
        const recordType = inferPowerRecordType(line);
        const status: HearthWatcherDiagnostic = {
          kind: 'parser-error',
          message:
            recordType === null
              ? 'Malformed Power.log record'
              : `Malformed Power.log ${recordType} record`,
          line,
          path: powerLogPath,
          ...(recordType !== null ? { recordType } : {}),
          timestamp: Date.now(),
        };
        this.emitStatus(status);
      }
    });

    return tailer;
  }

  private scheduleDiscoveryRetry(): void {
    if (!this.running || this.discoveryTimer !== null) return;
    const interval =
      this.options.discoveryRetryIntervalMs ?? this.options.pollIntervalMs ?? 2000;
    if (interval <= 0) return;
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      void this.attemptDiscoveryAndTail();
    }, interval);
  }

  private scheduleLatestLogCheck(): void {
    if (!this.running || this.latestLogTimer !== null || this.options.powerLogPath !== undefined) {
      return;
    }
    const interval = this.options.latestLogCheckIntervalMs ?? 2000;
    if (interval <= 0) return;
    this.latestLogTimer = setTimeout(() => {
      this.latestLogTimer = null;
      void this.checkForLatestPowerLog();
    }, interval);
  }

  private async checkForLatestPowerLog(): Promise<void> {
    if (!this.running || this.latestLogCheckInFlight || this.options.powerLogPath !== undefined) {
      return;
    }
    this.latestLogCheckInFlight = true;
    try {
      const discovery = await discoverPowerLog({ ...this.options.discovery });
      if (discovery.powerLogPath !== null && discovery.powerLogPath !== this.currentPowerLogPath) {
        this.tailer?.stop();
        this.parser.reset();
        this.currentPowerLogPath = discovery.powerLogPath;
        this.tailer = this.buildTailer(discovery.powerLogPath);
        await this.tailer.start();
      }
    } finally {
      this.latestLogCheckInFlight = false;
      this.scheduleLatestLogCheck();
    }
  }

  private emitEvent(event: PowerEvent, phase: EventPhase): void {
    for (const handler of this.eventHandlers) handler(event, phase);
  }

  private emitStatus(status: HearthWatcherDiagnostic): void {
    for (const handler of this.statusHandlers) handler(status);
  }
}

export function createHearthWatcher(options: HearthWatcherOptions = {}): HearthWatcher {
  return new HearthWatcher(options);
}

function inferPowerRecordType(line: string): string | null {
  const match = line.match(/\s-\s+([A-Z_]+)(?:\s|$)/);
  return match?.[1] ?? null;
}

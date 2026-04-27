import { LogFileWatcher, type LogFileWatcherOptions } from './log-file-watcher';
import { discoverPowerLog, type LogDiscoveryOptions } from './log-paths';
import { parsePowerLine } from './parsers/power-parser';
import type { HearthWatcherDiagnostic } from './types/diagnostics';
import { createParserDiagnostics } from './types/diagnostics';
import type { PowerEvent } from './types/power-events';

type EventHandler = (event: PowerEvent) => void;
type StatusHandler = (status: HearthWatcherDiagnostic) => void;

export interface HearthWatcherOptions {
  powerLogPath?: string;
  readFrom?: LogFileWatcherOptions['readFrom'];
  pollIntervalMs?: number;
  maxBytesPerTick?: number;
  maxBufferedLines?: number;
  discovery?: Omit<LogDiscoveryOptions, 'overridePath'>;
}

export class HearthWatcher {
  private readonly options: HearthWatcherOptions;
  private readonly eventHandlers = new Set<EventHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private tailer: LogFileWatcher | null = null;

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
    if (this.tailer !== null) return;
    const discoveryOptions = { ...this.options.discovery };
    if (this.options.powerLogPath !== undefined) {
      Object.assign(discoveryOptions, { overridePath: this.options.powerLogPath });
    }
    const discovery = await discoverPowerLog(discoveryOptions);

    if (discovery.diagnostic !== null) {
      this.emitStatus(discovery.diagnostic);
    }
    if (discovery.powerLogPath === null) return;

    const diagnostics = createParserDiagnostics();
    const tailerOptions: LogFileWatcherOptions = {
      path: discovery.powerLogPath,
    };
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
    this.tailer = new LogFileWatcher(tailerOptions);
    this.tailer.onDiagnostic((diagnostic) => this.emitStatus(diagnostic));
    this.tailer.onLine((line) => {
      const before = diagnostics.malformedRecords;
      const event = parsePowerLine(line, { diagnostics });
      if (event !== null) {
        this.emitEvent(event);
      } else if (diagnostics.malformedRecords > before) {
        const status: HearthWatcherDiagnostic = {
          kind: 'parser-error',
          message: 'Malformed Power.log record',
          line,
          timestamp: Date.now(),
        };
        if (discovery.powerLogPath !== null) status.path = discovery.powerLogPath;
        this.emitStatus(status);
      }
    });
    await this.tailer.start();
  }

  stop(): void {
    this.tailer?.stop();
    this.tailer = null;
  }

  private emitEvent(event: PowerEvent): void {
    for (const handler of this.eventHandlers) handler(event);
  }

  private emitStatus(status: HearthWatcherDiagnostic): void {
    for (const handler of this.statusHandlers) handler(status);
  }
}

export function createHearthWatcher(options: HearthWatcherOptions = {}): HearthWatcher {
  return new HearthWatcher(options);
}

import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';

/**
 * Global edge-signal for "Hearthstone process appeared / disappeared".
 *
 * Bypasses the HearthMirror Rust runtime's 2s back-off entirely by
 * shelling out to `tasklist` to check whether `Hearthstone.exe` is
 * currently running. Used so the main-process modules (HearthMirror,
 * HearthWatcher, DeckTracker) can react IMMEDIATELY to "game just
 * appeared" instead of waiting for their own next polling tick.
 *
 * `tasklist` typically returns in 80-200ms; we poll at 1Hz which is
 * negligible CPU. Result is purely an "is the process alive by name"
 * check — never touches mirror state or Power.log.
 */

const POLL_INTERVAL_MS = 1000;
const TASKLIST_TIMEOUT_MS = 5000;

type ProcessMonitorEvent = 'appeared' | 'disappeared';

class HearthstoneProcessMonitor extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentlyAlive = false;
  private checkInFlight = false;

  start(): void {
    if (this.running) return;
    if (process.platform !== 'win32') return;
    this.running = true;
    void this.runCheckLoop();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  isAlive(): boolean {
    return this.currentlyAlive;
  }

  override on(event: ProcessMonitorEvent, listener: () => void): this {
    return super.on(event, listener);
  }

  override off(event: ProcessMonitorEvent, listener: () => void): this {
    return super.off(event, listener);
  }

  private async runCheckLoop(): Promise<void> {
    if (!this.running) return;
    if (!this.checkInFlight) {
      this.checkInFlight = true;
      try {
        const alive = await isHearthstoneRunning();
        if (alive && !this.currentlyAlive) {
          this.currentlyAlive = true;
          console.log('[hs-process-monitor] appeared');
          this.emit('appeared');
        } else if (!alive && this.currentlyAlive) {
          this.currentlyAlive = false;
          console.log('[hs-process-monitor] disappeared');
          this.emit('disappeared');
        }
      } catch {
        // Treat error as "no information" — keep current state, do not
        // fire any edge. Next tick will retry.
      } finally {
        this.checkInFlight = false;
      }
    }
    if (this.running) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.runCheckLoop();
      }, POLL_INTERVAL_MS);
    }
  }
}

function isHearthstoneRunning(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    execFile(
      'tasklist',
      ['/FI', 'IMAGENAME eq Hearthstone.exe', '/NH', '/FO', 'CSV'],
      { windowsHide: true, timeout: TASKLIST_TIMEOUT_MS },
      (err, stdout) => {
        if (err) {
          reject(
            err instanceof Error
              ? err
              : new Error(typeof err === 'string' ? err : 'tasklist failed'),
          );
          return;
        }
        // CSV row format: "Hearthstone.exe","12345","Console","1","350,000 K"
        // When no match, tasklist prints either "INFO: No tasks are
        // running which match the specified criteria." or an empty
        // result depending on locale — case-insensitive substring
        // check is robust against both.
        resolve(stdout.toLowerCase().includes('hearthstone.exe'));
      },
    );
  });
}

export const hearthstoneProcessMonitor = new HearthstoneProcessMonitor();

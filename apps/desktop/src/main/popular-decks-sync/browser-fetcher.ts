import { BrowserWindow } from 'electron';

const PAGE_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 500;

interface PageState {
  readonly url: string;
  readonly title: string;
  readonly length: number;
  readonly hasChallenge: boolean;
  readonly hasMetaTable: boolean;
  readonly hasDeckVariants: boolean;
  readonly hasDeckDetail: boolean;
}

interface WindowWaiter {
  resolve: (win: BrowserWindow) => void;
  reject: (err: Error) => void;
  signal: AbortSignal | undefined;
  onAbort: (() => void) | undefined;
}

export interface HsguruBrowserFetcherOptions {
  maxWindows?: number;
}

function abortError(): Error {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  checkAborted(signal);
  let onAbort: (() => void) | undefined;
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    onAbort = (): void => {
      clearTimeout(timeout);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  }).finally(() => {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  });
}

async function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => void,
): Promise<T> {
  checkAborted(signal);
  if (!signal) return promise;

  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      onAbort();
      reject(abortError());
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort);
    });
  });
}

async function readPageState(win: BrowserWindow): Promise<PageState> {
  return win.webContents.executeJavaScript(`({
    url: location.href,
    title: document.title,
    length: document.documentElement.outerHTML.length,
    hasChallenge:
      document.title.includes('Just a moment') ||
      document.body.innerText.includes('Checking if the site connection is secure'),
    hasMetaTable:
      document.body.innerText.includes('Archetype') &&
      document.body.innerText.includes('Winrate') &&
      document.body.innerText.includes('Popularity'),
    hasDeckVariants:
      document.documentElement.outerHTML.includes('deck_stats-') &&
      document.body.innerText.includes('Games:'),
    hasDeckDetail:
      document.body.innerText.includes('Card Stats') ||
      document.body.innerText.includes('Class Winrate Total Games')
  })`, true) as Promise<PageState>;
}

async function readOuterHtml(win: BrowserWindow): Promise<string> {
  return win.webContents.executeJavaScript(
    'document.documentElement.outerHTML',
    true,
  ) as Promise<string>;
}

function isReadyForHsguruPage(state: PageState): boolean {
  if (state.hasChallenge) return false;

  const path = new URL(state.url).pathname;
  if (path === '/meta') return state.hasMetaTable;
  if (path === '/decks') return state.hasDeckVariants;
  if (/^\/deck\/\d+/.test(path)) return state.hasDeckDetail && state.length > 50_000;

  return state.length > 10_000;
}

/**
 * Fetches HSGuru pages through hidden Chromium pages when direct background
 * fetch is blocked by Cloudflare. The bounded pool reuses the default browser
 * session, so the first challenge pass warms later requests in the same sync.
 */
export class HsguruBrowserFetcher {
  private readonly maxWindows: number;
  private windows: BrowserWindow[] = [];
  private available: BrowserWindow[] = [];
  private waiters: WindowWaiter[] = [];
  private disposed = false;

  constructor(options: HsguruBrowserFetcherOptions = {}) {
    this.maxWindows = Math.max(1, Math.floor(options.maxWindows ?? 4));
  }

  async fetchText(url: string, signal?: AbortSignal): Promise<string> {
    const win = await this.acquireWindow(signal);
    try {
      return await this.fetchTextWithWindow(win, url, signal);
    } finally {
      this.releaseWindow(win);
    }
  }

  dispose(): void {
    this.disposed = true;
    const waiters = [...this.waiters];
    this.waiters = [];
    for (const waiter of waiters) {
      this.cleanupWaiter(waiter);
      waiter.reject(abortError());
    }
    for (const win of [...this.windows]) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.windows = [];
    this.available = [];
  }

  private acquireWindow(signal?: AbortSignal): Promise<BrowserWindow> {
    checkAborted(signal);
    if (this.disposed) throw new Error('HSGuru browser fetcher disposed');

    const available = this.takeAvailableWindow();
    if (available) return Promise.resolve(available);
    if (this.liveWindowCount() < this.maxWindows) return Promise.resolve(this.createWindow());

    return new Promise<BrowserWindow>((resolve, reject) => {
      const waiter: WindowWaiter = {
        resolve,
        reject,
        signal,
        onAbort: undefined,
      };
      waiter.onAbort = (): void => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(abortError());
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  private releaseWindow(win: BrowserWindow): void {
    if (this.disposed || win.isDestroyed()) return;
    const waiter = this.takeNextWaiter();
    if (waiter) {
      waiter.resolve(win);
      return;
    }
    if (!this.available.includes(win)) this.available.push(win);
  }

  private createWindow(): BrowserWindow {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.webContents.setAudioMuted(true);
    win.on('closed', () => {
      this.removeWindow(win);
    });
    this.windows.push(win);
    return win;
  }

  private takeAvailableWindow(): BrowserWindow | null {
    while (this.available.length > 0) {
      const win = this.available.shift()!;
      if (!win.isDestroyed()) return win;
    }
    return null;
  }

  private takeNextWaiter(): WindowWaiter | null {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      if (waiter.signal?.aborted) {
        this.cleanupWaiter(waiter);
        waiter.reject(abortError());
        continue;
      }
      this.cleanupWaiter(waiter);
      return waiter;
    }
    return null;
  }

  private liveWindowCount(): number {
    this.windows = this.windows.filter((win) => !win.isDestroyed());
    return this.windows.length;
  }

  private cleanupWaiter(waiter: WindowWaiter): void {
    if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort);
    waiter.onAbort = undefined;
  }

  private removeWindow(win: BrowserWindow): void {
    this.windows = this.windows.filter((existing) => existing !== win);
    this.available = this.available.filter((existing) => existing !== win);
    this.fillWaiters();
  }

  private fillWaiters(): void {
    if (this.disposed) return;
    while (this.waiters.length > 0) {
      const available = this.takeAvailableWindow();
      if (available) {
        const waiter = this.takeNextWaiter();
        if (waiter) {
          waiter.resolve(available);
        } else if (!available.isDestroyed()) {
          this.available.push(available);
          return;
        }
        continue;
      }
      if (this.liveWindowCount() >= this.maxWindows) return;
      const waiter = this.takeNextWaiter();
      if (!waiter) return;
      waiter.resolve(this.createWindow());
    }
  }

  private async fetchTextWithWindow(
    win: BrowserWindow,
    url: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const startedAt = Date.now();

    await withAbort(win.loadURL(url), signal, () => {
      win.webContents.stop();
    });

    while (Date.now() - startedAt < PAGE_TIMEOUT_MS) {
      checkAborted(signal);
      const state = await readPageState(win);
      if (isReadyForHsguruPage(state)) {
        return readOuterHtml(win);
      }
      await delay(POLL_INTERVAL_MS, signal);
    }

    const state = await readPageState(win);
    throw new Error(
      `HSGuru browser fetch timed out: title=${state.title} length=${state.length}`,
    );
  }
}

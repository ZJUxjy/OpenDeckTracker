import { buildDeckUrls, HSGURU_META_URL } from './parser';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const REQUEST_TIMEOUT_MS = 45_000;
export const ARCHETYPE_DELAY_MS = 1_000;

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export interface FetcherDeps {
  fetchImpl: FetchImpl;
  /** Override for tests (default: real timer-backed delay). */
  delay?: (ms: number) => Promise<void>;
}

const realDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }
}

export async function fetchHsguruText(
  url: string,
  deps: FetcherDeps,
  signal?: AbortSignal,
): Promise<string> {
  checkAborted(signal);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Forward outer abort to the per-request controller.
  const onOuterAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    const response = await deps.fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

export async function fetchHsguruMeta(
  deps: FetcherDeps,
  signal?: AbortSignal,
): Promise<string> {
  return fetchHsguruText(HSGURU_META_URL, deps, signal);
}

/**
 * Tries the documented HSGuru deck list URL variants in order until
 * one returns a non-empty body (HSGuru renames query parameters from
 * time to time; the spider keeps a candidate list as a safety net).
 *
 * Inserts a `delay` between candidate requests so a retry-storm does
 * not hammer the server. The delay is also applied between archetypes
 * by the orchestrator (`startSync`).
 */
export async function fetchHsguruArchetypeVariants(
  archetypeLabel: string,
  deps: FetcherDeps,
  signal?: AbortSignal,
): Promise<{ html: string; url: string } | null> {
  const delay = deps.delay ?? realDelay;
  const candidates = buildDeckUrls(archetypeLabel);
  for (let i = 0; i < candidates.length; i++) {
    checkAborted(signal);
    const url = candidates[i]!;
    const html = await fetchHsguruText(url, deps, signal);
    if (html.length > 0) return { html, url };
    if (i < candidates.length - 1) await delay(500);
  }
  return null;
}

export const __TEST = { realDelay, REQUEST_TIMEOUT_MS };

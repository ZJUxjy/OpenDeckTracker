# Popular Deck Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert popular deck sync from a HSGuru-only pipeline into a provider-based sync architecture with HSGuru enabled and HSReplay/Lushi registered as unsupported sources.

**Architecture:** Add provider contracts beside the existing sync code, then wrap the current HSGuru fetch/parse/transform logic in a provider. The orchestrator will iterate providers, persist schema version 2 snapshots with source diagnostics, and keep schema version 1 snapshots readable.

**Tech Stack:** TypeScript, Electron main process, Vitest, pnpm, existing `@hdt/core` and `@hdt/hearthdb` types.

---

## File Structure

- Create `apps/desktop/src/main/popular-decks-sync/provider-types.ts`
  - Owns provider IDs, provider status types, source diagnostic snapshots, provider context/result contracts, and provider error class.
- Create `apps/desktop/src/main/popular-decks-sync/provider-registry.ts`
  - Owns default provider registration and unsupported provider helpers.
- Create `apps/desktop/src/main/popular-decks-sync/hsguru-provider.ts`
  - Owns HSGuru sync logic currently embedded in `index.ts`.
- Create `apps/desktop/src/main/popular-decks-sync/provider-registry.test.ts`
  - Verifies provider registration and unsupported provider metadata.
- Create `apps/desktop/src/main/popular-decks-sync/hsguru-provider.test.ts`
  - Verifies the extracted HSGuru provider preserves current deck output and error codes.
- Modify `apps/desktop/src/main/popular-decks-sync/storage.ts`
  - Upgrades persisted snapshots to schema version 2 and keeps schema version 1 load compatibility.
- Modify `apps/desktop/src/main/popular-decks-sync/storage.test.ts`
  - Adds v1/v2 load coverage and v2 save coverage.
- Modify `apps/desktop/src/main/popular-decks-sync/index.ts`
  - Uses provider registry instead of HSGuru-specific imports and persists source diagnostics.
- Modify `apps/desktop/src/main/popular-decks-sync/index.test.ts`
  - Updates expected persisted schema and adds provider failure/unsupported diagnostics coverage.

---

### Task 1: Provider Contracts And Registry

**Files:**
- Create: `apps/desktop/src/main/popular-decks-sync/provider-types.ts`
- Create: `apps/desktop/src/main/popular-decks-sync/provider-registry.ts`
- Create: `apps/desktop/src/main/popular-decks-sync/hsguru-provider.ts`
- Test: `apps/desktop/src/main/popular-decks-sync/provider-registry.test.ts`

- [ ] **Step 1: Write failing provider registry tests**

Create `apps/desktop/src/main/popular-decks-sync/provider-registry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPopularDeckProviders, createUnsupportedProvider } from './provider-registry';
import { PopularDeckProviderError } from './provider-types';

describe('createPopularDeckProviders', () => {
  it('registers HSGuru, HSReplay, and Lushi in deterministic order', () => {
    const providers = createPopularDeckProviders();

    expect(providers.map((provider) => provider.id)).toEqual([
      'hsguru',
      'hsreplay',
      'lushi',
    ]);
    expect(providers.map((provider) => provider.label)).toEqual([
      'HSGuru',
      'HSReplay',
      'Lushi',
    ]);
  });

  it('marks only HSGuru as enabled and supported by default', () => {
    const providers = createPopularDeckProviders();

    expect(providers.map((provider) => ({
      id: provider.id,
      defaultEnabled: provider.defaultEnabled,
      status: provider.getStatus(),
    }))).toEqual([
      { id: 'hsguru', defaultEnabled: true, status: { status: 'supported' } },
      {
        id: 'hsreplay',
        defaultEnabled: false,
        status: { status: 'unsupported', reason: 'blocked-by-cloudflare' },
      },
      {
        id: 'lushi',
        defaultEnabled: false,
        status: { status: 'unsupported', reason: 'no-public-deck-api-found' },
      },
    ]);
  });
});

describe('createUnsupportedProvider', () => {
  it('reports unsupported metadata and never calls fetch when invoked defensively', async () => {
    const provider = createUnsupportedProvider({
      id: 'hsreplay',
      label: 'HSReplay',
      reason: 'blocked-by-cloudflare',
    });
    const fetchImpl = vi.fn();

    await expect(provider.sync({
      fetchImpl,
      delay: async () => undefined,
      findByDbfId: () => null,
      fetchedAt: '2026-05-26T00:00:00.000Z',
      archetypeLimit: 20,
      variantLimit: 5,
      progressCb: () => undefined,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: 'unsupported',
      reason: 'blocked-by-cloudflare',
    } satisfies Partial<PopularDeckProviderError>);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- apps/desktop/src/main/popular-decks-sync/provider-registry.test.ts --reporter=basic
```

Expected: FAIL with a module resolution error for `./provider-registry` or `./provider-types`.

- [ ] **Step 3: Add provider contracts**

Create `apps/desktop/src/main/popular-decks-sync/provider-types.ts`:

```ts
import type { PopularDeck } from '@hdt/core';
import type { FetchImpl } from './fetcher';
import type { TransformContext } from './transformer';

export type PopularDeckSourceId = 'hsguru' | 'hsreplay' | 'lushi';

export type PopularDeckSourceStatus = 'ok' | 'failed' | 'unsupported' | 'disabled';

export type SyncPhase = 'meta' | 'variants' | 'transform' | 'persist';

export interface SyncProgress {
  phase: SyncPhase;
  completed: number;
  total: number;
  currentLabel?: string;
}

export type ProgressCallback = (progress: SyncProgress) => void;

export interface PopularDeckSourceSnapshot {
  id: PopularDeckSourceId;
  label: string;
  enabled: boolean;
  status: PopularDeckSourceStatus;
  reason?: string;
  fetchedAt?: string;
  deckCount?: number;
  error?: string;
}

export type PopularDeckProviderStatus =
  | { status: 'supported' }
  | { status: 'unsupported'; reason: string };

export interface PopularDeckProviderContext {
  fetchImpl: FetchImpl;
  delay: (ms: number) => Promise<void>;
  findByDbfId: TransformContext['findByDbfId'];
  fetchedAt: string;
  archetypeLimit: number;
  variantLimit: number;
  progressCb: ProgressCallback;
  signal: AbortSignal;
}

export interface PopularDeckProviderResult {
  decks: PopularDeck[];
  source: PopularDeckSourceSnapshot;
}

export interface PopularDeckProvider {
  id: PopularDeckSourceId;
  label: string;
  defaultEnabled: boolean;
  getStatus(): PopularDeckProviderStatus;
  sync(context: PopularDeckProviderContext): Promise<PopularDeckProviderResult>;
}

export class PopularDeckProviderError extends Error {
  readonly code: string;
  readonly reason?: string;

  constructor(code: string, message: string, reason?: string) {
    super(message);
    this.name = 'PopularDeckProviderError';
    this.code = code;
    this.reason = reason;
  }
}
```

- [ ] **Step 4: Add a temporary HSGuru provider scaffold**

Create `apps/desktop/src/main/popular-decks-sync/hsguru-provider.ts`:

```ts
import {
  PopularDeckProviderError,
  type PopularDeckProvider,
} from './provider-types';

export function createHsguruProvider(): PopularDeckProvider {
  return {
    id: 'hsguru',
    label: 'HSGuru',
    defaultEnabled: true,
    getStatus: () => ({ status: 'supported' }),
    async sync() {
      throw new PopularDeckProviderError(
        'provider-unavailable',
        'HSGuru provider scaffold was called before the provider extraction task',
      );
    },
  };
}
```

- [ ] **Step 5: Add provider registry and unsupported providers**

Create `apps/desktop/src/main/popular-decks-sync/provider-registry.ts`:

```ts
import { createHsguruProvider } from './hsguru-provider';
import {
  PopularDeckProviderError,
  type PopularDeckProvider,
  type PopularDeckSourceId,
} from './provider-types';

export interface UnsupportedProviderInit {
  id: Exclude<PopularDeckSourceId, 'hsguru'>;
  label: string;
  reason: string;
}

export function createUnsupportedProvider(init: UnsupportedProviderInit): PopularDeckProvider {
  return {
    id: init.id,
    label: init.label,
    defaultEnabled: false,
    getStatus: () => ({ status: 'unsupported', reason: init.reason }),
    async sync() {
      throw new PopularDeckProviderError(
        'unsupported',
        `${init.label} is not available for automatic popular deck sync`,
        init.reason,
      );
    },
  };
}

export function createPopularDeckProviders(): PopularDeckProvider[] {
  return [
    createHsguruProvider(),
    createUnsupportedProvider({
      id: 'hsreplay',
      label: 'HSReplay',
      reason: 'blocked-by-cloudflare',
    }),
    createUnsupportedProvider({
      id: 'lushi',
      label: 'Lushi',
      reason: 'no-public-deck-api-found',
    }),
  ];
}
```

- [ ] **Step 6: Run provider registry test to verify it passes**

Run:

```bash
pnpm test -- apps/desktop/src/main/popular-decks-sync/provider-registry.test.ts --reporter=basic
```

Expected: PASS for `provider-registry.test.ts`.

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/desktop/src/main/popular-decks-sync/provider-types.ts apps/desktop/src/main/popular-decks-sync/provider-registry.ts apps/desktop/src/main/popular-decks-sync/hsguru-provider.ts apps/desktop/src/main/popular-decks-sync/provider-registry.test.ts
git commit -m "feat: add popular deck provider registry"
```

---

### Task 2: Schema Version 2 Snapshot Storage

**Files:**
- Modify: `apps/desktop/src/main/popular-decks-sync/storage.ts`
- Modify: `apps/desktop/src/main/popular-decks-sync/storage.test.ts`

- [ ] **Step 1: Write failing storage tests for v1 compatibility and v2 diagnostics**

Update `apps/desktop/src/main/popular-decks-sync/storage.test.ts`:

```ts
import type { PopularDeckSourceSnapshot } from './provider-types';
```

Replace the unsupported schema test with:

```ts
  it('returns null when the schemaVersion is unsupported', async () => {
    writeFileSync(
      join(dir, SYNCED_FILENAME),
      JSON.stringify({ schemaVersion: 3, fetchedAt: '2026-05-09T00:00:00Z', decks: [VALID_DECK] }),
    );
    expect(await loadCache(dir)).toBeNull();
  });
```

Add these tests under `describe('loadCache', ...)`:

```ts
  it('reads legacy schema version 1 snapshots without source diagnostics', async () => {
    const snapshot = {
      schemaVersion: 1 as const,
      fetchedAt: '2026-05-09T12:00:00Z',
      decks: [VALID_DECK],
    };
    writeFileSync(join(dir, SYNCED_FILENAME), JSON.stringify(snapshot));

    expect(await loadCache(dir)).toEqual(snapshot);
  });

  it('reads schema version 2 snapshots with source diagnostics', async () => {
    const sources: PopularDeckSourceSnapshot[] = [
      {
        id: 'hsguru',
        label: 'HSGuru',
        enabled: true,
        status: 'ok',
        fetchedAt: '2026-05-09T12:00:00Z',
        deckCount: 1,
      },
      {
        id: 'hsreplay',
        label: 'HSReplay',
        enabled: false,
        status: 'unsupported',
        reason: 'blocked-by-cloudflare',
      },
    ];
    const snapshot = {
      schemaVersion: 2 as const,
      fetchedAt: '2026-05-09T12:00:00Z',
      decks: [VALID_DECK],
      sources,
    };
    writeFileSync(join(dir, SYNCED_FILENAME), JSON.stringify(snapshot));

    expect(await loadCache(dir)).toEqual(snapshot);
  });

  it('returns null for schema version 2 snapshots with invalid sources', async () => {
    writeFileSync(
      join(dir, SYNCED_FILENAME),
      JSON.stringify({
        schemaVersion: 2,
        fetchedAt: '2026-05-09T00:00:00Z',
        decks: [VALID_DECK],
        sources: [{ id: 'bad-source', label: 'Bad', enabled: true, status: 'ok' }],
      }),
    );

    expect(await loadCache(dir)).toBeNull();
  });
```

Update the save/read test to write version 2:

```ts
  it('reads back a schema version 2 snapshot saved via saveCache', async () => {
    const snapshot = {
      schemaVersion: 2 as const,
      fetchedAt: '2026-05-09T12:00:00Z',
      decks: [VALID_DECK],
      sources: [
        {
          id: 'hsguru',
          label: 'HSGuru',
          enabled: true,
          status: 'ok',
          fetchedAt: '2026-05-09T12:00:00Z',
          deckCount: 1,
        },
      ],
    };
    await saveCache(dir, snapshot);
    const loaded = await loadCache(dir);
    expect(loaded).toEqual(snapshot);
  });
```

Update the two `saveCache` tests so their snapshots include `schemaVersion: 2` and a valid `sources` array.

- [ ] **Step 2: Run storage tests to verify they fail**

Run:

```bash
pnpm test -- apps/desktop/src/main/popular-decks-sync/storage.test.ts --reporter=basic
```

Expected: FAIL because schema version 2 is not accepted and `sources` is not modeled yet.

- [ ] **Step 3: Upgrade storage types and validation**

Replace the top type section in `apps/desktop/src/main/popular-decks-sync/storage.ts` with:

```ts
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Format, HeroClass, PopularDeck, PopularDeckArchetype } from '@hdt/core';
import type {
  PopularDeckSourceId,
  PopularDeckSourceSnapshot,
  PopularDeckSourceStatus,
} from './provider-types';

export const SYNCED_FILENAME = 'synced.json';
export const SYNCED_TMP_FILENAME = 'synced.json.tmp';
export const SYNCED_SCHEMA_VERSION = 2;

export interface SyncedSnapshotV1 {
  schemaVersion: 1;
  fetchedAt: string;
  decks: PopularDeck[];
}

export interface SyncedSnapshotV2 {
  schemaVersion: 2;
  fetchedAt: string;
  decks: PopularDeck[];
  sources: PopularDeckSourceSnapshot[];
}

export type SyncedSnapshot = SyncedSnapshotV1 | SyncedSnapshotV2;

const SOURCE_ID_VALUES: ReadonlySet<string> = new Set<PopularDeckSourceId>([
  'hsguru',
  'hsreplay',
  'lushi',
]);

const SOURCE_STATUS_VALUES: ReadonlySet<string> = new Set<PopularDeckSourceStatus>([
  'ok',
  'failed',
  'unsupported',
  'disabled',
]);
```

Add source validation below `isPopularDeck`:

```ts
function isPopularDeckSourceSnapshot(value: unknown): value is PopularDeckSourceSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v['id'] !== 'string' || !SOURCE_ID_VALUES.has(v['id'])) return false;
  if (typeof v['label'] !== 'string') return false;
  if (typeof v['enabled'] !== 'boolean') return false;
  if (typeof v['status'] !== 'string' || !SOURCE_STATUS_VALUES.has(v['status'])) return false;
  if ('reason' in v && typeof v['reason'] !== 'string') return false;
  if ('fetchedAt' in v && typeof v['fetchedAt'] !== 'string') return false;
  if ('deckCount' in v && typeof v['deckCount'] !== 'number') return false;
  if ('error' in v && typeof v['error'] !== 'string') return false;
  return true;
}
```

Replace the schema branch in `loadCache` with:

```ts
  if (obj['schemaVersion'] !== 1 && obj['schemaVersion'] !== 2) return null;
  if (typeof obj['fetchedAt'] !== 'string') return null;
  const decks = obj['decks'];
  if (!Array.isArray(decks) || decks.length === 0) return null;
  if (!decks.every(isPopularDeck)) return null;

  if (obj['schemaVersion'] === 1) {
    return {
      schemaVersion: 1,
      fetchedAt: obj['fetchedAt'],
      decks: decks as PopularDeck[],
    };
  }

  const sources = obj['sources'];
  if (!Array.isArray(sources) || !sources.every(isPopularDeckSourceSnapshot)) return null;
  return {
    schemaVersion: SYNCED_SCHEMA_VERSION,
    fetchedAt: obj['fetchedAt'],
    decks: decks as PopularDeck[],
    sources: sources as PopularDeckSourceSnapshot[],
  };
```

Leave `saveCache` as:

```ts
export async function saveCache(dir: string, snapshot: SyncedSnapshot): Promise<void> {
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, SYNCED_TMP_FILENAME);
  const finalPath = join(dir, SYNCED_FILENAME);
  await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  await rename(tmpPath, finalPath);
}
```

- [ ] **Step 4: Run storage tests to verify they pass**

Run:

```bash
pnpm test -- apps/desktop/src/main/popular-decks-sync/storage.test.ts --reporter=basic
```

Expected: PASS for `storage.test.ts`.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/desktop/src/main/popular-decks-sync/storage.ts apps/desktop/src/main/popular-decks-sync/storage.test.ts
git commit -m "feat: store popular deck source diagnostics"
```

---

### Task 3: Extract The HSGuru Provider

**Files:**
- Modify: `apps/desktop/src/main/popular-decks-sync/hsguru-provider.ts`
- Create: `apps/desktop/src/main/popular-decks-sync/hsguru-provider.test.ts`

- [ ] **Step 1: Write failing HSGuru provider tests**

Create `apps/desktop/src/main/popular-decks-sync/hsguru-provider.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { CardDef } from '@hdt/hearthdb';
import { decodeDeck } from '@hdt/hearthdb';
import { createHsguruProvider } from './hsguru-provider';
import type { PopularDeckProviderContext, SyncProgress } from './provider-types';

const ROGUE_DECKSTRING =
  'AAECAaIHCsODB9GdB+ylB4aoB4eoB4ioB9C/B4rUB5vUB4jZBwr3nwT3gQeQgweMrQfHrgfZrweaswe0wQedxQfVxQcAAA==';

const META_HTML = `
  <tr>
    <td><a href="/archetype/Tempo%20Rogue">Tempo Rogue</a></td>
    <td><span>50.2</span></td>
    <td>  10.0% (43449) </td>
  </tr>
`;

const ARCHETYPE_HTML = `
  <div id="deck_stats-39285857">
    <a class="basic-black-text" href="/deck/39285857">Harold Rogue</a>
    <span style="font-size: 0; line-size: 0; display: block">${ROGUE_DECKSTRING}</span>
    <div>D0nkey<span>50.2</span><div class="column tag">Games: 43449</div></div>
  </div>
`;

function fakeHeroCard(heroDbfId: number, cardClass: string): CardDef {
  return {
    id: `H${heroDbfId}`,
    dbfId: heroDbfId,
    name: 'TestHero',
    cost: 0,
    cardClass,
    set: 'TEST',
    type: 'HERO',
    collectible: true,
  } as CardDef;
}

function makeContext(opts: {
  fetchImpl?: PopularDeckProviderContext['fetchImpl'];
  metaHtml?: string;
  archetypeHtml?: string;
  progress?: SyncProgress[];
} = {}): PopularDeckProviderContext {
  const heroDbfId = decodeDeck(ROGUE_DECKSTRING).heroes[0]!;
  const fetchImpl =
    opts.fetchImpl ??
    vi.fn(async (url: string) => {
      if (url.includes('/meta?')) {
        return new Response(opts.metaHtml ?? META_HTML, { status: 200 });
      }
      return new Response(opts.archetypeHtml ?? ARCHETYPE_HTML, { status: 200 });
    });

  return {
    fetchImpl,
    delay: async () => undefined,
    findByDbfId: (dbfId: number) =>
      dbfId === heroDbfId ? fakeHeroCard(heroDbfId, 'ROGUE') : null,
    fetchedAt: '2026-05-09T12:00:00.000Z',
    archetypeLimit: 20,
    variantLimit: 5,
    progressCb: (progress) => opts.progress?.push(progress),
    signal: new AbortController().signal,
  };
}

describe('createHsguruProvider', () => {
  it('syncs HSGuru decks and returns ok source diagnostics', async () => {
    const progress: SyncProgress[] = [];
    const result = await createHsguruProvider().sync(makeContext({ progress }));

    expect(result.decks).toHaveLength(1);
    expect(result.decks[0]).toMatchObject({
      id: 'tempo-rogue-39285857',
      name: 'Harold Rogue',
      class: 'ROGUE',
      author: 'hsguru',
      updatedAt: '2026-05-09',
    });
    expect(result.source).toEqual({
      id: 'hsguru',
      label: 'HSGuru',
      enabled: true,
      status: 'ok',
      fetchedAt: '2026-05-09T12:00:00.000Z',
      deckCount: 1,
    });
    expect(progress.map((p) => p.phase)).toEqual(
      expect.arrayContaining(['meta', 'variants', 'transform']),
    );
  });

  it('throws parse-failed when the meta page yields no archetypes', async () => {
    await expect(
      createHsguruProvider().sync(makeContext({ metaHtml: '<html>nothing</html>' })),
    ).rejects.toMatchObject({ code: 'parse-failed' });
  });

  it('throws network-failed when fetch throws a non-abort error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    await expect(
      createHsguruProvider().sync(makeContext({ fetchImpl })),
    ).rejects.toMatchObject({ code: 'network-failed' });
  });
});
```

- [ ] **Step 2: Run HSGuru provider tests to verify they fail**

Run:

```bash
pnpm test -- apps/desktop/src/main/popular-decks-sync/hsguru-provider.test.ts --reporter=basic
```

Expected: FAIL because `hsguru-provider.ts` still contains the scaffold.

- [ ] **Step 3: Replace HSGuru scaffold with extracted sync logic**

Replace `apps/desktop/src/main/popular-decks-sync/hsguru-provider.ts` with:

```ts
import type { PopularDeck } from '@hdt/core';
import {
  ARCHETYPE_DELAY_MS,
  fetchHsguruArchetypeVariants,
  fetchHsguruMeta,
} from './fetcher';
import { parseDeckVariants, parseLegendArchetypes } from './parser';
import { transformVariant } from './transformer';
import {
  PopularDeckProviderError,
  type PopularDeckProvider,
  type PopularDeckProviderContext,
  type PopularDeckProviderResult,
} from './provider-types';

export function createHsguruProvider(): PopularDeckProvider {
  return {
    id: 'hsguru',
    label: 'HSGuru',
    defaultEnabled: true,
    getStatus: () => ({ status: 'supported' }),
    sync: syncHsguru,
  };
}

async function syncHsguru(
  ctx: PopularDeckProviderContext,
): Promise<PopularDeckProviderResult> {
  console.log('[popular-decks-sync] provider hsguru start', { fetchedAt: ctx.fetchedAt });

  ctx.progressCb({ phase: 'meta', completed: 0, total: 1 });
  let metaHtml: string;
  const metaStart = Date.now();
  try {
    metaHtml = await fetchHsguruMeta({ fetchImpl: ctx.fetchImpl, delay: ctx.delay }, ctx.signal);
  } catch (e) {
    console.error('[popular-decks-sync] hsguru meta fetch failed', {
      elapsedMs: Date.now() - metaStart,
      name: (e as Error)?.name,
      message: (e as Error)?.message,
    });
    throw toProviderError(e, 'network-failed');
  }

  console.log('[popular-decks-sync] hsguru meta fetched', {
    elapsedMs: Date.now() - metaStart,
    bytes: metaHtml.length,
  });

  const archetypes = parseLegendArchetypes(metaHtml, ctx.archetypeLimit);
  if (archetypes.length === 0) {
    console.warn('[popular-decks-sync] hsguru meta parse yielded 0 archetypes');
    throw new PopularDeckProviderError('parse-failed', 'HSGuru meta page yielded no archetypes');
  }
  ctx.progressCb({ phase: 'meta', completed: 1, total: 1 });

  const variantsByArchetype: Array<{
    archetype: typeof archetypes[number];
    variants: ReturnType<typeof parseDeckVariants>;
  }> = [];

  for (let i = 0; i < archetypes.length; i++) {
    if (ctx.signal.aborted) {
      throw new PopularDeckProviderError('aborted', 'HSGuru sync was aborted');
    }
    const archetype = archetypes[i]!;
    ctx.progressCb({
      phase: 'variants',
      completed: i,
      total: archetypes.length,
      currentLabel: archetype.archetype,
    });

    let result: { html: string; url: string } | null;
    const variantStart = Date.now();
    try {
      result = await fetchHsguruArchetypeVariants(
        archetype.archetype,
        { fetchImpl: ctx.fetchImpl, delay: ctx.delay },
        ctx.signal,
      );
    } catch (e) {
      console.error('[popular-decks-sync] hsguru variants fetch failed', {
        archetype: archetype.archetype,
        elapsedMs: Date.now() - variantStart,
        name: (e as Error)?.name,
        message: (e as Error)?.message,
      });
      throw toProviderError(e, 'network-failed');
    }

    const variants = result ? parseDeckVariants(result.html, ctx.variantLimit) : [];
    console.log(
      `[popular-decks-sync] hsguru variants ${i + 1}/${archetypes.length} ${archetype.archetype}: ${variants.length} decks (${Date.now() - variantStart}ms)`,
    );
    variantsByArchetype.push({ archetype, variants });
    if (i < archetypes.length - 1) await ctx.delay(ARCHETYPE_DELAY_MS);
  }

  ctx.progressCb({
    phase: 'variants',
    completed: archetypes.length,
    total: archetypes.length,
  });

  const decks: PopularDeck[] = [];
  const totalVariants = variantsByArchetype.reduce((sum, entry) => sum + entry.variants.length, 0);
  let processed = 0;
  ctx.progressCb({ phase: 'transform', completed: 0, total: Math.max(totalVariants, 1) });
  for (const { archetype, variants } of variantsByArchetype) {
    for (const variant of variants) {
      const deck = transformVariant(archetype, variant, ctx.fetchedAt, {
        findByDbfId: ctx.findByDbfId,
      });
      if (deck) decks.push(deck);
      processed++;
      ctx.progressCb({
        phase: 'transform',
        completed: processed,
        total: Math.max(totalVariants, 1),
        currentLabel: archetype.archetype,
      });
    }
  }

  console.log(
    `[popular-decks-sync] hsguru transform: ${decks.length} valid decks (skipped ${totalVariants - decks.length})`,
  );
  if (decks.length === 0) {
    throw new PopularDeckProviderError('parse-failed', 'HSGuru variants yielded no valid decks');
  }

  return {
    decks,
    source: {
      id: 'hsguru',
      label: 'HSGuru',
      enabled: true,
      status: 'ok',
      fetchedAt: ctx.fetchedAt,
      deckCount: decks.length,
    },
  };
}

function toProviderError(e: unknown, fallback: string): PopularDeckProviderError {
  const err = e as { name?: string; message?: string } | null;
  if (err?.name === 'AbortError' || err?.message === 'aborted') {
    return new PopularDeckProviderError('aborted', 'HSGuru sync was aborted');
  }
  return new PopularDeckProviderError(fallback, err?.message ?? fallback);
}
```

- [ ] **Step 4: Run HSGuru provider tests to verify they pass**

Run:

```bash
pnpm test -- apps/desktop/src/main/popular-decks-sync/hsguru-provider.test.ts --reporter=basic
```

Expected: PASS for `hsguru-provider.test.ts`.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/desktop/src/main/popular-decks-sync/hsguru-provider.ts apps/desktop/src/main/popular-decks-sync/hsguru-provider.test.ts
git commit -m "feat: extract hsguru popular deck provider"
```

---

### Task 4: Integrate Providers Into The Orchestrator

**Files:**
- Modify: `apps/desktop/src/main/popular-decks-sync/index.ts`
- Modify: `apps/desktop/src/main/popular-decks-sync/index.test.ts`

- [ ] **Step 1: Write failing orchestrator tests for schema v2 and provider diagnostics**

Update imports in `apps/desktop/src/main/popular-decks-sync/index.test.ts`:

```ts
import type { PopularDeck } from '@hdt/core';
import {
  PopularDeckProviderError,
  type PopularDeckProvider,
  type PopularDeckSourceSnapshot,
  type SyncProgress,
} from './provider-types';
```

Also change the existing `./index` import to:

```ts
import { PopularDeckSyncOrchestrator } from './index';
```

Replace the first persisted cache assertion with:

```ts
    expect(onDisk.schemaVersion).toBe(2);
    expect(onDisk.decks).toHaveLength(1);
    expect(onDisk.decks[0].class).toBe('ROGUE');
    expect(onDisk.sources).toEqual([
      {
        id: 'hsguru',
        label: 'HSGuru',
        enabled: true,
        status: 'ok',
        fetchedAt: '2026-05-09T12:00:00.000Z',
        deckCount: 1,
      },
      {
        id: 'hsreplay',
        label: 'HSReplay',
        enabled: false,
        status: 'unsupported',
        reason: 'blocked-by-cloudflare',
      },
      {
        id: 'lushi',
        label: 'Lushi',
        enabled: false,
        status: 'unsupported',
        reason: 'no-public-deck-api-found',
      },
    ]);
```

Add helpers near `makeOrchestrator`:

```ts
const SUCCESS_DECK: PopularDeck = {
  id: 'tempo-rogue-1',
  name: 'Tempo Rogue',
  class: 'ROGUE',
  format: 'Standard',
  archetype: 'Tempo',
  deckstring: ROGUE_DECKSTRING,
  winratePercent: 50.2,
  gamesCount: 100,
  author: 'test-provider',
  updatedAt: '2026-05-09',
};

function fakeProvider(
  init: {
    id: 'hsguru' | 'hsreplay' | 'lushi';
    label: string;
    defaultEnabled?: boolean;
    status?: ReturnType<PopularDeckProvider['getStatus']>;
    sync?: PopularDeckProvider['sync'];
  },
): PopularDeckProvider {
  return {
    id: init.id,
    label: init.label,
    defaultEnabled: init.defaultEnabled ?? true,
    getStatus: () => init.status ?? { status: 'supported' },
    sync:
      init.sync ??
      vi.fn(async (ctx) => ({
        decks: [SUCCESS_DECK],
        source: {
          id: init.id,
          label: init.label,
          enabled: true,
          status: 'ok',
          fetchedAt: ctx.fetchedAt,
          deckCount: 1,
        } satisfies PopularDeckSourceSnapshot,
      })),
  };
}
```

Add tests under `describe('PopularDeckSyncOrchestrator.startSync', ...)`:

```ts
  it('records unsupported providers without invoking their sync functions', async () => {
    const supported = fakeProvider({ id: 'hsguru', label: 'HSGuru' });
    const unsupportedSync = vi.fn();
    const unsupported = fakeProvider({
      id: 'hsreplay',
      label: 'HSReplay',
      defaultEnabled: false,
      status: { status: 'unsupported', reason: 'blocked-by-cloudflare' },
      sync: unsupportedSync,
    });
    const orch = new PopularDeckSyncOrchestrator({
      fetchImpl: vi.fn(),
      getCardLookup: () => () => null,
      cacheDir: dir,
      delay: async () => undefined,
      now: () => new Date('2026-05-09T12:00:00Z'),
      providers: [supported, unsupported],
    });

    const result = await orch.startSync(() => undefined);
    expect(result).toEqual({
      ok: true,
      fetchedAt: '2026-05-09T12:00:00.000Z',
      count: 1,
    });
    expect(unsupportedSync).not.toHaveBeenCalled();
    const onDisk = JSON.parse(readFileSync(join(dir, SYNCED_FILENAME), 'utf-8'));
    expect(onDisk.sources).toEqual([
      {
        id: 'hsguru',
        label: 'HSGuru',
        enabled: true,
        status: 'ok',
        fetchedAt: '2026-05-09T12:00:00.000Z',
        deckCount: 1,
      },
      {
        id: 'hsreplay',
        label: 'HSReplay',
        enabled: false,
        status: 'unsupported',
        reason: 'blocked-by-cloudflare',
      },
    ]);
  });

  it('captures one provider failure while persisting successful provider decks', async () => {
    const failing = fakeProvider({
      id: 'hsreplay',
      label: 'HSReplay',
      sync: vi.fn(async () => {
        throw new PopularDeckProviderError('network-failed', 'blocked');
      }),
    });
    const successful = fakeProvider({ id: 'hsguru', label: 'HSGuru' });
    const orch = new PopularDeckSyncOrchestrator({
      fetchImpl: vi.fn(),
      getCardLookup: () => () => null,
      cacheDir: dir,
      delay: async () => undefined,
      now: () => new Date('2026-05-09T12:00:00Z'),
      providers: [failing, successful],
    });

    const result = await orch.startSync(() => undefined);
    expect(result).toEqual({
      ok: true,
      fetchedAt: '2026-05-09T12:00:00.000Z',
      count: 1,
    });
    const onDisk = JSON.parse(readFileSync(join(dir, SYNCED_FILENAME), 'utf-8'));
    expect(onDisk.sources).toEqual([
      {
        id: 'hsreplay',
        label: 'HSReplay',
        enabled: true,
        status: 'failed',
        error: 'network-failed',
      },
      {
        id: 'hsguru',
        label: 'HSGuru',
        enabled: true,
        status: 'ok',
        fetchedAt: '2026-05-09T12:00:00.000Z',
        deckCount: 1,
      },
    ]);
  });

  it('returns the first provider error when every enabled provider fails', async () => {
    const failing = fakeProvider({
      id: 'hsguru',
      label: 'HSGuru',
      sync: vi.fn(async () => {
        throw new PopularDeckProviderError('parse-failed', 'empty');
      }),
    });
    const orch = new PopularDeckSyncOrchestrator({
      fetchImpl: vi.fn(),
      getCardLookup: () => () => null,
      cacheDir: dir,
      delay: async () => undefined,
      now: () => new Date('2026-05-09T12:00:00Z'),
      providers: [failing],
    });

    const result = await orch.startSync(() => undefined);
    expect(result).toEqual({ ok: false, error: 'parse-failed' });
    expect(existsSync(join(dir, SYNCED_FILENAME))).toBe(false);
  });
```

- [ ] **Step 2: Run orchestrator tests to verify they fail**

Run:

```bash
pnpm test -- apps/desktop/src/main/popular-decks-sync/index.test.ts --reporter=basic
```

Expected: FAIL because `SyncDeps.providers` does not exist and the orchestrator still writes schema version 1.

- [ ] **Step 3: Update orchestrator imports and public type re-exports**

In `apps/desktop/src/main/popular-decks-sync/index.ts`, replace HSGuru-specific imports with:

```ts
import type { PopularDeck } from '@hdt/core';
import { createPopularDeckProviders } from './provider-registry';
import {
  PopularDeckProviderError,
  type PopularDeckProvider,
  type PopularDeckProviderContext,
  type PopularDeckSourceSnapshot,
  type ProgressCallback,
  type SyncProgress,
  type SyncPhase,
} from './provider-types';
import {
  loadCache,
  saveCache,
  type SyncedSnapshot,
  type SyncedSnapshotV2,
} from './storage';
import type { FetchImpl } from './fetcher';
import type { TransformContext } from './transformer';
```

Remove local `SyncPhase`, `SyncProgress`, and `ProgressCallback` definitions because those now come from `provider-types.ts`.

Update `SyncDeps`:

```ts
export interface SyncDeps {
  fetchImpl: FetchImpl;
  /** Returns the live CardDb-backed lookup, or null when not yet loaded. */
  getCardLookup: () => TransformContext['findByDbfId'] | null;
  /** Directory where `synced.json` lives (typically `<userData>/popular-decks`). */
  cacheDir: string;
  /** Override for tests; default uses real setTimeout-backed delay. */
  delay?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Cap on archetypes/variants per archetype. */
  archetypeLimit?: number;
  variantLimit?: number;
  /** Override for tests; default uses the built-in provider registry. */
  providers?: PopularDeckProvider[];
}
```

- [ ] **Step 4: Replace HSGuru-specific `runSync` body with provider orchestration**

In `runSync`, keep the setup for `delay`, `now`, limits, `fetchedAt`, and logging. Replace the current meta/variant/transform block with:

```ts
    const providers = this.deps.providers ?? createPopularDeckProviders();
    const decks: PopularDeck[] = [];
    const sources: PopularDeckSourceSnapshot[] = [];
    let enabledSupportedProviders = 0;
    let firstFailure: string | null = null;

    for (const provider of providers) {
      const providerStatus = provider.getStatus();
      const enabled = provider.defaultEnabled;

      if (providerStatus.status === 'unsupported') {
        sources.push({
          id: provider.id,
          label: provider.label,
          enabled: false,
          status: 'unsupported',
          reason: providerStatus.reason,
        });
        continue;
      }

      if (!enabled) {
        sources.push({
          id: provider.id,
          label: provider.label,
          enabled: false,
          status: 'disabled',
        });
        continue;
      }

      enabledSupportedProviders++;
      const context: PopularDeckProviderContext = {
        fetchImpl: this.deps.fetchImpl,
        delay,
        findByDbfId: lookup,
        fetchedAt,
        archetypeLimit,
        variantLimit,
        progressCb,
        signal,
      };

      try {
        const result = await provider.sync(context);
        decks.push(...result.decks);
        sources.push(result.source);
      } catch (e) {
        const error = classifyError(e, 'sync-failed');
        firstFailure ??= error;
        sources.push({
          id: provider.id,
          label: provider.label,
          enabled: true,
          status: 'failed',
          error,
        });
        if (error === 'aborted') return { ok: false, error };
      }
    }

    if (enabledSupportedProviders === 0) {
      return { ok: false, error: 'no-enabled-providers' };
    }

    if (decks.length === 0) {
      return { ok: false, error: firstFailure ?? 'parse-failed' };
    }
```

Then keep the persist phase, but change the snapshot to:

```ts
    const snapshot: SyncedSnapshotV2 = {
      schemaVersion: 2,
      fetchedAt,
      decks,
      sources,
    };
```

- [ ] **Step 5: Preserve error classification for provider errors**

Replace `classifyError` in `index.ts` with:

```ts
function classifyError(e: unknown, fallback: string): string {
  if (e instanceof PopularDeckProviderError) return e.code;
  const err = e as { name?: string; message?: string } | null;
  if (err?.name === 'AbortError' || err?.message === 'aborted') return 'aborted';
  return fallback;
}
```

Update the bottom exports:

```ts
export { loadCache, saveCache, type SyncedSnapshot } from './storage';
export type { FetchImpl } from './fetcher';
export type { SyncProgress, SyncPhase } from './provider-types';
```

- [ ] **Step 6: Run orchestrator tests to verify they pass**

Run:

```bash
pnpm test -- apps/desktop/src/main/popular-decks-sync/index.test.ts --reporter=basic
```

Expected: PASS for `index.test.ts`.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/desktop/src/main/popular-decks-sync/index.ts apps/desktop/src/main/popular-decks-sync/index.test.ts
git commit -m "feat: sync popular decks through providers"
```

---

### Task 5: Focused Regression And Final Verification

**Files:**
- Verify: `apps/desktop/src/main/popular-decks-sync/*.ts`
- Verify: `apps/desktop/src/main/popular-decks-sync/*.test.ts`

- [ ] **Step 1: Run all popular deck sync tests**

Run:

```bash
pnpm test -- apps/desktop/src/main/popular-decks-sync --reporter=basic
```

Expected: PASS for all tests under `apps/desktop/src/main/popular-decks-sync`.

- [ ] **Step 2: Run related popular deck IPC and derived tests**

Run:

```bash
pnpm test -- apps/desktop/src/main/popular-decks-ipc.test.ts apps/desktop/src/main/popular-decks-derived.test.ts --reporter=basic
```

Expected: PASS for `popular-decks-ipc.test.ts` and `popular-decks-derived.test.ts`.

- [ ] **Step 3: Run desktop typecheck**

Run:

```bash
pnpm --filter @hdt/desktop typecheck
```

Expected: PASS with exit code 0.

- [ ] **Step 4: Run full test suite if time allows before final handoff**

Run:

```bash
pnpm test -- --reporter=basic --silent
```

Expected: PASS for the full Vitest suite. If this is too slow or blocked by native rebuilds, report the exact failure or timeout and keep the focused test evidence from Steps 1-3.

- [ ] **Step 5: Check git status and commit any remaining planned changes**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing untracked files remain, or no output if the worktree is otherwise clean.

If planned provider changes are still unstaged, commit them:

```bash
git add apps/desktop/src/main/popular-decks-sync
git commit -m "test: verify popular deck provider sync"
```

Only run the final commit command when `git status --short` shows provider-related files that were not already committed in Tasks 1-4.

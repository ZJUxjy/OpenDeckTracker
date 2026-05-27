# HSGuru Class Matchup Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync HSGuru per-deck class matchup rows and render them in Deck Finder for the selected popular deck.

**Architecture:** Extend the existing popular-deck sync pipeline instead of adding a new service. HSGuru deck detail pages are fetched during sync, parsed into `PopularDeckClassMatchup[]`, stored in the synced snapshot, and returned through the existing `popular-decks:list` IPC. The renderer adds a compact class matchup heat table in the selected deck detail pane.

**Tech Stack:** TypeScript, Vitest, Electron IPC, React, existing HSGuru HTML parser/fetcher, local JSON cache in `popular-decks/synced.json`.

---

## File Structure

- Modify `packages/core/src/deck/deck-types.ts`: add `PopularDeckClassMatchup` and optional `classMatchups` on `PopularDeck`.
- Modify `packages/core/src/deck/index.ts`: export the new type.
- Modify `apps/desktop/src/main/popular-decks-sync/parser.ts`: add class-name mapping and `parseDeckClassMatchups(html)`.
- Modify `apps/desktop/src/main/popular-decks-sync/parser.test.ts`: add deck detail fixture assertions.
- Add `apps/desktop/src/main/popular-decks-sync/__fixtures__/hsguru-deck-detail.html`: small representative deck detail page fragment.
- Modify `apps/desktop/src/main/popular-decks-sync/fetcher.ts`: add `fetchHsguruDeckDetail(deckUrl, deps, signal)`.
- Modify `apps/desktop/src/main/popular-decks-sync/fetcher.test.ts`: verify deck detail fetch uses the shared HTML fetcher.
- Modify `apps/desktop/src/main/popular-decks-sync/transformer.ts`: allow `transformVariant` to receive parsed class matchups.
- Modify `apps/desktop/src/main/popular-decks-sync/transformer.test.ts`: prove class matchup rows are copied into the output deck.
- Modify `apps/desktop/src/main/popular-decks-sync/index.ts`: add a detail fetch/parse pass between variants and transform.
- Modify `apps/desktop/src/main/popular-decks-sync/index.test.ts`: cover successful detail sync and partial detail failure.
- Modify `apps/desktop/src/main/popular-decks-sync/storage.ts`: bump schema to 2, accept v1 and v2 snapshots, validate `classMatchups` when present.
- Modify `apps/desktop/src/main/popular-decks-sync/storage.test.ts`: cover v1 compatibility, v2 read/write, invalid class matchup rejection.
- Modify `apps/desktop/src/main/popular-decks-ipc.test.ts`: prove `classMatchups` survive `popular-decks:list`.
- Modify `apps/desktop/src/renderer/src/components/DeckFinderTab.tsx`: render a class matchup section for the selected deck.
- Modify `apps/desktop/src/renderer/tests/DeckFinderTab.test.tsx`: cover rows and empty state.
- Modify `resources/locales/en-US.json` and `resources/locales/zh-CN.json`: add Deck Finder class matchup labels.

---

## Task 1: Core Popular Deck Matchup Types

**Files:**
- Modify: `packages/core/src/deck/deck-types.ts`
- Modify: `packages/core/src/deck/index.ts`
- Test: `packages/core/src/deck/popular-deck-search.test.ts`

- [ ] **Step 1: Write a failing type-oriented test fixture**

In `packages/core/src/deck/popular-deck-search.test.ts`, update the `D` helper's default returned object to include a representative class matchup so TypeScript proves `PopularDeckEnriched` accepts the field:

```ts
const D = (over: Partial<PopularDeckEnriched>): PopularDeckEnriched => ({
  id: over.id ?? 'deck',
  name: over.name ?? 'Deck',
  class: over.class ?? 'MAGE',
  format: over.format ?? 'Standard',
  archetype: over.archetype ?? 'Aggro',
  deckstring: over.deckstring ?? 'AAEC',
  winratePercent: over.winratePercent ?? 50,
  gamesCount: over.gamesCount ?? 1,
  author: over.author ?? 'hsguru',
  updatedAt: over.updatedAt ?? '2026-05-27',
  classMatchups: over.classMatchups ?? [
    { opponentClass: 'DRUID', winratePercent: 55.5, gamesCount: 20, popularityPercent: 12.3 },
  ],
  manaCurve: over.manaCurve ?? [0, 0, 0, 0, 0, 0, 0, 0],
  keyCards: over.keyCards ?? [],
  cardNames: over.cardNames ?? [],
  deckCardList: over.deckCardList ?? [],
  dustCost: over.dustCost ?? 0,
});
```

- [ ] **Step 2: Run the focused core test and expect a type failure**

Run:

```bash
pnpm --filter @hdt/core exec vitest run src/deck/popular-deck-search.test.ts
```

Expected: TypeScript/Vitest fails because `classMatchups` is not yet part of `PopularDeckEnriched` / `PopularDeck`.

- [ ] **Step 3: Add the core type**

In `packages/core/src/deck/deck-types.ts`, add this near the popular deck interfaces:

```ts
export type MatchupHeroClass = Exclude<HeroClass, 'NEUTRAL'>;

export interface PopularDeckClassMatchup {
  opponentClass: MatchupHeroClass;
  winratePercent: number;
  gamesCount: number;
  popularityPercent: number;
}
```

Then extend `PopularDeck`:

```ts
export interface PopularDeck {
  id: string;
  name: string;
  class: HeroClass;
  format: Format;
  archetype: PopularDeckArchetype;
  deckstring: string;
  winratePercent: number;
  gamesCount: number;
  author: string;
  updatedAt: string;
  classMatchups?: readonly PopularDeckClassMatchup[];
}
```

- [ ] **Step 4: Export the type from the deck barrel**

In `packages/core/src/deck/index.ts`, include:

```ts
type MatchupHeroClass,
type PopularDeckClassMatchup,
```

inside the existing export from `./deck-types`.

- [ ] **Step 5: Run the focused core test and typecheck**

Run:

```bash
pnpm --filter @hdt/core exec vitest run src/deck/popular-deck-search.test.ts
pnpm --filter @hdt/core typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/deck/deck-types.ts packages/core/src/deck/index.ts packages/core/src/deck/popular-deck-search.test.ts
git commit -m "feat(core): add popular deck class matchup type"
```

---

## Task 2: HSGuru Deck Detail Parsing and Fetching

**Files:**
- Add: `apps/desktop/src/main/popular-decks-sync/__fixtures__/hsguru-deck-detail.html`
- Modify: `apps/desktop/src/main/popular-decks-sync/parser.ts`
- Modify: `apps/desktop/src/main/popular-decks-sync/parser.test.ts`
- Modify: `apps/desktop/src/main/popular-decks-sync/fetcher.ts`
- Modify: `apps/desktop/src/main/popular-decks-sync/fetcher.test.ts`

- [ ] **Step 1: Add a deck detail fixture**

Create `apps/desktop/src/main/popular-decks-sync/__fixtures__/hsguru-deck-detail.html` with this representative fragment:

```html
<main>
  <h1>Burn Mage Standard</h1>
  <section>
    <h2>Stats</h2>
    <div>Diamond-Legend</div>
    <div>35.4.2</div>
    <table>
      <thead>
        <tr><th>Class</th><th>Winrate</th><th>Total Games</th></tr>
      </thead>
      <tbody>
        <tr><td>Death Knight</td><td>40.0</td><td>5 (2.2%)</td></tr>
        <tr><td>Demon Hunter</td><td>42.9</td><td>7 (3.0%)</td></tr>
        <tr><td>Druid</td><td>44.0</td><td>50 (21.6%)</td></tr>
        <tr><td>Hunter</td><td>66.1</td><td>56 (24.2%)</td></tr>
        <tr><td>Mage</td><td>60.9</td><td>23 (10.0%)</td></tr>
        <tr><td>Paladin</td><td>50.0</td><td>20 (8.7%)</td></tr>
        <tr><td>Priest</td><td>30.0</td><td>10 (4.3%)</td></tr>
        <tr><td>Rogue</td><td>65.2</td><td>23 (10.0%)</td></tr>
        <tr><td>Shaman</td><td>63.2</td><td>19 (8.2%)</td></tr>
        <tr><td>Warlock</td><td>77.8</td><td>9 (3.9%)</td></tr>
        <tr><td>Warrior</td><td>33.3</td><td>9 (3.9%)</td></tr>
        <tr><td>Total</td><td>55.4</td><td>231</td></tr>
      </tbody>
    </table>
  </section>
</main>
```

- [ ] **Step 2: Add failing parser tests**

In `apps/desktop/src/main/popular-decks-sync/parser.test.ts`, import `parseDeckClassMatchups` and read the new fixture:

```ts
import {
  buildDeckUrls,
  decodeHtml,
  parseDeckClassMatchups,
  parseDeckVariants,
  parseLegendArchetypes,
} from './parser';

const DECK_DETAIL_HTML = readFileSync(join(FIX_DIR, 'hsguru-deck-detail.html'), 'utf-8');
```

Add:

```ts
describe('parseDeckClassMatchups', () => {
  it('extracts opponent class matchup rows from the deck detail fixture', () => {
    const rows = parseDeckClassMatchups(DECK_DETAIL_HTML);
    expect(rows).toHaveLength(11);
    expect(rows[0]).toEqual({
      opponentClass: 'DEATHKNIGHT',
      winratePercent: 40,
      gamesCount: 5,
      popularityPercent: 2.2,
    });
    expect(rows.find((r) => r.opponentClass === 'WARLOCK')).toEqual({
      opponentClass: 'WARLOCK',
      winratePercent: 77.8,
      gamesCount: 9,
      popularityPercent: 3.9,
    });
  });

  it('skips the Total row', () => {
    const rows = parseDeckClassMatchups(DECK_DETAIL_HTML);
    expect(rows.map((r) => r.opponentClass)).not.toContain('NEUTRAL');
    expect(rows).toHaveLength(11);
  });

  it('returns an empty array when the class matchup table is absent', () => {
    expect(parseDeckClassMatchups('<html><body>No stats here</body></html>')).toEqual([]);
  });

  it('supports compact text-rendered HSGuru output', () => {
    const html = 'Class Winrate Total Games\nDruid 44.0 50 (21.6%)\nWarrior 33.3 9 (3.9%)\nTotal 55.4 231';
    expect(parseDeckClassMatchups(html)).toEqual([
      { opponentClass: 'DRUID', winratePercent: 44, gamesCount: 50, popularityPercent: 21.6 },
      { opponentClass: 'WARRIOR', winratePercent: 33.3, gamesCount: 9, popularityPercent: 3.9 },
    ]);
  });
});
```

- [ ] **Step 3: Run parser tests and expect failure**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/popular-decks-sync/parser.test.ts
```

Expected: FAIL because `parseDeckClassMatchups` is not exported.

- [ ] **Step 4: Implement parser**

In `apps/desktop/src/main/popular-decks-sync/parser.ts`, import the matchup type and add:

```ts
import type { MatchupHeroClass, PopularDeckClassMatchup } from '@hdt/core';
```

Add the class map and parser:

```ts
const CLASS_NAME_TO_HERO_CLASS: Record<string, MatchupHeroClass> = {
  'Death Knight': 'DEATHKNIGHT',
  'Demon Hunter': 'DEMONHUNTER',
  Druid: 'DRUID',
  Hunter: 'HUNTER',
  Mage: 'MAGE',
  Paladin: 'PALADIN',
  Priest: 'PRIEST',
  Rogue: 'ROGUE',
  Shaman: 'SHAMAN',
  Warlock: 'WARLOCK',
  Warrior: 'WARRIOR',
};

const CLASS_ROW_PATTERN =
  /(Death Knight|Demon Hunter|Druid|Hunter|Mage|Paladin|Priest|Rogue|Shaman|Warlock|Warrior)\s+(\d+(?:\.\d+)?)\s+(\d+)\s+\((\d+(?:\.\d+)?)%\)/g;

export function parseDeckClassMatchups(html: string): PopularDeckClassMatchup[] {
  if (!html.includes('Class') || !html.includes('Winrate') || !html.includes('Total Games')) {
    return [];
  }

  const text = decodeHtml(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rows: PopularDeckClassMatchup[] = [];
  for (const match of text.matchAll(CLASS_ROW_PATTERN)) {
    const className = match[1]!;
    const opponentClass = CLASS_NAME_TO_HERO_CLASS[className];
    if (opponentClass === undefined) continue;
    rows.push({
      opponentClass,
      winratePercent: Number(match[2]!),
      gamesCount: Number(match[3]!),
      popularityPercent: Number(match[4]!),
    });
  }
  return rows;
}
```

- [ ] **Step 5: Add failing fetcher test**

In `apps/desktop/src/main/popular-decks-sync/fetcher.test.ts`, add:

```ts
import { fetchHsguruDeckDetail } from './fetcher';

it('fetches HSGuru deck detail HTML by URL', async () => {
  const fetchImpl = vi.fn(async () => new Response('<html>deck</html>', { status: 200 }));
  await expect(
    fetchHsguruDeckDetail('https://www.hsguru.com/deck/39958736', { fetchImpl, delay: async () => undefined }),
  ).resolves.toBe('<html>deck</html>');
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://www.hsguru.com/deck/39958736',
    expect.objectContaining({
      headers: expect.objectContaining({ accept: 'text/html,application/xhtml+xml' }),
    }),
  );
});
```

- [ ] **Step 6: Implement fetcher wrapper**

In `apps/desktop/src/main/popular-decks-sync/fetcher.ts`, add:

```ts
export async function fetchHsguruDeckDetail(
  deckUrl: string,
  deps: FetcherDeps,
  signal?: AbortSignal,
): Promise<string> {
  return fetchHsguruText(deckUrl, deps, signal);
}
```

- [ ] **Step 7: Run parser and fetcher tests**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/popular-decks-sync/parser.test.ts src/main/popular-decks-sync/fetcher.test.ts
```

Expected: both test files pass.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/main/popular-decks-sync/__fixtures__/hsguru-deck-detail.html apps/desktop/src/main/popular-decks-sync/parser.ts apps/desktop/src/main/popular-decks-sync/parser.test.ts apps/desktop/src/main/popular-decks-sync/fetcher.ts apps/desktop/src/main/popular-decks-sync/fetcher.test.ts
git commit -m "feat(sync): parse hsguru class matchups"
```

---

## Task 3: Attach Matchups During Sync and Cache Schema v2

**Files:**
- Modify: `apps/desktop/src/main/popular-decks-sync/transformer.ts`
- Modify: `apps/desktop/src/main/popular-decks-sync/transformer.test.ts`
- Modify: `apps/desktop/src/main/popular-decks-sync/storage.ts`
- Modify: `apps/desktop/src/main/popular-decks-sync/storage.test.ts`
- Modify: `apps/desktop/src/main/popular-decks-sync/index.ts`
- Modify: `apps/desktop/src/main/popular-decks-sync/index.test.ts`

- [ ] **Step 1: Add failing transformer test**

In `apps/desktop/src/main/popular-decks-sync/transformer.test.ts`, add:

```ts
it('attaches class matchup rows when provided', () => {
  const out = transformVariant(
    ARCHETYPE,
    VARIANT_ROGUE,
    FETCHED_AT,
    rogueCtx(),
    [{ opponentClass: 'MAGE', winratePercent: 61.5, gamesCount: 13, popularityPercent: 8.1 }],
  );
  expect(out?.classMatchups).toEqual([
    { opponentClass: 'MAGE', winratePercent: 61.5, gamesCount: 13, popularityPercent: 8.1 },
  ]);
});
```

- [ ] **Step 2: Run transformer test and expect signature failure**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/popular-decks-sync/transformer.test.ts
```

Expected: FAIL because `transformVariant` does not accept a fifth argument.

- [ ] **Step 3: Extend transformer signature**

In `apps/desktop/src/main/popular-decks-sync/transformer.ts`, update imports:

```ts
import type { Format, HeroClass, PopularDeck, PopularDeckClassMatchup } from '@hdt/core';
```

Change the signature:

```ts
export function transformVariant(
  archetype: HsguruArchetypeRow,
  variant: HsguruDeckVariant,
  fetchedAt: string,
  ctx: TransformContext,
  classMatchups: readonly PopularDeckClassMatchup[] = [],
): PopularDeck | null {
```

Attach the field only when rows exist:

```ts
  return {
    id,
    name: variant.title || archetype.archetype,
    class: heroClass,
    format: formatFromBlueprint(blueprint),
    archetype: classifyArchetypeLabel(archetype.archetype),
    deckstring: variant.code,
    winratePercent: Math.round(variant.winrate * 10) / 10,
    gamesCount: variant.games,
    author: 'hsguru',
    updatedAt: fetchedAt.slice(0, 10),
    ...(classMatchups.length > 0 ? { classMatchups: [...classMatchups] } : {}),
  };
```

- [ ] **Step 4: Add failing storage tests**

In `apps/desktop/src/main/popular-decks-sync/storage.test.ts`, change the unsupported schema test to version 3 and add:

```ts
it('loads legacy schema v1 snapshots without class matchups', async () => {
  const snapshot = {
    schemaVersion: 1,
    fetchedAt: '2026-05-09T00:00:00Z',
    decks: [VALID_DECK],
  };
  writeFileSync(join(dir, SYNCED_FILENAME), JSON.stringify(snapshot));
  expect(await loadCache(dir)).toEqual(snapshot);
});

it('reads back schema v2 snapshots with class matchups', async () => {
  const deckWithMatchups: PopularDeck = {
    ...VALID_DECK,
    classMatchups: [
      { opponentClass: 'MAGE', winratePercent: 60, gamesCount: 10, popularityPercent: 20 },
    ],
  };
  const snapshot = {
    schemaVersion: 2 as const,
    fetchedAt: '2026-05-09T12:00:00Z',
    decks: [deckWithMatchups],
  };
  await saveCache(dir, snapshot);
  expect(await loadCache(dir)).toEqual(snapshot);
});

it('returns null when classMatchups have invalid shape', async () => {
  writeFileSync(
    join(dir, SYNCED_FILENAME),
    JSON.stringify({
      schemaVersion: 2,
      fetchedAt: '2026-05-09T00:00:00Z',
      decks: [{ ...VALID_DECK, classMatchups: [{ opponentClass: 'MAGE', winratePercent: 'great' }] }],
    }),
  );
  expect(await loadCache(dir)).toBeNull();
});
```

- [ ] **Step 5: Implement storage schema v2 compatibility**

In `apps/desktop/src/main/popular-decks-sync/storage.ts`, change:

```ts
export const SYNCED_SCHEMA_VERSION = 2;
export type SyncedSchemaVersion = 1 | 2;

export interface SyncedSnapshot {
  schemaVersion: SyncedSchemaVersion;
  fetchedAt: string;
  decks: PopularDeck[];
}
```

Add matchup validation:

```ts
const MATCHUP_HERO_CLASS_VALUES: ReadonlySet<string> = new Set([
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR',
]);

function isClassMatchup(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['opponentClass'] === 'string' &&
    MATCHUP_HERO_CLASS_VALUES.has(v['opponentClass']) &&
    typeof v['winratePercent'] === 'number' &&
    typeof v['gamesCount'] === 'number' &&
    typeof v['popularityPercent'] === 'number'
  );
}
```

Extend `isPopularDeck`:

```ts
    && (
      v['classMatchups'] === undefined ||
      (Array.isArray(v['classMatchups']) && v['classMatchups'].every(isClassMatchup))
    )
```

Accept versions 1 and 2:

```ts
  if (obj['schemaVersion'] !== 1 && obj['schemaVersion'] !== SYNCED_SCHEMA_VERSION) return null;
```

Return the parsed schema version:

```ts
  return {
    schemaVersion: obj['schemaVersion'] as SyncedSchemaVersion,
    fetchedAt: obj['fetchedAt'],
    decks: decks as PopularDeck[],
  };
```

- [ ] **Step 6: Add failing orchestrator tests**

In `apps/desktop/src/main/popular-decks-sync/index.test.ts`, add a detail fixture string near `ARCHETYPE_HTML`:

```ts
const DECK_DETAIL_HTML = `
  Class Winrate Total Games
  Mage 60.0 10 (20.0%)
  Warrior 40.0 5 (10.0%)
  Total 53.3 15
`;
```

Update the default `fetchImpl` in `makeOrchestrator`:

```ts
if (url.includes('/deck/39285857')) {
  return new Response(DECK_DETAIL_HTML, { status: 200 });
}
```

Add:

```ts
it('fetches deck detail pages and persists class matchups', async () => {
  const fetchSpy = vi.fn(async (url: string) => {
    if (url.includes('/meta?')) return new Response(META_HTML, { status: 200 });
    if (url.includes('/deck/39285857')) return new Response(DECK_DETAIL_HTML, { status: 200 });
    return new Response(ARCHETYPE_HTML, { status: 200 });
  });
  const orch = makeOrchestrator({ cacheDir: dir, fetchSpy });
  const result = await orch.startSync(() => undefined);
  expect(result.ok).toBe(true);
  expect(fetchSpy).toHaveBeenCalledWith(
    'https://www.hsguru.com/deck/39285857',
    expect.any(Object),
  );
  const onDisk = JSON.parse(readFileSync(join(dir, SYNCED_FILENAME), 'utf-8'));
  expect(onDisk.schemaVersion).toBe(2);
  expect(onDisk.decks[0].classMatchups).toEqual([
    { opponentClass: 'MAGE', winratePercent: 60, gamesCount: 10, popularityPercent: 20 },
    { opponentClass: 'WARRIOR', winratePercent: 40, gamesCount: 5, popularityPercent: 10 },
  ]);
});

it('keeps the deck when its detail page fetch fails', async () => {
  const fetchSpy = vi.fn(async (url: string) => {
    if (url.includes('/meta?')) return new Response(META_HTML, { status: 200 });
    if (url.includes('/deck/39285857')) throw new Error('detail failed');
    return new Response(ARCHETYPE_HTML, { status: 200 });
  });
  const orch = makeOrchestrator({ cacheDir: dir, fetchSpy });
  const result = await orch.startSync(() => undefined);
  expect(result).toEqual({
    ok: true,
    fetchedAt: '2026-05-09T12:00:00.000Z',
    count: 1,
  });
  const onDisk = JSON.parse(readFileSync(join(dir, SYNCED_FILENAME), 'utf-8'));
  expect(onDisk.decks[0].id).toBe('tempo-rogue-39285857');
  expect(onDisk.decks[0].classMatchups).toBeUndefined();
});
```

- [ ] **Step 7: Implement detail fetch pass in orchestrator**

In `apps/desktop/src/main/popular-decks-sync/index.ts`, update imports:

```ts
import type { PopularDeck, PopularDeckClassMatchup } from '@hdt/core';
import {
  fetchHsguruArchetypeVariants,
  fetchHsguruDeckDetail,
  fetchHsguruMeta,
  type FetchImpl,
  ARCHETYPE_DELAY_MS,
} from './fetcher';
import { parseDeckClassMatchups, parseDeckVariants, parseLegendArchetypes } from './parser';
```

In the transform loop, fetch details per variant before `transformVariant`:

```ts
        let classMatchups: readonly PopularDeckClassMatchup[] = [];
        try {
          const detailHtml = await fetchHsguruDeckDetail(variant.deckUrl, {
            fetchImpl: this.deps.fetchImpl,
            delay,
          }, signal);
          classMatchups = parseDeckClassMatchups(detailHtml);
        } catch (e) {
          console.warn('[popular-decks-sync] deck detail fetch failed', {
            deckId: variant.deckId,
            deckUrl: variant.deckUrl,
            name: (e as Error)?.name,
            message: (e as Error)?.message,
          });
        }
        const deck = transformVariant(archetype, variant, fetchedAt, {
          findByDbfId: lookup,
        }, classMatchups);
```

Keep existing `progressCb` behavior for `transform`; the detail fetch happens inside that phase so no renderer contract changes are required.

When building the snapshot, schema version should now use the updated storage constant:

```ts
const snapshot: SyncedSnapshot = {
  schemaVersion: 2,
  fetchedAt,
  decks,
};
```

- [ ] **Step 8: Run sync and storage tests**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/popular-decks-sync/transformer.test.ts src/main/popular-decks-sync/storage.test.ts src/main/popular-decks-sync/index.test.ts
```

Expected: all three files pass.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/main/popular-decks-sync/transformer.ts apps/desktop/src/main/popular-decks-sync/transformer.test.ts apps/desktop/src/main/popular-decks-sync/storage.ts apps/desktop/src/main/popular-decks-sync/storage.test.ts apps/desktop/src/main/popular-decks-sync/index.ts apps/desktop/src/main/popular-decks-sync/index.test.ts
git commit -m "feat(sync): persist hsguru class matchups"
```

---

## Task 4: Popular Deck IPC Pass-Through

**Files:**
- Modify: `apps/desktop/src/main/popular-decks-ipc.test.ts`
- Modify: `apps/desktop/src/main/popular-decks-ipc.ts`

- [ ] **Step 1: Add failing IPC assertion**

In `apps/desktop/src/main/popular-decks-ipc.test.ts`, add `classMatchups` to `SYNCED_DECK`:

```ts
  classMatchups: [
    { opponentClass: 'MAGE', winratePercent: 60, gamesCount: 10, popularityPercent: 20 },
  ],
```

In the first test, add:

```ts
expect(result.decks[0]!.classMatchups).toEqual([
  { opponentClass: 'MAGE', winratePercent: 60, gamesCount: 10, popularityPercent: 20 },
]);
```

- [ ] **Step 2: Run IPC test**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/popular-decks-ipc.test.ts
```

Expected: It may already pass because object spread preserves the field. If it passes, keep the test as regression coverage.

- [ ] **Step 3: Ensure no enrichment path drops the field**

If the test fails, update both `getPopularDecksList` mapping branches in `apps/desktop/src/main/popular-decks-ipc.ts` so they spread `...d` first and never reconstruct a `PopularDeck` without the matchup field. The no-CardDb branch should keep this shape:

```ts
{
  ...d,
  manaCurve: EMPTY_CURVE,
  keyCards: [],
  cardNames: [],
  deckCardList: [],
  dustCost: 0,
}
```

The CardDb-ready branch should keep this shape:

```ts
{
  ...d,
  manaCurve: computeManaCurve(d.deckstring, lookup),
  keyCards: computeKeyCards(d.deckstring, lookup),
  cardNames: computeCardNames(d.deckstring, lookup),
  deckCardList: computeDeckCardList(d.deckstring, lookup),
  dustCost: computeDustCost(d.deckstring, lookup),
}
```

- [ ] **Step 4: Run IPC test again**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/popular-decks-ipc.test.ts
```

Expected: test exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/popular-decks-ipc.ts apps/desktop/src/main/popular-decks-ipc.test.ts
git commit -m "test(sync): preserve popular deck class matchups in ipc"
```

---

## Task 5: Deck Finder Class Matchup UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/DeckFinderTab.tsx`
- Modify: `apps/desktop/src/renderer/tests/DeckFinderTab.test.tsx`
- Modify: `resources/locales/en-US.json`
- Modify: `resources/locales/zh-CN.json`

- [ ] **Step 1: Add class matchup data to the renderer fixture**

In `apps/desktop/src/renderer/tests/DeckFinderTab.test.tsx`, add to the first `FIXTURE` deck:

```ts
    classMatchups: [
      { opponentClass: 'DRUID', winratePercent: 44, gamesCount: 50, popularityPercent: 21.6 },
      { opponentClass: 'HUNTER', winratePercent: 66.1, gamesCount: 56, popularityPercent: 24.2 },
    ],
```

- [ ] **Step 2: Add failing renderer tests**

In the same file, add:

```ts
it('renders HSGuru class matchup rows for the selected popular deck', async () => {
  await act(async () => { renderTab(); });
  await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));

  const table = screen.getByTestId('deck-finder-class-matchups');
  expect(table).toHaveTextContent('Class Matchups');
  expect(screen.getByTestId('deck-finder-class-matchup-DRUID')).toHaveTextContent('Druid');
  expect(screen.getByTestId('deck-finder-class-matchup-DRUID')).toHaveTextContent('44%');
  expect(screen.getByTestId('deck-finder-class-matchup-DRUID')).toHaveTextContent('50');
  expect(screen.getByTestId('deck-finder-class-matchup-HUNTER')).toHaveTextContent('66.1%');
});

it('shows an empty class matchup state when the selected deck has no HSGuru matchup rows', async () => {
  const fixture = [{ ...FIXTURE[0]!, classMatchups: undefined }];
  (window as { hdt: { popularDecks: typeof window.hdt.popularDecks } }).hdt.popularDecks = {
    ...window.hdt.popularDecks,
    list: vi.fn().mockResolvedValue({ decks: fixture, source: 'seed', fetchedAt: null }),
  };

  await act(async () => { renderTab(); });
  await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));
  expect(screen.getByTestId('deck-finder-class-matchups-empty')).toHaveTextContent(
    'No HSGuru class matchup data for this deck yet.',
  );
});
```

- [ ] **Step 3: Run Deck Finder tests and expect failure**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/DeckFinderTab.test.tsx
```

Expected: FAIL because the UI section and i18n keys do not exist.

- [ ] **Step 4: Add i18n keys**

In `resources/locales/en-US.json`, under `decks.finder`, add:

```json
"classMatchupsLabel": "CLASS MATCHUPS",
"classMatchupsEmpty": "No HSGuru class matchup data for this deck yet.",
"classMatchupsHeaderClass": "Class",
"classMatchupsHeaderWinrate": "WR",
"classMatchupsHeaderGames": "Games"
```

In `resources/locales/zh-CN.json`, under `decks.finder`, add:

```json
"classMatchupsLabel": "职业对阵",
"classMatchupsEmpty": "这套卡组暂无 HSGuru 职业对阵数据。",
"classMatchupsHeaderClass": "职业",
"classMatchupsHeaderWinrate": "胜率",
"classMatchupsHeaderGames": "场次"
```

Keep JSON commas valid around neighboring keys.

- [ ] **Step 5: Add class label and formatting helpers**

In `apps/desktop/src/renderer/src/components/DeckFinderTab.tsx`, add these helpers near `formatGames`:

```ts
function matchupHeatClass(winrate: number): string {
  if (winrate >= 55) return 'bg-green/15 text-green border-green/30';
  if (winrate >= 50) return 'bg-accent-dim text-accent border-accent/40';
  if (winrate >= 45) return 'bg-amber/15 text-amber border-amber/30';
  return 'bg-red/15 text-red border-red/30';
}

function formatMatchupPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}
```

- [ ] **Step 6: Add the class matchup component**

In `apps/desktop/src/renderer/src/components/DeckFinderTab.tsx`, add this component before `KeyCardsList`:

```tsx
function ClassMatchupsTable({
  rows,
}: {
  rows: NonNullable<PopularDeckEnriched['classMatchups']>;
}): ReactElement {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <div
        data-testid="deck-finder-class-matchups-empty"
        className="rounded-sm border border-border bg-overlay-surface px-3 py-4 text-center text-xs text-text-mute"
      >
        {t('decks.finder.classMatchupsEmpty')}
      </div>
    );
  }

  return (
    <div data-testid="deck-finder-class-matchups" className="rounded-sm border border-border overflow-hidden">
      <div className="grid grid-cols-[1fr_64px_64px] bg-overlay-surface px-2 py-1.5 text-[9px] text-text-mute font-mono tracking-[0.12em]">
        <span>{t('decks.finder.classMatchupsHeaderClass')}</span>
        <span className="text-right">{t('decks.finder.classMatchupsHeaderWinrate')}</span>
        <span className="text-right">{t('decks.finder.classMatchupsHeaderGames')}</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.opponentClass}
            data-testid={`deck-finder-class-matchup-${row.opponentClass}`}
            className="grid grid-cols-[1fr_64px_64px] items-center gap-2 px-2 py-1.5 text-xs"
          >
            <span className="text-text">{t(CLASS_LABEL_KEYS[row.opponentClass])}</span>
            <span className={`text-right font-mono rounded border px-1 py-0.5 ${matchupHeatClass(row.winratePercent)}`}>
              {formatMatchupPercent(row.winratePercent)}
            </span>
            <span className="text-right font-mono text-text-dim">{formatGames(row.gamesCount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Render the component in selected deck detail**

In the selected deck detail pane, insert this block after the KPI cards and before the mana curve section:

```tsx
            <div>
              <div className="text-[9px] text-text-mute font-mono tracking-[0.14em] mb-2">
                {t('decks.finder.classMatchupsLabel')}
              </div>
              <ClassMatchupsTable rows={selected.classMatchups ?? []} />
            </div>
```

- [ ] **Step 8: Run renderer and i18n tests**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/DeckFinderTab.test.tsx src/renderer/tests/i18n-messages.test.ts
```

Expected: both test files pass.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/renderer/src/components/DeckFinderTab.tsx apps/desktop/src/renderer/tests/DeckFinderTab.test.tsx resources/locales/en-US.json resources/locales/zh-CN.json
git commit -m "feat(renderer): show hsguru class matchups"
```

---

## Task 6: Final Verification

**Files:**
- No new source files.
- Verify all files touched by Tasks 1-5.

- [ ] **Step 1: Run focused core tests**

Run:

```bash
pnpm --filter @hdt/core exec vitest run src/deck/popular-deck-search.test.ts src/deck/popular-decks-seed.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run focused desktop main-process tests**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/popular-decks-sync/parser.test.ts src/main/popular-decks-sync/fetcher.test.ts src/main/popular-decks-sync/transformer.test.ts src/main/popular-decks-sync/storage.test.ts src/main/popular-decks-sync/index.test.ts src/main/popular-decks-ipc.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run focused renderer tests**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/DeckFinderTab.test.tsx src/renderer/tests/i18n-messages.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Run typechecks**

Run:

```bash
pnpm --filter @hdt/core typecheck
pnpm --filter @hdt/desktop typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: Optional manual smoke**

Run:

```bash
pnpm --filter @hdt/desktop dev
```

Expected: Deck Finder opens, existing seed data still displays, pressing "Sync popular decks" writes a schema v2 `popular-decks/synced.json`, and a synced deck with class matchup data shows the new class matchup section. If HSGuru is unreachable, the app still displays the previous cache or seed list.

- [ ] **Step 6: Final commit if verification fixes were needed**

If Steps 1-4 required any fixes after the Task 5 commit, commit those fixes:

```bash
git add packages/core/src/deck apps/desktop/src/main/popular-decks-sync apps/desktop/src/main/popular-decks-ipc.ts apps/desktop/src/main/popular-decks-ipc.test.ts apps/desktop/src/renderer/src/components/DeckFinderTab.tsx apps/desktop/src/renderer/tests/DeckFinderTab.test.tsx resources/locales/en-US.json resources/locales/zh-CN.json
git commit -m "test(sync): verify hsguru class matchup flow"
```

Expected: commit succeeds, or there are no remaining changes to commit.

# Herald Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track local-player Herald / 兆示 trigger count and surface it on Herald-related cards, including the in-game player overlay.

**Architecture:** Extend hsdata conversion so Herald caster/payoff metadata is available to all consumers. Keep match state in `MatchExtraDisplayState`, use a small PowerEvent detector for non-PLAY Herald triggers, and render the count through existing `LiveDeckPanel` extra-display plumbing plus a compact header chip reused by the player overlay.

**Tech Stack:** TypeScript, Vitest, React, Zustand, Electron main/renderer, hsdata XML converter, `@hdt/core`, `@hdt/hearthdb`, `@hdt/desktop`.

---

## File Structure

- Modify `packages/hearthdb/src/card-defs.ts`: add optional `referencedTags?: string[]` to `CardDef`.
- Modify `scripts/convert-hsdata-cards.ts`: parse `<ReferencedTag>` and add `HERALD` to generated mechanics.
- Modify `scripts/convert-hsdata-cards.test.ts`: cover `HERALD` mechanics and `referencedTags`.
- Create `scripts/fixtures/hsdata-herald.xml`: tiny fixture with one Herald caster and one Herald payoff.
- Create `packages/core/src/tracker/herald.ts`: shared Herald metadata helpers and counter key.
- Create `packages/core/src/tracker/herald.test.ts`: timing and relevance tests.
- Modify `packages/core/src/tracker/extra-display-state.ts`: increment `heraldCountThisGame`.
- Modify `packages/core/src/tracker/extra-display-state.test.ts`: counter tests for play/trigger/power timing.
- Modify `packages/core/src/tracker/deck-tracker.ts`: expose `recordHeraldTriggered`.
- Create `packages/core/src/tracker/herald-trigger-detector.ts`: deduped detector for non-PLAY Herald block starts.
- Create `packages/core/src/tracker/herald-trigger-detector.test.ts`: detector tests.
- Modify `packages/core/src/index.ts`: export Herald helpers and detector if needed by desktop.
- Modify `apps/desktop/src/main/deck-tracker.ts`: wire Herald trigger detector into PowerEvent handling.
- Modify `apps/desktop/src/main/deck-tracker.test.ts`: integration coverage for `TRIGGER` / `POWER` forwarding.
- Modify `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`: row hover line and header keyword chip.
- Modify `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx`: row hover/chip tests.
- Modify `apps/desktop/src/renderer/tests/OverlayView.test.tsx`: player overlay chip test.
- Modify `data/cards/schema/stateNeeded-vocabulary.md`: document `heraldCountThisGame`.

---

### Task 1: Convert hsdata Herald Metadata

**Files:**
- Modify: `packages/hearthdb/src/card-defs.ts`
- Modify: `scripts/convert-hsdata-cards.ts`
- Modify: `scripts/convert-hsdata-cards.test.ts`
- Create: `scripts/fixtures/hsdata-herald.xml`

- [ ] **Step 1: Create the Herald fixture**

Create `scripts/fixtures/hsdata-herald.xml` with this complete content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CardDefs build="245096">
  <Entity CardID="TEST_HERALD_CASTER" ID="900001" version="2">
    <Tag enumID="185" name="CARDNAME" type="LocString">
      <enUS>Herald Caster</enUS>
      <zhCN>兆示施放者</zhCN>
    </Tag>
    <Tag enumID="184" name="CARDTEXT" type="LocString">
      <enUS>&lt;b&gt;Battlecry:&lt;/b&gt; &lt;b&gt;Herald&lt;/b&gt; {0}.</enUS>
      <zhCN>&lt;b&gt;战吼：&lt;/b&gt;&lt;b&gt;兆示&lt;/b&gt;{0}。</zhCN>
    </Tag>
    <Tag enumID="48" name="COST" type="Int" value="2"/>
    <Tag enumID="183" name="CARD_SET" type="Int" value="1980"/>
    <Tag enumID="199" name="CLASS" type="Int" value="9"/>
    <Tag enumID="202" name="CARDTYPE" type="Int" value="4"/>
    <Tag enumID="203" name="RARITY" type="Int" value="3"/>
    <Tag enumID="218" name="BATTLECRY" type="Int" value="1"/>
    <Tag enumID="321" name="COLLECTIBLE" type="Int" value="1"/>
    <Tag enumID="4309" name="HERALD" type="Int" value="1"/>
  </Entity>
  <Entity CardID="TEST_HERALD_PAYOFF" ID="900002" version="2">
    <Tag enumID="185" name="CARDNAME" type="LocString">
      <enUS>Herald Payoff</enUS>
      <zhCN>兆示收益牌</zhCN>
    </Tag>
    <Tag enumID="184" name="CARDTEXT" type="LocString">
      <enUS>&lt;b&gt;Battlecry:&lt;/b&gt; If you Heralded twice, draw 2 cards.</enUS>
      <zhCN>&lt;b&gt;战吼：&lt;/b&gt;如果你已经兆示两次，抽两张牌。</zhCN>
    </Tag>
    <Tag enumID="48" name="COST" type="Int" value="5"/>
    <Tag enumID="183" name="CARD_SET" type="Int" value="1980"/>
    <Tag enumID="199" name="CLASS" type="Int" value="1"/>
    <Tag enumID="202" name="CARDTYPE" type="Int" value="4"/>
    <Tag enumID="203" name="RARITY" type="Int" value="5"/>
    <Tag enumID="321" name="COLLECTIBLE" type="Int" value="1"/>
    <ReferencedTag enumID="4309" name="HERALD" type="Int" value="1"/>
  </Entity>
</CardDefs>
```

- [ ] **Step 2: Write the failing converter test**

Append this test to `scripts/convert-hsdata-cards.test.ts`:

```ts
it('preserves Herald mechanics and referenced tags from hsdata XML', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hdt-hsdata-herald-'));
  const heraldXml = path.join(root, 'scripts/fixtures/hsdata-herald.xml');

  await convertHsdataCardsForTest(heraldXml, dir, {
    generatedAt: '2026-06-24T00:00:00.000Z',
    locales: ['enUS'],
  });

  const cards = JSON.parse(
    await readFile(path.join(dir, 'cards.collectible.enUS.json'), 'utf8'),
  ) as Array<{ id: string; mechanics?: string[]; referencedTags?: string[] }>;

  expect(cards.find((card) => card.id === 'TEST_HERALD_CASTER')?.mechanics).toContain('HERALD');
  expect(cards.find((card) => card.id === 'TEST_HERALD_PAYOFF')?.referencedTags).toContain('HERALD');
});
```

- [ ] **Step 3: Run the converter test to verify it fails**

Run:

```powershell
pnpm exec vitest run scripts/convert-hsdata-cards.test.ts --runInBand
```

Expected: FAIL because `referencedTags` is not emitted and `HERALD` is not in `mechanics`.

- [ ] **Step 4: Add `referencedTags` to `CardDef`**

In `packages/hearthdb/src/card-defs.ts`, extend `CardDef`:

```ts
  mechanics?: string[];
  referencedTags?: string[];
  collectible: boolean;
```

- [ ] **Step 5: Parse and emit Herald metadata**

In `scripts/convert-hsdata-cards.ts`:

1. Add `HERALD` to `MECHANIC_TAGS`.
2. Extend `RawEntity` with `referencedTags: Set<string>`.
3. Initialize it in the `Entity` branch.
4. Add an `opentag` branch for `ReferencedTag`.
5. Emit sorted `referencedTags` from `normalizeCard`.
6. Preserve it in `stableCard`.

Use these exact snippets:

```ts
  'HERALD',
```

```ts
  referencedTags: Set<string>;
```

```ts
currentEntity = {
  id,
  dbfId,
  loc: {},
  ints: {},
  raceValues: [],
  mechanics: new Set(),
  referencedTags: new Set(),
};
```

```ts
    if (node.name === 'ReferencedTag') {
      const tagName = attr(node, 'name') ?? '';
      if (tagName !== '') currentEntity.referencedTags.add(tagName);
      return;
    }
```

```ts
  if (entity.referencedTags.size > 0) card.referencedTags = [...entity.referencedTags].sort();
```

```ts
  if (card.referencedTags !== undefined) out.referencedTags = card.referencedTags;
```

- [ ] **Step 6: Run the converter test to verify it passes**

Run:

```powershell
pnpm exec vitest run scripts/convert-hsdata-cards.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Regenerate local card JSON**

Run:

```powershell
pnpm cards:convert
```

Expected: `Converted hsdata build 245096: 35037 cards, 7948 collectible -> data/cards/generated`.

- [ ] **Step 8: Commit converter work**

Run:

```powershell
git add packages/hearthdb/src/card-defs.ts scripts/convert-hsdata-cards.ts scripts/convert-hsdata-cards.test.ts scripts/fixtures/hsdata-herald.xml
git commit -m "feat(hearthdb): preserve Herald card metadata"
```

---

### Task 2: Add Shared Herald Helpers

**Files:**
- Create: `packages/core/src/tracker/herald.ts`
- Create: `packages/core/src/tracker/herald.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/tracker/extra-display-state.ts`

- [ ] **Step 1: Write helper tests**

Create `packages/core/src/tracker/herald.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  HERALD_COUNTER_KEY,
  heraldBlockTypeForTiming,
  heraldTriggerTiming,
  isHeraldRelatedCard,
  type HeraldCardMetadata,
} from './herald';

const card = (metadata: HeraldCardMetadata): HeraldCardMetadata => metadata;

describe('Herald helpers', () => {
  it('uses a stable counter key', () => {
    expect(HERALD_COUNTER_KEY).toBe('heraldCountThisGame');
  });

  it('recognizes Herald caster and payoff cards', () => {
    expect(isHeraldRelatedCard(card({ mechanics: ['HERALD'] }))).toBe(true);
    expect(isHeraldRelatedCard(card({ referencedTags: ['HERALD'] }))).toBe(true);
    expect(isHeraldRelatedCard(card({ mechanics: ['BATTLECRY'] }))).toBe(false);
  });

  it('classifies ordinary Herald cards as play-triggered', () => {
    expect(
      heraldTriggerTiming(card({
        type: 'MINION',
        mechanics: ['HERALD', 'BATTLECRY'],
        text: '<b>Battlecry:</b> <b>Herald</b> {0}.',
      })),
    ).toBe('play');
  });

  it('classifies Deathrattle Herald cards as trigger-triggered', () => {
    expect(
      heraldTriggerTiming(card({
        type: 'MINION',
        mechanics: ['HERALD', 'DEATHRATTLE'],
        text: '<b>Deathrattle:</b> <b>Herald</b> {0}.',
      })),
    ).toBe('trigger');
  });

  it('classifies Location Herald cards as power-triggered', () => {
    expect(
      heraldTriggerTiming(card({
        type: 'LOCATION',
        mechanics: ['HERALD'],
        text: '<b>Herald</b> {0}. Draw a card.',
      })),
    ).toBe('power');
  });

  it('maps non-play timing to Power.log block types', () => {
    expect(heraldBlockTypeForTiming('trigger')).toBe('TRIGGER');
    expect(heraldBlockTypeForTiming('power')).toBe('POWER');
  });
});
```

- [ ] **Step 2: Run helper tests to verify they fail**

Run:

```powershell
pnpm --filter @hdt/core test herald
```

Expected: FAIL because `packages/core/src/tracker/herald.ts` does not exist.

- [ ] **Step 3: Implement helper module**

Create `packages/core/src/tracker/herald.ts`:

```ts
export const HERALD_COUNTER_KEY = 'heraldCountThisGame';

export type HeraldTriggerTiming = 'play' | 'trigger' | 'power';

export interface HeraldCardMetadata {
  type?: string;
  mechanics?: readonly string[];
  referencedTags?: readonly string[];
  text?: string;
}

export function isHeraldCaster(metadata: HeraldCardMetadata | null | undefined): boolean {
  return hasToken(metadata?.mechanics, 'HERALD');
}

export function isHeraldPayoff(metadata: HeraldCardMetadata | null | undefined): boolean {
  return hasToken(metadata?.referencedTags, 'HERALD');
}

export function isHeraldRelatedCard(metadata: HeraldCardMetadata | null | undefined): boolean {
  return isHeraldCaster(metadata) || isHeraldPayoff(metadata);
}

export function heraldTriggerTiming(
  metadata: HeraldCardMetadata | null | undefined,
): HeraldTriggerTiming | null {
  if (!isHeraldCaster(metadata)) return null;
  if (normalize(metadata?.type) === 'LOCATION') return 'power';

  const text = stripMarkup(metadata?.text ?? '');
  if (/\bDeathrattle\s*:\s*.*\bHerald\b/i.test(text) || /亡语[：:]\s*.*兆示/.test(text)) {
    return 'trigger';
  }

  return 'play';
}

export function heraldBlockTypeForTiming(timing: Exclude<HeraldTriggerTiming, 'play'>): string {
  return timing === 'trigger' ? 'TRIGGER' : 'POWER';
}

function hasToken(values: readonly string[] | undefined, token: string): boolean {
  const expected = normalize(token);
  return (values ?? []).some((value) => normalize(value) === expected);
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function stripMarkup(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 4: Export helper symbols**

In `packages/core/src/index.ts`, add:

```ts
export {
  HERALD_COUNTER_KEY,
  heraldBlockTypeForTiming,
  heraldTriggerTiming,
  isHeraldCaster,
  isHeraldPayoff,
  isHeraldRelatedCard,
} from './tracker/herald';
export type { HeraldCardMetadata, HeraldTriggerTiming } from './tracker/herald';
```

- [ ] **Step 5: Extend extra-display metadata shape**

In `packages/core/src/tracker/extra-display-state.ts`, add:

```ts
  referencedTags?: readonly string[];
```

to `ExtraDisplayCardMetadata`.

- [ ] **Step 6: Run helper tests to verify they pass**

Run:

```powershell
pnpm --filter @hdt/core test herald
```

Expected: PASS.

- [ ] **Step 7: Commit helper work**

Run:

```powershell
git add packages/core/src/tracker/herald.ts packages/core/src/tracker/herald.test.ts packages/core/src/tracker/extra-display-state.ts packages/core/src/index.ts
git commit -m "feat(core): add Herald metadata helpers"
```

---

### Task 3: Count Local Herald Triggers In Extra Display State

**Files:**
- Modify: `packages/core/src/tracker/extra-display-state.ts`
- Modify: `packages/core/src/tracker/extra-display-state.test.ts`
- Modify: `packages/core/src/tracker/deck-tracker.ts`
- Modify: `packages/core/src/tracker/deck-tracker.test.ts`

- [ ] **Step 1: Write counter tests**

In `packages/core/src/tracker/extra-display-state.test.ts`, extend the local `lookup`:

```ts
  if (cardId === 'HERALD_BATTLECRY') {
    return {
      type: 'MINION',
      mechanics: ['HERALD', 'BATTLECRY'],
      text: '<b>Battlecry:</b> <b>Herald</b> {0}.',
    };
  }
  if (cardId === 'HERALD_DEATHRATTLE') {
    return {
      type: 'MINION',
      mechanics: ['HERALD', 'DEATHRATTLE'],
      text: '<b>Deathrattle:</b> <b>Herald</b> {0}.',
    };
  }
  if (cardId === 'HERALD_LOCATION') {
    return {
      type: 'LOCATION',
      mechanics: ['HERALD'],
      text: '<b>Herald</b> {0}. Draw a card.',
    };
  }
```

Add these tests:

```ts
it('counts play-timed Herald cards when the local player plays them', () => {
  const state = new MatchExtraDisplayState();

  state.recordCardPlayed({
    event: baseEvent('HERALD_BATTLECRY', 500),
    localControllerId: 1,
    cardLookup: lookup,
  });

  expect(state.snapshot().counters.heraldCountThisGame).toBe(1);
});

it('does not count deathrattle or location Herald cards on ordinary play', () => {
  const state = new MatchExtraDisplayState();

  state.recordCardPlayed({
    event: baseEvent('HERALD_DEATHRATTLE', 501),
    localControllerId: 1,
    cardLookup: lookup,
  });
  state.recordCardPlayed({
    event: baseEvent('HERALD_LOCATION', 502),
    localControllerId: 1,
    cardLookup: lookup,
  });

  expect(state.snapshot().counters.heraldCountThisGame ?? 0).toBe(0);
});

it('counts non-play Herald triggers when their block timing matches', () => {
  const state = new MatchExtraDisplayState();

  state.recordHeraldTriggered({
    cardId: 'HERALD_DEATHRATTLE',
    blockType: 'TRIGGER',
    isFriendly: true,
    cardLookup: lookup,
  });
  state.recordHeraldTriggered({
    cardId: 'HERALD_LOCATION',
    blockType: 'POWER',
    isFriendly: true,
    cardLookup: lookup,
  });

  expect(state.snapshot().counters.heraldCountThisGame).toBe(2);
});

it('ignores opponent Herald triggers for the local extra-display counter', () => {
  const state = new MatchExtraDisplayState();

  state.recordHeraldTriggered({
    cardId: 'HERALD_DEATHRATTLE',
    blockType: 'TRIGGER',
    isFriendly: false,
    cardLookup: lookup,
  });

  expect(state.snapshot().counters.heraldCountThisGame ?? 0).toBe(0);
});
```

- [ ] **Step 2: Run counter tests to verify they fail**

Run:

```powershell
pnpm --filter @hdt/core test extra-display-state
```

Expected: FAIL because `recordHeraldTriggered` and play-timed Herald counting do not exist.

- [ ] **Step 3: Implement state counting**

In `packages/core/src/tracker/extra-display-state.ts`, import helpers:

```ts
import { HERALD_COUNTER_KEY, heraldTriggerTiming } from './herald';
```

In `recordCardPlayed`, after metadata is resolved and before spell-only return logic, add:

```ts
    if (heraldTriggerTiming(metadata) === 'play') {
      this.increment(HERALD_COUNTER_KEY, 1);
    }
```

Add this public method to `MatchExtraDisplayState`:

```ts
  recordHeraldTriggered(args: {
    cardId: string;
    blockType: string;
    isFriendly: boolean;
    cardLookup: ExtraDisplayCardLookup | null;
  }): void {
    if (!args.isFriendly) return;
    const metadata = args.cardLookup?.(args.cardId) ?? { id: args.cardId };
    const timing = heraldTriggerTiming(metadata);
    const blockType = args.blockType.toUpperCase();
    if (timing === 'trigger' && blockType === 'TRIGGER') {
      this.increment(HERALD_COUNTER_KEY, 1);
    }
    if (timing === 'power' && blockType === 'POWER') {
      this.increment(HERALD_COUNTER_KEY, 1);
    }
  }
```

- [ ] **Step 4: Expose tracker API for non-PLAY Herald triggers**

In `packages/core/src/tracker/deck-tracker.ts`, add a public method near
`recordExtraDisplayEntityTag`:

```ts
  recordHeraldTriggered(args: { entityId: number; blockType: string }): void {
    const entity = this.game.entities.get(args.entityId);
    if (!entity) return;
    const historyController = this.resolveHistoryController(entity);
    if (historyController === null) return;
    this.extraDisplayState.recordHeraldTriggered({
      cardId: entity.cardId,
      blockType: args.blockType,
      isFriendly: historyController === this.game.localPlayer.controllerId,
      cardLookup: this.cardMetadataLookup,
    });
    this.currentSnapshot = this.buildSnapshot();
  }
```

- [ ] **Step 5: Add a DeckTracker API test**

In `packages/core/src/tracker/deck-tracker.test.ts`, add a test using the existing
`makeMirror()` helper in that file:

```ts
it('records non-play Herald triggers through entity ownership resolution', () => {
  const { mirror } = makeMirror();
  const tracker = new DeckTracker({
    mirror,
    cardMetadataLookup: (cardId) =>
      cardId === 'HERALD_DEATHRATTLE'
        ? {
            type: 'MINION',
            mechanics: ['HERALD', 'DEATHRATTLE'],
            text: '<b>Deathrattle:</b> <b>Herald</b> {0}.',
          }
        : null,
  });

  tracker.applyLocalControllerId(1);
  tracker.applyLogDerivedEntityUpdates([
    { entityId: 700, cardId: 'HERALD_DEATHRATTLE', zone: 'GRAVEYARD', controllerId: 1 },
  ]);
  tracker.recordHeraldTriggered({ entityId: 700, blockType: 'TRIGGER' });

  expect(tracker.getSnapshot().extraDisplay?.counters.heraldCountThisGame).toBe(1);
});
```

Keep the assertion and event sequence unchanged; this test proves the new
`recordHeraldTriggered()` API resolves entity ownership through existing tracker
state rather than trusting the detector blindly.

- [ ] **Step 6: Run core tracker tests**

Run:

```powershell
pnpm --filter @hdt/core test extra-display-state deck-tracker
```

Expected: PASS.

- [ ] **Step 7: Commit counter work**

Run:

```powershell
git add packages/core/src/tracker/extra-display-state.ts packages/core/src/tracker/extra-display-state.test.ts packages/core/src/tracker/deck-tracker.ts packages/core/src/tracker/deck-tracker.test.ts
git commit -m "feat(core): track Herald trigger count"
```

---

### Task 4: Detect Non-PLAY Herald Blocks From Power.log

**Files:**
- Create: `packages/core/src/tracker/herald-trigger-detector.ts`
- Create: `packages/core/src/tracker/herald-trigger-detector.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/desktop/src/main/deck-tracker.ts`
- Modify: `apps/desktop/src/main/deck-tracker.test.ts`

- [ ] **Step 1: Write detector tests**

Create `packages/core/src/tracker/herald-trigger-detector.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { HeraldTriggerDetector } from './herald-trigger-detector';

const empty = { raw: '', content: '' } as const;

describe('HeraldTriggerDetector', () => {
  it('emits entity ids for TRIGGER and POWER block starts', () => {
    const emit = vi.fn();
    const det = new HeraldTriggerDetector({ emit, clock: () => 1000 });

    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });
    det.handle({ type: 'block-start', blockType: 'POWER', entity: '[entityName=Shrine id=11 cardId=CATA_492 player=1]', effectCardId: '', target: null, subOption: null, ...empty });

    expect(emit).toHaveBeenCalledWith({ entityId: 10, blockType: 'TRIGGER' });
    expect(emit).toHaveBeenCalledWith({ entityId: 11, blockType: 'POWER' });
  });

  it('ignores PLAY blocks because CardPlayedDetector owns those', () => {
    const emit = vi.fn();
    const det = new HeraldTriggerDetector({ emit });

    det.handle({ type: 'block-start', blockType: 'PLAY', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });

    expect(emit).not.toHaveBeenCalled();
  });

  it('suppresses duplicate same-entity same-block events within the replay window', () => {
    const emit = vi.fn();
    let now = 1000;
    const det = new HeraldTriggerDetector({ emit, clock: () => now });

    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });
    now += 1500;
    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });
    now += 5000;
    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });

    expect(emit).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run detector tests to verify they fail**

Run:

```powershell
pnpm --filter @hdt/core test herald-trigger-detector
```

Expected: FAIL because `HeraldTriggerDetector` does not exist.

- [ ] **Step 3: Implement detector**

Create `packages/core/src/tracker/herald-trigger-detector.ts`:

```ts
import type { PowerEvent } from '@hdt/hearthwatcher';

const REFIRE_SUPPRESS_MS = 3000;
const HERALD_BLOCK_TYPES = new Set(['TRIGGER', 'POWER']);

export interface HeraldTriggerEvent {
  entityId: number;
  blockType: string;
}

export class HeraldTriggerDetector {
  private readonly lastFiredAt = new Map<string, number>();
  private readonly emit: (event: HeraldTriggerEvent) => void;
  private readonly clock: () => number;

  constructor(args: {
    emit: (event: HeraldTriggerEvent) => void;
    clock?: () => number;
  }) {
    this.emit = args.emit;
    this.clock = args.clock ?? (() => Date.now());
  }

  reset(): void {
    this.lastFiredAt.clear();
  }

  handle(event: PowerEvent): void {
    if (event.type !== 'block-start') return;
    const blockType = event.blockType.toUpperCase();
    if (!HERALD_BLOCK_TYPES.has(blockType)) return;
    const entityId = entityIdOf(event.entity);
    if (entityId === null) return;

    const now = this.clock();
    const key = `${entityId}:${blockType}`;
    const previous = this.lastFiredAt.get(key);
    if (previous !== undefined && now - previous < REFIRE_SUPPRESS_MS) return;

    this.lastFiredAt.set(key, now);
    this.emit({ entityId, blockType });
  }
}

function entityIdOf(ref: number | string | null | undefined): number | null {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') {
    const match = /\bid=(\d+)/i.exec(ref);
    if (match) return Number(match[1]);
  }
  return null;
}
```

- [ ] **Step 4: Export detector**

In `packages/core/src/index.ts`, add:

```ts
export { HeraldTriggerDetector } from './tracker/herald-trigger-detector';
export type { HeraldTriggerEvent } from './tracker/herald-trigger-detector';
```

- [ ] **Step 5: Wire detector into desktop main**

In `apps/desktop/src/main/deck-tracker.ts`:

1. Add `HeraldTriggerDetector` to the `@hdt/core` import.
2. Add module state:

```ts
let heraldTriggerDetector: HeraldTriggerDetector | null = null;
```

3. Initialize it beside `CardPlayedDetector`:

```ts
  heraldTriggerDetector = new HeraldTriggerDetector({
    emit: (event) => tracker?.recordHeraldTriggered(event),
  });
```

4. Reset it wherever `cardPlayedDetector?.reset()` is reset:

```ts
  heraldTriggerDetector?.reset();
```

5. In the PowerEvent handling flow, call it after log-derived entity updates and
before generic tag updates:

```ts
  heraldTriggerDetector?.handle(event);
```

- [ ] **Step 6: Add desktop wiring test**

In `apps/desktop/src/main/deck-tracker.test.ts`, add a mocked detector test near
the existing `CardPlayedDetector` wiring tests:

1. Extend the hoisted `tracker` mock with:

```ts
recordHeraldTriggered: vi.fn(),
```

2. Add a hoisted detector mock and emitter capture:

```ts
type HeraldTriggerEvent = { entityId: number; blockType: 'TRIGGER' | 'POWER' };
let heraldTriggerEmit: ((event: HeraldTriggerEvent) => void) | null = null;
const heraldTriggerDetector = {
  handle: vi.fn(),
  reset: vi.fn(),
};
```

Return `heraldTriggerDetector` plus:

```ts
setHeraldTriggerEmit: (emit: (event: HeraldTriggerEvent) => void) => {
  heraldTriggerEmit = emit;
},
getHeraldTriggerEmit: () => heraldTriggerEmit,
```

3. Extend the `@hdt/core` mock:

```ts
HeraldTriggerDetector: vi.fn().mockImplementation((args: {
  emit: (event: HeraldTriggerEvent) => void;
}) => {
  mocks.setHeraldTriggerEmit(args.emit);
  return mocks.heraldTriggerDetector;
}),
```

4. Add the test:

```ts
it('forwards Herald trigger detector events to the tracker', async () => {
  const { forwardPowerEventToDeckTracker, startDeckTracker } = await import('./deck-tracker');
  startDeckTracker(mocks.deckStore as never);

  const event = {
    type: 'block-start',
    blockType: 'TRIGGER',
    entity: '[entityName=Herald Minion id=22 zone=PLAY cardId=CATA_158 player=1]',
    effectCardId: '',
    raw: '',
    content: '',
  };
  forwardPowerEventToDeckTracker(event as never, 'replay');

  expect(mocks.heraldTriggerDetector.handle).toHaveBeenCalledWith(event);

  mocks.getHeraldTriggerEmit()?.({ entityId: 22, blockType: 'TRIGGER' });

  expect(mocks.tracker.recordHeraldTriggered).toHaveBeenCalledWith({
    entityId: 22,
    blockType: 'TRIGGER',
  });
});
```

- [ ] **Step 7: Run detector and desktop tests**

Run:

```powershell
pnpm --filter @hdt/core test herald-trigger-detector
pnpm --filter @hdt/desktop test deck-tracker
```

Expected: PASS.

- [ ] **Step 8: Commit Power.log wiring**

Run:

```powershell
git add packages/core/src/tracker/herald-trigger-detector.ts packages/core/src/tracker/herald-trigger-detector.test.ts packages/core/src/index.ts apps/desktop/src/main/deck-tracker.ts apps/desktop/src/main/deck-tracker.test.ts
git commit -m "feat(desktop): detect Herald trigger blocks"
```

---

### Task 5: Render Herald Count In LiveDeckPanel Rows And Header

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`
- Modify: `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx`

- [ ] **Step 1: Add test card definitions**

In `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx`, extend the local
`CARD_DEFS` value type with:

```ts
mechanics?: string[];
referencedTags?: string[];
text?: string;
```

Return those fields from both mocked card-def lookups when present:

```ts
...(def.mechanics ? { mechanics: def.mechanics } : {}),
...(def.referencedTags ? { referencedTags: def.referencedTags } : {}),
...(def.text ? { text: def.text } : {}),
```

Then extend the card-def mock map with:

```ts
  CATA_497: {
    name: '奥卓克希昂',
    cost: 6,
    rarity: 'LEGENDARY',
    type: 'MINION',
    mechanics: ['HERALD', 'BATTLECRY'],
    text: '<b>战吼：</b><b>兆示</b>{0}。',
  },
  CATA_190h: {
    name: '灭世者死亡之翼',
    cost: 10,
    rarity: 'LEGENDARY',
    type: 'HERO',
    referencedTags: ['HERALD'],
    text: '<b>战吼：</b>选择并释放{0}项灾变！<i><b>兆示</b>两次后升级。</i>',
  },
```

- [ ] **Step 2: Write row hover and header chip tests**

Add these tests to the existing `describe('LiveDeckPanel hover', () => { ... })`
block:

```ts
it('shows the Herald count on Herald caster card previews', () => {
  const snap = makeSnapshot({
    original: [{ cardId: 'CATA_497', count: 1 }],
    extraDisplay: {
      counters: { heraldCountThisGame: 2 },
      pools: {
        friendlyDeadDemonsThisGameUnique: [],
        friendlyDeadMinionsThisGameUnique: [],
      },
      friendlyBoard: [],
    },
  });
  useDeckTrackerStore.setState({ snapshot: snap });

  render(<LiveDeckPanel />);
  const row = screen.getAllByTestId('card-copy-row')[0]!;
  expect(row).toHaveAttribute('data-extra-preview', 'extra');
  fireEvent.mouseEnter(row);
  act(() => {
    vi.advanceTimersByTime(300);
  });

  const call = cardPreviewShowEnhancedExtra.mock.calls.at(-1)!;
  expect(call[0]).toBe('CATA_497');
  expect(call[1]).toEqual({
    title: '奥卓克希昂',
    lines: ['本局已兆示：2 次'],
  });
});

it('shows the Herald count on Herald payoff card previews', () => {
  const snap = makeSnapshot({
    original: [{ cardId: 'CATA_190h', count: 1 }],
    extraDisplay: {
      counters: { heraldCountThisGame: 1 },
      pools: {
        friendlyDeadDemonsThisGameUnique: [],
        friendlyDeadMinionsThisGameUnique: [],
      },
      friendlyBoard: [],
    },
  });
  useDeckTrackerStore.setState({ snapshot: snap });

  render(<LiveDeckPanel />);
  const row = screen.getAllByTestId('card-copy-row')[0]!;
  fireEvent.mouseEnter(row);
  act(() => {
    vi.advanceTimersByTime(300);
  });

  const call = cardPreviewShowEnhancedExtra.mock.calls.at(-1)!;
  expect(call[0]).toBe('CATA_190h');
  expect(call[1]).toEqual({
    title: '灭世者死亡之翼',
    lines: ['本局已兆示：1 次'],
  });
});

it('renders a compact Herald chip in the deck panel header', () => {
  const snap = makeSnapshot({
    original: [{ cardId: 'CATA_497', count: 1 }],
    extraDisplay: {
      counters: { heraldCountThisGame: 3 },
      pools: {
        friendlyDeadDemonsThisGameUnique: [],
        friendlyDeadMinionsThisGameUnique: [],
      },
      friendlyBoard: [],
    },
  });
  useDeckTrackerStore.setState({ snapshot: snap });

  render(<LiveDeckPanel />);

  expect(screen.getByTestId('herald-counter-chip')).toHaveTextContent('兆示 3');
});
```

- [ ] **Step 3: Run LiveDeckPanel tests to verify they fail**

Run:

```powershell
pnpm --filter @hdt/desktop test LiveDeckPanel
```

Expected: FAIL because no Herald row line or header chip exists.

- [ ] **Step 4: Implement row hover line**

In `LiveDeckPanel.tsx`, import:

```ts
  HERALD_COUNTER_KEY,
  isHeraldRelatedCard,
```

from `@hdt/core`.

Inside `buildRowExtraDisplay`, before `const emptyPoolWarning =`, add:

```ts
  if (isHeraldRelatedCard(def)) {
    const heraldCount = Number(extraDisplay?.counters?.[HERALD_COUNTER_KEY] ?? 0);
    extraLines.push(`本局已兆示：${heraldCount} 次`);
  }
```

- [ ] **Step 5: Implement header chip**

Add this helper near other small render helpers in `LiveDeckPanel.tsx`:

```tsx
function KeywordCounterStrip({
  heraldCount,
  showHerald,
}: {
  heraldCount: number;
  showHerald: boolean;
}) {
  if (!showHerald) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-testid="keyword-counter-strip">
      <span
        data-testid="herald-counter-chip"
        className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent"
        title="本局已兆示次数"
      >
        <span>兆示</span>
        <span className="font-mono tabular-nums">{heraldCount}</span>
      </span>
    </div>
  );
}
```

In the main deck panel component body, compute:

```ts
  const heraldCount = Number(snapshot.extraDisplay?.counters?.[HERALD_COUNTER_KEY] ?? 0);
  const hasHeraldContext = allVisibleCardIds.some((cardId) => isHeraldRelatedCard(cardDefs.get(cardId))) ||
    (snapshot.extraDisplay?.friendlyBoard ?? []).some((record) => isHeraldRelatedCard(cardDefs.get(record.cardId))) ||
    heraldCount > 0;
```

Render it under `BoardAttackSummary`:

```tsx
        <KeywordCounterStrip heraldCount={heraldCount} showHerald={hasHeraldContext} />
```

- [ ] **Step 6: Run LiveDeckPanel tests to verify they pass**

Run:

```powershell
pnpm --filter @hdt/desktop test LiveDeckPanel
```

Expected: PASS.

- [ ] **Step 7: Commit LiveDeckPanel display work**

Run:

```powershell
git add apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx
git commit -m "feat(renderer): show Herald count on deck cards"
```

---

### Task 6: Verify Player Overlay Displays Herald Count

**Files:**
- Modify: `apps/desktop/src/renderer/tests/OverlayView.test.tsx`

- [ ] **Step 1: Write overlay test**

In `OverlayView.test.tsx`:

1. Extend the local `CARD_DEFS` value type with:

```ts
mechanics?: string[];
referencedTags?: string[];
text?: string;
```

2. Add:

```ts
CATA_497: {
  name: '奥卓克希昂',
  cost: 6,
  rarity: 'LEGENDARY',
  mechanics: ['HERALD', 'BATTLECRY'],
  text: '<b>战吼：</b><b>兆示</b>{0}。',
},
```

3. Return `mechanics`, `referencedTags`, and `text` from both mocked card-def
lookups when present.

4. Change `makeSnapshot()` to accept these optional overrides:

```ts
function makeSnapshot(overrides: {
  deck?: DeckTrackerSnapshot['deck'];
  friendlyHand?: string[];
  friendlyHandExtras?: boolean[];
  extraDisplay?: DeckTrackerSnapshot['extraDisplay'];
} = {}): DeckTrackerSnapshot
```

Inside the returned snapshot, replace the current hard-coded values with:

```ts
deck: overrides.deck ?? {
  id: 1,
  name: 'Test Deck',
  original: [{ cardId: 'CS2_029', count: 2 }],
  remaining: [{ cardId: 'CS2_029', count: 2 }],
  extraRemaining: [],
  extras: [],
  knownPositions: [],
},
friendlyHand: overrides.friendlyHand ?? [],
friendlyHandExtras: overrides.friendlyHandExtras ?? [],
extraDisplay: overrides.extraDisplay,
```

5. Add this test:

```ts
it('shows Herald counters in the player overlay deck tab', () => {
  const snap = makeSnapshot({
    deck: {
      id: 1,
      name: 'Herald Test',
      original: [{ cardId: 'CATA_497', count: 1 }],
      remaining: [{ cardId: 'CATA_497', count: 1 }],
      extraRemaining: [],
      extras: [],
      knownPositions: [],
    },
    extraDisplay: {
      counters: { heraldCountThisGame: 2 },
      pools: {
        friendlyDeadDemonsThisGameUnique: [],
        friendlyDeadMinionsThisGameUnique: [],
      },
      friendlyBoard: [],
    },
  });
  useDeckTrackerStore.setState({ snapshot: snap });

  render(<OverlayView />);

  expect(screen.getByTestId('herald-counter-chip')).toHaveTextContent('兆示 2');
});
```

- [ ] **Step 2: Run overlay test after Task 5**

Run:

```powershell
pnpm --filter @hdt/desktop test OverlayView
```

Expected after Task 5: PASS.

- [ ] **Step 3: Commit overlay coverage**

Run:

```powershell
git add apps/desktop/src/renderer/tests/OverlayView.test.tsx
git commit -m "test(renderer): cover Herald count in player overlay"
```

---

### Task 7: Document State Key And Run Full Verification

**Files:**
- Modify: `data/cards/schema/stateNeeded-vocabulary.md`

- [ ] **Step 1: Document the counter key**

In `data/cards/schema/stateNeeded-vocabulary.md`, add this row under Shared
Counters after `heroPowerImbueCountThisGame`:

```md
| `heraldCountThisGame` | Times the player has triggered Herald / 兆示 this game. |
```

- [ ] **Step 2: Run focused verification**

Run:

```powershell
pnpm exec vitest run scripts/convert-hsdata-cards.test.ts --runInBand
pnpm --filter @hdt/core test herald herald-trigger-detector extra-display-state deck-tracker
pnpm --filter @hdt/desktop test LiveDeckPanel OverlayView deck-tracker
pnpm cards:convert
```

Expected:

- Converter tests pass.
- Core Herald, state, detector, and deck tracker tests pass.
- Desktop LiveDeckPanel, OverlayView, and deck-tracker wiring tests pass.
- `pnpm cards:convert` reports build `245096`.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Inspect generated Herald metadata**

Run:

```powershell
node -e "const fs=require('fs'); const cards=JSON.parse(fs.readFileSync('data/cards/generated/cards.collectible.enUS.json','utf8')); console.log(cards.filter(c => (c.mechanics||[]).includes('HERALD')).map(c=>c.id).sort().join(',')); console.log(cards.filter(c => (c.referencedTags||[]).includes('HERALD')).map(c=>c.id).sort().join(','));"
```

Expected first line includes:

```text
CATA_156,CATA_158,CATA_160,CATA_492,CATA_497,CATA_525,CATA_530,CATA_561,CATA_565,CATA_580,CATA_722,CATA_725,CATA_780,CATA_785
```

Expected second line includes:

```text
CATA_150,CATA_151,CATA_153,CATA_154,CATA_155,CATA_190h,CATA_726
```

- [ ] **Step 5: Commit docs and final verification updates**

Run:

```powershell
git add data/cards/schema/stateNeeded-vocabulary.md
git commit -m "docs(cards): document Herald tracking state"
```

---

## Self-Review Notes

- Spec coverage: metadata conversion, local trigger counting, row display,
  player overlay display, and verification commands are each represented by at
  least one task.
- Scope: opponent Herald tracking remains excluded by design.
- Risk handling: non-PLAY triggers are isolated in `HeraldTriggerDetector`, and
  card timing is centralized in `tracker/herald.ts`.
- Type consistency: the plan uses `heraldCountThisGame`, `referencedTags`,
  `recordHeraldTriggered`, and `HeraldTriggerDetector` consistently across tasks.

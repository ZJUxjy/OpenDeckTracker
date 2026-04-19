> 实施约定：Conventional Commits（`feat(hearthdb):` / `feat(desktop):` / `chore:` / `docs:` / `test:` / `build:` / `ci:`）。TDD 优先：codec 与 search 类逻辑先写失败测试。
> 工作目录默认 `D:\code\HDT_js`。

## 1. 创建 `@hdt/hearthdb` 包骨架

- [ ] 1.1 创建目录 `packages/hearthdb/src/{deckstring,tests/fixtures}`。
- [ ] 1.2 创建 `packages/hearthdb/package.json`：

  ```json
  {
    "name": "@hdt/hearthdb",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "exports": { ".": "./src/index.ts" },
    "scripts": {
      "typecheck": "tsc -p tsconfig.json --noEmit",
      "test": "vitest run"
    }
  }
  ```

- [ ] 1.3 创建 `packages/hearthdb/tsconfig.json`：

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "include": ["src/**/*", "vitest.config.ts"]
  }
  ```

- [ ] 1.4 创建 `packages/hearthdb/vitest.config.ts`：

  ```ts
  import { defineConfig } from 'vitest/config';
  export default defineConfig({
    test: { name: 'hearthdb', environment: 'node', globals: true, include: ['src/**/*.test.ts'] },
  });
  ```

- [ ] 1.5 把 `tsconfig.base.json` 的 `paths` 加上 `@hdt/hearthdb`：

  ```json
  "paths": {
    "@hdt/shared": ["./packages/shared/src/index.ts"],
    "@hdt/hearthdb": ["./packages/hearthdb/src/index.ts"]
  }
  ```

- [ ] 1.6 commit：`git add packages/hearthdb tsconfig.base.json && git commit -m "build(hearthdb): scaffold @hdt/hearthdb package"`。

## 2. 类型与枚举

- [ ] 2.1 创建 `packages/hearthdb/src/card-defs.ts`，定义 `CardClass` / `Rarity` / `CardType` 字符串字面量联合类型 + `CardDef` interface（按 design D4）。完整字段见 design.md。
- [ ] 2.2 创建 `packages/hearthdb/src/deckstring/types.ts`：

  ```ts
  export const DeckFormat = {
    Wild: 1,
    Standard: 2,
    Classic: 3,
    Twist: 4,
  } as const;
  export type DeckFormat = (typeof DeckFormat)[keyof typeof DeckFormat];

  export interface DeckBlueprint {
    format: DeckFormat;
    heroes: number[];
    cards: Array<{ dbfId: number; count: number }>;
  }
  ```

- [ ] 2.3 创建 `packages/hearthdb/src/index.ts` 暴露 `CardDef` / `CardClass` / `Rarity` / `CardType` / `DeckFormat` / `DeckBlueprint`（其余后续任务追加）。
- [ ] 2.4 commit：`git add packages/hearthdb && git commit -m "feat(hearthdb): add CardDef and DeckBlueprint types"`。

## 3. Varint（TDD）

- [ ] 3.1 创建 `packages/hearthdb/src/deckstring/varint.test.ts`，按 spec `deck-codec § Varint 工具`：

  ```ts
  import { describe, it, expect } from 'vitest';
  import { readVarint, writeVarint } from './varint';

  describe('varint', () => {
    const cases = [0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 268435455, 268435456, 4294967295];
    for (const v of cases) {
      it(`round-trips ${v}`, () => {
        const buf: number[] = [];
        writeVarint(buf, v);
        const [out, len] = readVarint(Buffer.from(buf), 0);
        expect(out).toBe(v);
        expect(len).toBe(buf.length);
      });
    }
    it('throws on negative', () => {
      expect(() => writeVarint([], -1)).toThrow(/unsigned/i);
    });
  });
  ```

- [ ] 3.2 跑 `pnpm --filter @hdt/hearthdb test`，期望 FAIL（缺 `./varint`）。
- [ ] 3.3 创建 `packages/hearthdb/src/deckstring/varint.ts`：

  ```ts
  export function writeVarint(out: number[], value: number): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`writeVarint requires unsigned integer, got ${value}`);
    }
    let v = value;
    while (v >= 0x80) {
      out.push((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    out.push(v);
  }

  export function readVarint(buf: Buffer, offset: number): [value: number, bytesRead: number] {
    let result = 0;
    let shift = 0;
    let i = 0;
    while (true) {
      if (offset + i >= buf.length) throw new Error('varint: unexpected end of buffer');
      const byte = buf[offset + i]!;
      result += (byte & 0x7f) * 2 ** shift;
      i++;
      if ((byte & 0x80) === 0) return [result, i];
      shift += 7;
      if (shift >= 35) throw new Error('varint: overflow (too many continuation bytes)');
    }
  }
  ```

- [ ] 3.4 重跑 test，期望全 pass。
- [ ] 3.5 commit：`git add packages/hearthdb && git commit -m "feat(hearthdb): implement unsigned LEB128 varint codec"`。

## 4. Deckstring fixture（手动准备）

- [ ] 4.1 创建 `packages/hearthdb/src/tests/fixtures/known-decks.json`，包含至少 3 个真实 deckstring + expected blueprint。我可以从 HearthSim python-hearthstone 的测试 fixture 借（公开 MIT 数据）：

  ```json
  [
    {
      "name": "Empty deck (Standard / Hero=Garrosh)",
      "deckstring": "AAECAQcAAA==",
      "expected": {
        "format": 2,
        "heroes": [7],
        "cards": []
      }
    },
    {
      "name": "Single 1-copy card (dbfId=2 / hero=7)",
      "deckstring": "AAECAQcBAgAAAA==",
      "expected": {
        "format": 2,
        "heroes": [7],
        "cards": [{ "dbfId": 2, "count": 1 }]
      }
    }
  ]
  ```

  > 注：上述 deckstring 是手动按规范构造的最小例子；实施时用 Python `python-hearthstone` 工具或现有 HDT 验证可对照。
  > 真实游戏内卡组（30 张）在 task 4.2 跑完 codec 后用 round-trip 反推。

- [ ] 4.2 创建 `packages/hearthdb/src/tests/fixtures/tiny-cards.json`，10 张迷你卡牌库（手写 JSON，含各 cardClass / rarity / type / cost 范围 / 1 个含 mechanics）。

## 5. Deckstring decoder（TDD）

- [ ] 5.1 创建 `packages/hearthdb/src/deckstring/decoder.test.ts`：

  ```ts
  import { describe, it, expect } from 'vitest';
  import { decodeDeck } from './decoder';
  import known from '../tests/fixtures/known-decks.json' with { type: 'json' };

  describe('decodeDeck', () => {
    for (const fx of known) {
      it(`decodes "${fx.name}"`, () => {
        const got = decodeDeck(fx.deckstring);
        expect(got).toEqual(fx.expected);
      });
    }
    it('rejects empty string', () => expect(() => decodeDeck('')).toThrow());
    it('rejects garbage', () => expect(() => decodeDeck('not!base64@')).toThrow());
    it('rejects wrong reserved byte', () => {
      const bad = Buffer.from([0x42, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00]).toString('base64');
      expect(() => decodeDeck(bad)).toThrow(/reserved byte/i);
    });
  });
  ```

- [ ] 5.2 跑 test FAIL。
- [ ] 5.3 创建 `packages/hearthdb/src/deckstring/decoder.ts`：

  ```ts
  import { readVarint } from './varint';
  import type { DeckBlueprint, DeckFormat } from './types';

  export function decodeDeck(deckstring: string): DeckBlueprint {
    if (!deckstring) throw new Error('decodeDeck: empty input');
    let buf: Buffer;
    try {
      buf = Buffer.from(deckstring, 'base64');
    } catch {
      throw new Error('decodeDeck: invalid base64');
    }
    if (buf.length < 4) throw new Error('decodeDeck: too short');
    if (buf[0] !== 0x00) throw new Error('decodeDeck: reserved byte must be 0x00');
    if (buf[1] !== 0x01) throw new Error(`decodeDeck: unsupported version ${buf[1]}`);

    let off = 2;
    const [format, fmtLen] = readVarint(buf, off);
    off += fmtLen;

    const readArray = (): number[] => {
      const [count, lenA] = readVarint(buf, off);
      off += lenA;
      const arr: number[] = [];
      for (let i = 0; i < count; i++) {
        const [v, lenB] = readVarint(buf, off);
        off += lenB;
        arr.push(v);
      }
      return arr;
    };

    const heroes = readArray();
    const oneCopy = readArray();
    const twoCopy = readArray();

    const [nCount, lenN] = readVarint(buf, off);
    off += lenN;
    const nCopy: Array<{ dbfId: number; count: number }> = [];
    for (let i = 0; i < nCount; i++) {
      const [dbfId, lenA] = readVarint(buf, off);
      off += lenA;
      const [count, lenB] = readVarint(buf, off);
      off += lenB;
      nCopy.push({ dbfId, count });
    }

    const cards = [
      ...oneCopy.map((dbfId) => ({ dbfId, count: 1 })),
      ...twoCopy.map((dbfId) => ({ dbfId, count: 2 })),
      ...nCopy,
    ];

    return { format: format as DeckFormat, heroes, cards };
  }
  ```

- [ ] 5.4 重跑 test：全 pass。
- [ ] 5.5 commit：`git add packages/hearthdb && git commit -m "feat(hearthdb): implement deckstring decoder"`。

## 6. Deckstring encoder（TDD）

- [ ] 6.1 创建 `packages/hearthdb/src/deckstring/encoder.test.ts`：

  ```ts
  import { describe, it, expect } from 'vitest';
  import { encodeDeck } from './encoder';
  import { decodeDeck } from './decoder';
  import { DeckFormat } from './types';
  import known from '../tests/fixtures/known-decks.json' with { type: 'json' };

  describe('encodeDeck', () => {
    it('encodes empty deck deterministically', () => {
      const a = encodeDeck({ format: DeckFormat.Standard, heroes: [7], cards: [] });
      const b = encodeDeck({ format: DeckFormat.Standard, heroes: [7], cards: [] });
      expect(a).toBe(b);
    });

    it('throws on count <= 0', () => {
      expect(() =>
        encodeDeck({ format: 2, heroes: [7], cards: [{ dbfId: 1, count: 0 }] }),
      ).toThrow(/positive/i);
    });

    for (const fx of known) {
      it(`round-trips "${fx.name}"`, () => {
        const got = encodeDeck(fx.expected as never);
        expect(decodeDeck(got)).toEqual(fx.expected);
      });
    }
  });
  ```

- [ ] 6.2 跑 test FAIL。
- [ ] 6.3 创建 `packages/hearthdb/src/deckstring/encoder.ts`：

  ```ts
  import { writeVarint } from './varint';
  import type { DeckBlueprint } from './types';

  export function encodeDeck(blueprint: DeckBlueprint): string {
    const out: number[] = [0x00, 0x01];
    writeVarint(out, blueprint.format);

    const writeArray = (arr: number[]): void => {
      writeVarint(out, arr.length);
      for (const v of arr) writeVarint(out, v);
    };

    writeArray([...blueprint.heroes]);

    const oneCopy: number[] = [];
    const twoCopy: number[] = [];
    const nCopy: Array<{ dbfId: number; count: number }> = [];
    for (const c of blueprint.cards) {
      if (!Number.isInteger(c.count) || c.count <= 0) {
        throw new Error(`encodeDeck: card count must be positive, got ${c.count}`);
      }
      if (c.count === 1) oneCopy.push(c.dbfId);
      else if (c.count === 2) twoCopy.push(c.dbfId);
      else nCopy.push({ ...c });
    }
    oneCopy.sort((a, b) => a - b);
    twoCopy.sort((a, b) => a - b);
    nCopy.sort((a, b) => a.dbfId - b.dbfId);

    writeArray(oneCopy);
    writeArray(twoCopy);
    writeVarint(out, nCopy.length);
    for (const { dbfId, count } of nCopy) {
      writeVarint(out, dbfId);
      writeVarint(out, count);
    }

    return Buffer.from(out).toString('base64');
  }
  ```

- [ ] 6.4 跑 test：全 pass。
- [ ] 6.5 在 `packages/hearthdb/src/deckstring/index.ts` barrel：`export { encodeDeck } from './encoder'; export { decodeDeck } from './decoder'; export * from './types';`
- [ ] 6.6 在 `packages/hearthdb/src/index.ts` 加 `export * from './deckstring';`
- [ ] 6.7 commit：`git add packages/hearthdb && git commit -m "feat(hearthdb): implement deckstring encoder with canonical sort"`。

## 7. CardDb loader + 索引（TDD）

- [ ] 7.1 创建 `packages/hearthdb/src/card-loader.test.ts`：

  ```ts
  import { describe, it, expect } from 'vitest';
  import { loadCards } from './card-loader';
  import path from 'node:path';

  const tinyPath = path.resolve(__dirname, 'tests/fixtures/tiny-cards.json');

  describe('loadCards', () => {
    it('builds dbfId and id indices', async () => {
      const db = await loadCards(tinyPath);
      expect(db.size).toBeGreaterThan(0);
      const card = db.findByDbfId(/* 用 fixture 里的真实 dbfId */ 1);
      expect(card).toBeDefined();
      const sameCard = db.findById(card!.id);
      expect(sameCard).toBe(card);
    });

    it('throws on missing file', async () => {
      await expect(loadCards('/nonexistent.json')).rejects.toThrow(/ENOENT|no such file/i);
    });

    it('throws on broken JSON', async () => {
      const broken = path.resolve(__dirname, 'tests/fixtures/broken.json');
      // 确保 fixture 存在且内容是 "{not json"
      await expect(loadCards(broken)).rejects.toThrow(/JSON|parse/i);
    });
  });
  ```

  > 创建 `packages/hearthdb/src/tests/fixtures/broken.json`，内容只一行：`{not json`
  > 调整 tiny-cards.json 让其中至少一张卡 dbfId === 1。

- [ ] 7.2 创建 `packages/hearthdb/src/card-db.ts`：

  ```ts
  import type { CardDef } from './card-defs';
  import { type SearchFilter, matches } from './card-search';

  export class CardDb {
    private byDbfId = new Map<number, CardDef>();
    private byId = new Map<string, CardDef>();

    constructor(cards: readonly CardDef[]) {
      for (const c of cards) {
        if (c.dbfId != null) this.byDbfId.set(c.dbfId, c);
        if (c.id) this.byId.set(c.id, c);
      }
    }

    get size(): number {
      return this.byDbfId.size;
    }

    findByDbfId(dbfId: number): CardDef | undefined {
      return this.byDbfId.get(dbfId);
    }

    findById(id: string): CardDef | undefined {
      return this.byId.get(id);
    }

    search(filter: SearchFilter): CardDef[] {
      const limit = filter.limit ?? 50;
      const offset = filter.offset ?? 0;
      const out: CardDef[] = [];
      let i = 0;
      for (const c of this.byDbfId.values()) {
        if (!matches(c, filter)) continue;
        if (i >= offset && out.length < limit) out.push(c);
        i++;
        if (out.length >= limit) break;
      }
      return out;
    }
  }
  ```

- [ ] 7.3 创建 `packages/hearthdb/src/card-loader.ts`：

  ```ts
  import fs from 'node:fs/promises';
  import { CardDb } from './card-db';
  import type { CardDef } from './card-defs';

  export async function loadCards(jsonPath: string): Promise<CardDb> {
    const text = await fs.readFile(jsonPath, 'utf8');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error(`loadCards: failed to parse JSON at ${jsonPath}: ${(e as Error).message}`);
    }
    if (!Array.isArray(raw)) {
      throw new Error(`loadCards: expected JSON array at ${jsonPath}`);
    }
    return new CardDb(raw as readonly CardDef[]);
  }
  ```

- [ ] 7.4 跑 loader 测试：全 pass。

## 8. SearchFilter（TDD）

- [ ] 8.1 创建 `packages/hearthdb/src/card-search.test.ts`：

  ```ts
  import { describe, it, expect } from 'vitest';
  import { loadCards } from './card-loader';
  import path from 'node:path';

  const tinyPath = path.resolve(__dirname, 'tests/fixtures/tiny-cards.json');

  describe('CardDb.search', () => {
    let db!: Awaited<ReturnType<typeof loadCards>>;
    it('loads', async () => {
      db = await loadCards(tinyPath);
      expect(db.size).toBeGreaterThan(0);
    });
    it('filters by single cost', () => {
      const r = db.search({ cost: 1, limit: 1000 });
      expect(r.every((c) => c.cost === 1)).toBe(true);
    });
    it('filters by cost range', () => {
      const r = db.search({ cost: { min: 2, max: 4 }, limit: 1000 });
      expect(r.every((c) => c.cost! >= 2 && c.cost! <= 4)).toBe(true);
    });
    it('AND combines class+type', () => {
      const r = db.search({ cardClass: 'MAGE', type: 'SPELL', limit: 1000 });
      expect(r.every((c) => c.cardClass === 'MAGE' && c.type === 'SPELL')).toBe(true);
    });
    it('query matches name case-insensitive', () => {
      const r = db.search({ query: 'spell', limit: 1000 });
      expect(r.length).toBeGreaterThan(0);
    });
    it('limit/offset pagination disjoint', () => {
      // 假设 fixture 中 cost=1 的卡至少有 4 张
      const a = db.search({ cost: 1, limit: 2, offset: 0 });
      const b = db.search({ cost: 1, limit: 2, offset: 2 });
      const intersect = a.filter((c) => b.some((d) => d.id === c.id));
      expect(intersect.length).toBe(0);
    });
  });
  ```

- [ ] 8.2 创建 `packages/hearthdb/src/card-search.ts`：

  ```ts
  import type { CardClass, CardDef, CardType, Rarity } from './card-defs';

  export interface SearchFilter {
    query?: string;
    cost?: number | { min?: number; max?: number };
    cardClass?: CardClass | CardClass[];
    rarity?: Rarity | Rarity[];
    set?: string | string[];
    type?: CardType | CardType[];
    mechanic?: string;
    limit?: number;
    offset?: number;
  }

  function inOneOf<T>(value: T | undefined, criteria: T | T[] | undefined): boolean {
    if (criteria === undefined) return true;
    if (value === undefined) return false;
    return Array.isArray(criteria) ? criteria.includes(value) : criteria === value;
  }

  export function matches(card: CardDef, f: SearchFilter): boolean {
    if (f.query) {
      const q = f.query.toLowerCase();
      const name = card.name?.toLowerCase() ?? '';
      const text = card.text?.toLowerCase() ?? '';
      if (!name.includes(q) && !text.includes(q)) return false;
    }
    if (f.cost !== undefined) {
      if (typeof f.cost === 'number') {
        if (card.cost !== f.cost) return false;
      } else {
        if (f.cost.min !== undefined && (card.cost ?? -Infinity) < f.cost.min) return false;
        if (f.cost.max !== undefined && (card.cost ?? Infinity) > f.cost.max) return false;
      }
    }
    if (!inOneOf(card.cardClass, f.cardClass)) return false;
    if (!inOneOf(card.rarity, f.rarity)) return false;
    if (!inOneOf(card.set, f.set)) return false;
    if (!inOneOf(card.type, f.type)) return false;
    if (f.mechanic) {
      if (!(card.mechanics ?? []).includes(f.mechanic)) return false;
    }
    return true;
  }
  ```

- [ ] 8.3 在 `packages/hearthdb/src/index.ts` 加 `export { CardDb } from './card-db'; export { loadCards } from './card-loader'; export { type SearchFilter, matches } from './card-search';`
- [ ] 8.4 跑 search 测试 + loader 测试：全 pass。
- [ ] 8.5 commit：`git add packages/hearthdb && git commit -m "feat(hearthdb): implement CardDb loader, indices, and search"`。

## 9. 数据下载脚本

- [ ] 9.1 在仓库根装 `tsx`：

  ```bash
  pnpm add -Dw tsx
  ```

- [ ] 9.2 创建 `data/cards/.gitkeep` 与 `data/cards/README.md`：

  ```markdown
  # Card Data

  This directory holds the local copy of card definitions downloaded from
  [HearthstoneJSON](https://hearthstonejson.com/), maintained by HearthSim.

  **Files in this directory are NOT committed to git** (see root `.gitignore`).
  Both local development and CI must run the download script:

  ```bash
  pnpm cards:download
  ```

  Files produced:
  - `cards.collectible.enUS.json` — used by the desktop main process at runtime
  - `cards.collectible.zhCN.json` — Chinese locale, reserved for future i18n change

  License attribution: card data is property of Blizzard Entertainment;
  HearthstoneJSON provides a redistributable JSON snapshot per build.
  ```

- [ ] 9.3 创建 `scripts/download-cards.ts`（按 design D8 完整实现）。
- [ ] 9.4 在根 `package.json` `scripts` 加 `"cards:download": "tsx scripts/download-cards.ts"`。
- [ ] 9.5 在 `.gitignore` 末尾加：
  ```
  # Downloaded card data (refresh with `pnpm cards:download`)
  data/cards/*.json
  ```
- [ ] 9.6 跑 `pnpm cards:download`，期望产出 enUS 与 zhCN 两个文件，每个 ≥ 1 MB。
- [ ] 9.7 commit：`git add . && git commit -m "feat: add cards:download script using HearthstoneJSON"`。

## 10. 主进程 IPC + 加载

- [ ] 10.1 在 `apps/desktop/package.json` `dependencies` 加 `"@hdt/hearthdb": "workspace:*"`。
- [ ] 10.2 仓库根 `pnpm install`。
- [ ] 10.3 创建 `apps/desktop/src/main/cards.ts`（按 design D9）。
- [ ] 10.4 修改 `apps/desktop/src/main/ipc.ts`，加 5 个 handler：

  ```ts
  import { app, ipcMain } from 'electron';
  import { ensureCardDb } from './cards';
  import { encodeDeck, decodeDeck, type SearchFilter, type DeckBlueprint } from '@hdt/hearthdb';

  export function registerIpc(): void {
    ipcMain.handle('app:getVersion', () => app.getVersion());

    ipcMain.handle('cards:findByDbfId', async (_, dbfId: number) => {
      try {
        const db = await ensureCardDb();
        return db.findByDbfId(dbfId) ?? null;
      } catch (e) {
        console.error('[ipc cards:findByDbfId]', (e as Error).message);
        return null;
      }
    });

    ipcMain.handle('cards:findById', async (_, id: string) => {
      try {
        const db = await ensureCardDb();
        return db.findById(id) ?? null;
      } catch (e) {
        console.error('[ipc cards:findById]', (e as Error).message);
        return null;
      }
    });

    ipcMain.handle('cards:search', async (_, filter: SearchFilter) => {
      try {
        const db = await ensureCardDb();
        return db.search(filter);
      } catch (e) {
        console.error('[ipc cards:search]', (e as Error).message);
        return [];
      }
    });

    ipcMain.handle('deck:encode', (_, blueprint: DeckBlueprint) => encodeDeck(blueprint));
    ipcMain.handle('deck:decode', (_, deckstring: string) => decodeDeck(deckstring));
  }
  ```

- [ ] 10.5 跑 `pnpm typecheck`，期望零错误。
- [ ] 10.6 commit：`git add apps/desktop pnpm-lock.yaml && git commit -m "feat(desktop): add cards/deck IPC handlers backed by @hdt/hearthdb"`。

## 11. Preload 暴露 + env.d.ts

- [ ] 11.1 修改 `apps/desktop/src/preload/index.ts`：

  ```ts
  import { contextBridge, ipcRenderer } from 'electron';
  import type { CardDef, DeckBlueprint, SearchFilter } from '@hdt/hearthdb';

  const api = {
    app: {
      getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    },
    cards: {
      findByDbfId: (dbfId: number): Promise<CardDef | null> =>
        ipcRenderer.invoke('cards:findByDbfId', dbfId),
      findById: (id: string): Promise<CardDef | null> =>
        ipcRenderer.invoke('cards:findById', id),
      search: (filter: SearchFilter): Promise<CardDef[]> =>
        ipcRenderer.invoke('cards:search', filter),
    },
    deck: {
      encode: (blueprint: DeckBlueprint): Promise<string> =>
        ipcRenderer.invoke('deck:encode', blueprint),
      decode: (deckstring: string): Promise<DeckBlueprint> =>
        ipcRenderer.invoke('deck:decode', deckstring),
    },
  };

  contextBridge.exposeInMainWorld('hdt', api);
  export type HdtApi = typeof api;
  ```

- [ ] 11.2 `apps/desktop/src/renderer/src/env.d.ts` 已经引用 `HdtApi`，无需改动（类型自动同步）。
- [ ] 11.3 跑 `pnpm typecheck`，期望零错误。
- [ ] 11.4 commit：`git add apps/desktop && git commit -m "feat(desktop): expose window.hdt.cards and window.hdt.deck via preload"`。

## 12. UI 集成（Decklist + Collection）

- [ ] 12.1 升级 `apps/desktop/src/renderer/src/data/mockDecks.ts`：给现有每张 mock 卡加 `dbfId` 字段（用真实 dbfId 如：Argent Squire = 1746、Fireball = 315 等；可在 `cards.collectible.enUS.json` 里查）。`Card` interface 加 `dbfId?: number`。
- [ ] 12.2 修改 `apps/desktop/src/renderer/src/components/Decklist.tsx`，实现 design D10 的 fallback 策略（useState + useEffect + Promise.all + mergeCardDef helper）。
- [ ] 12.3 修改 `apps/desktop/src/renderer/src/components/Collection.tsx`：把硬编码 expansions 改为 `useEffect` 内 `await window.hdt.cards.search({ limit: 5000 })` + 按 `set` 字段聚合统计。fallback 仍保留原硬编码数据。
- [ ] 12.4 跑 `pnpm dev`，验证：
  - Decklist 显示真实卡名（如 mock 中 Argent Squire 经查询后显示真实英文名/数值）
  - Collection 标签上的卡包数量来自真实 JSON
  - 关掉 `data/cards/cards.collectible.enUS.json` 后重启 dev：界面不白屏，仍显示 mock fallback + 控制台有 cards database 错误日志
- [ ] 12.5 commit：`git add apps/desktop && git commit -m "feat(desktop): wire Decklist and Collection to real card data"`。

## 13. CI + README 同步

- [ ] 13.1 修改 `.github/workflows/ci.yml`，在 `pnpm install --frozen-lockfile` 之后、`pnpm test` 之前插入：

  ```yaml
  - run: pnpm cards:download
  ```

- [ ] 13.2 修改根 `README.md` 的 "一键启动" 段，把命令改为：

  ```bash
  corepack enable
  pnpm install
  pnpm cards:download   # 首次运行必须，约 5 秒
  pnpm dev
  ```

- [ ] 13.3 commit：`git add .github README.md && git commit -m "ci: download card data before tests; docs: update quickstart"`。

## 14. 同步 .NEXT.md

- [ ] 14.1 在 `openspec/changes/.NEXT.md` 把 `add-card-database` 标 ✓，新加候选 `add-deck-management`（依赖本 change）。
- [ ] 14.2 commit：`git add openspec/changes/.NEXT.md && git commit -m "docs(openspec): mark add-card-database done, queue add-deck-management"`。

## 15. 最终验收

- [ ] 15.1 跑全套质量门：

  ```powershell
  pnpm install --frozen-lockfile
  pnpm cards:download
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm --filter @hdt/desktop build
  ```

  全部退出码 0。`pnpm test` 至少 8 个新测试通过（hearthdb 包内）。

- [ ] 15.2 把本文件 1.x ~ 14.x 全部标 `[x]`。
- [ ] 15.3 `openspec validate add-card-database --strict` → valid。
- [ ] 15.4 `openspec status --change add-card-database` → 4/4 artifacts complete。
- [ ] 15.5 final commit：`git add . && git commit -m "docs(openspec): mark all tasks complete in add-card-database"`。

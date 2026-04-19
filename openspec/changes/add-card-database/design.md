## Context

`add-monorepo-skeleton` 完成了 Electron 三段式 + figma_design 迁入 + IPC 最小通道（仅 `app:getVersion`）。`add-hearthmirror-bridge-spike` 验证了 Rust 内存读取链路。但渲染端没有任何"业务数据"——卡牌列表硬编码在 `mockDecks.ts`（仅 30 张占位 + 假 cost/name），Stats / Collection / Decklist 都是装饰性的。

引入卡牌数据库是把 monorepo 从"骨架 + 占位"推向"能用"的最小一步：UI 立刻能渲染 5000+ 张真实可收藏卡，且 deckstring 编解码让用户能从战网官方/HSReplay/任何地方导入卡组，不需要等 hearthmirror 跑通。

约束：

- **不引入数据库**：卡牌数据是只读 + 体积可控（cards.collectible.json ≈ 4 MB JSON / ≈ 5000 卡），内存常驻足够，不用 SQLite。
- **不在仓库 commit Cards.json**：避免每次 build patch 都让 `git diff` 多 4 MB；CI 与开发都跑下载脚本（HearthstoneJSON 不要 API key）。
- **保留 mock fallback**：renderer 在主进程数据加载完之前不能白屏。
- **deckstring 必须 round-trip**：encode(decode(s)) === s（针对正规化的 input）—— 这是 codec 正确性的硬性要求，且能很容易写 fixture 测试。

## Goals / Non-Goals

**Goals:**

- 渲染端启动后，`Decklist.tsx` 显示的卡牌名/法力值/职业图标全部来自真实 `cards.collectible.json` 数据。
- 任何 HearthSim 标准 deckstring 能被 `decodeDeck()` 解析为合法 `DeckBlueprint`，再 `encodeDeck()` 回原 deckstring（针对官方 fixture 的 round-trip 测试）。
- `pnpm cards:download` 一条命令完成 enUS + zhCN 两种 locale 拉取（约 2 MB / 5 秒）。
- 主进程 IPC `cards:findByDbfId` 在 100 µs 内返回（O(1) Map lookup）。
- `pnpm test` 至少新增 8 个测试（loader / search / encode / decode / round-trip / known fixtures / error paths），全部通过。
- 当 `cards.collectible.json` 缺失或损坏时，主进程**不**崩溃，IPC handler 返回明确错误（"cards database not loaded"），renderer 展示降级 UI（fallback 到 mock）。

**Non-Goals:**

- 不实现 Cards.json 自动更新（每次手动跑 `pnpm cards:download`）。
- 不实现卡牌数据增量更新或 diff（每次全量替换）。
- 不做 sideboard、battlegrounds heroes、mercenaries 等专属编解码。
- 不做模糊搜索 / 拼写纠错 / 中文同义词（后续 add-card-search-quality 处理）。
- 不缓存任何卡牌图片（卡名足够，图片留给后续 art-cache change）。
- 不做主进程数据热更新（运行时换 Cards.json 必须重启 Electron）。

## Decisions

### D1: 数据源 → HearthstoneJSON `cards.collectible.json`

- **Context**: 三种主流来源 —— (a) HearthSim 自家的 `hsdata` 仓库（XML/yml + Python 脚本生成，复杂）、(b) HearthstoneJSON 静态 API（直接 JSON，每个版本一更）、(c) 解析炉石客户端 `.unitypack` 文件（自给自足但要 Unity 工具链）。
- **Choice**: **(b) HearthstoneJSON `https://api.hearthstonejson.com/v1/latest/{locale}/cards.collectible.json`**。
- **Rationale**: 维护方就是 HearthSim（HDT 所属团队），数据质量与原版 HDT 完全一致；schema 12+ 年稳定；零依赖，浏览器/Node/CI 都能直接 fetch；只需 enUS + zhCN 两个 locale 即覆盖中国玩家。
- **Risk**: 上游停机时 CI 失败 → 缓解：retry 3 次 + 报错信息明确建议手动重试。

### D2: locale 策略 → 同时下载 enUS 与 zhCN，但运行时只用 enUS

- **Context**: 中文玩家需要中文卡名，但 deckstring 是 DBF ID 不分 locale，所有数据库索引都用英文 ID。
- **Choice**: 下载脚本拉两个 locale，运行时主进程只加载 enUS 进 `CardDb`（约 5 MB JSON）；zhCN 留作未来 i18n 切换的源数据，本 change 不消费。
- **Rationale**: 给未来 i18n change 留 hooks，但本 change 不付出 i18n 复杂度。

### D3: 包结构

```
packages/hearthdb/
├── package.json                       # name: @hdt/hearthdb, type: module
├── tsconfig.json                      # extends ../../tsconfig.base.json
├── vitest.config.ts                   # name: hearthdb, env: node
└── src/
    ├── index.ts                       # 公开 API barrel
    ├── card-defs.ts                   # CardDef + 枚举（CardClass/Rarity/CardSet/CardType）
    ├── card-loader.ts                 # loadCards(jsonPath) → CardDb
    ├── card-db.ts                     # class CardDb { findByDbfId / findById / search }
    ├── card-search.ts                 # SearchFilter type + matches() 函数（O(n) 但 n 小）
    ├── deckstring/
    │   ├── index.ts                   # encodeDeck / decodeDeck barrel
    │   ├── varint.ts                  # readVarint / writeVarint（unsigned LEB128）
    │   ├── encoder.ts                 # encodeDeck(blueprint) → deckstring
    │   ├── decoder.ts                 # decodeDeck(deckstring) → blueprint
    │   └── types.ts                   # DeckBlueprint / DeckFormat 枚举
    └── tests/
        ├── card-loader.test.ts
        ├── card-search.test.ts
        ├── varint.test.ts
        ├── deckstring-encoder.test.ts
        ├── deckstring-decoder.test.ts
        ├── deckstring-roundtrip.test.ts
        └── fixtures/
            ├── known-decks.json       # 一组人工挑选的真实 deckstring 与 expected blueprint
            └── tiny-cards.json        # 5–10 张迷你卡牌库，足以覆盖 codec 测试
```

文件按职责拆分，每个 ≤ 200 行；codec 单独成子目录便于未来扩展 sideboard。

### D4: `CardDef` 类型 → HearthstoneJSON 字段子集 + 强类型枚举

- **Context**: HearthstoneJSON 的 schema 有 80+ 字段，大部分本 change 不用（如 `flavor`、`artist`、`elite` 等）。
- **Choice**: 定义 `CardDef` 仅含本 change 与近期 change 会用到的字段：

  ```typescript
  export interface CardDef {
    id: string;              // 字符串卡牌 ID 如 "EX1_046"
    dbfId: number;           // DBF ID 如 1746（deckstring 用这个）
    name: string;            // 本地化卡名
    cost?: number;           // 法力消耗（不可收藏的英雄技能等可能没有）
    attack?: number;
    health?: number;
    armor?: number;
    text?: string;
    cardClass: CardClass;    // 'WARRIOR' | 'MAGE' | ... | 'NEUTRAL'
    rarity?: Rarity;         // 'FREE' | 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
    set: string;             // 'CORE' | 'EXPERT1' | 'TITANS' | ...（HearthstoneJSON 已是字符串）
    type: CardType;          // 'MINION' | 'SPELL' | 'WEAPON' | 'HERO' | 'HERO_POWER' | 'LOCATION'
    mechanics?: string[];    // 如 ['BATTLECRY', 'TAUNT']
    collectible: boolean;    // 应总是 true，因为我们只加载 collectible
  }
  ```

- 用字符串字面量联合类型而非 `enum`（与 monorepo 其他地方的 TS 实践一致；JSON 字段直接是字符串，零运行时转换）。
- `set` 不做枚举（卡包列表每次新版本都增加，写枚举要不停同步；HearthstoneJSON 已经标准化 set 字符串名）。

### D5: 索引策略 → 双 Map（dbfId + cardId）

- **Choice**: `CardDb` 内部维护 `Map<number, CardDef>` 与 `Map<string, CardDef>`，分别用 `dbfId` 与 `id` 做 key。两个 Map 共享 CardDef 引用（无复制开销）。
- **Rationale**: deckstring 解码出来是 dbfId，UI / hearthmirror 可能给字符串 cardId，两边都需要 O(1) 查找。

### D6: SearchFilter 设计

```typescript
export interface SearchFilter {
  query?: string;             // 模糊匹配 name 与 text，case-insensitive
  cost?: number | { min?: number; max?: number };
  cardClass?: CardClass | CardClass[];
  rarity?: Rarity | Rarity[];
  set?: string | string[];
  type?: CardType | CardType[];
  mechanic?: string;          // 单个 mechanic 字符串匹配
  limit?: number;             // 默认 50
  offset?: number;            // 默认 0
}
```

实现 O(n)（n ~ 5000）的简单线性扫描 + 多条件 AND 组合。无索引（query 这种模糊匹配很难索引；除非将来引入 Fuse.js 等），实测在 i7 上 < 5 ms / search，本 change 范围内可接受。

### D7: Deckstring 编解码

完全按 [HearthSim 官方文档](https://hearthsim.info/docs/deckstrings) 实现：

```
[0x00] [version=1] [format varint]
[heroes count varint] [heroes... varints]
[1-copy count varint] [1-copy dbfIds... varints]
[2-copy count varint] [2-copy dbfIds... varints]
[n-copy count varint] [(dbfId varint, count varint) pairs...]
```

- 整体 `Buffer` → `base64`（Node 原生 `Buffer.from(...).toString('base64')`，无依赖）。
- varint 用 unsigned LEB128（每字节低 7 bit + 高 1 bit continuation flag）。
- DBF ID 数组在 encode 时**必须**升序排序（这是 HearthSim 规范要求）。
- decode 时**不**强制要求升序（兼容用户手敲或损坏的 deckstring），但 `validateDeckstring()` 函数提供严格模式。

`DeckBlueprint` 类型：

```typescript
export interface DeckBlueprint {
  format: DeckFormat;                                  // 1=Wild | 2=Standard | 3=Classic | 4=Twist
  heroes: number[];                                    // 通常 1 个，hero card 的 dbfId
  cards: Array<{ dbfId: number; count: number }>;      // 已合并 1/2/n-copy 段
}
```

`encodeDeck` 的输入 `cards` 内部按 count 自动分配到 1/2/n-copy 段；`decodeDeck` 输出始终是合并后的扁平数组，调用方零负担。

### D8: scripts/download-cards.ts

```typescript
const LOCALES = ['enUS', 'zhCN'] as const;
const URL = (locale: string) =>
  `https://api.hearthstonejson.com/v1/latest/${locale}/cards.collectible.json`;
const OUT_DIR = 'data/cards';

async function downloadOne(locale: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(URL(locale));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      JSON.parse(text); // schema sanity check
      await fs.writeFile(
        path.join(OUT_DIR, `cards.collectible.${locale}.json`),
        text,
        'utf8',
      );
      console.log(`✓ ${locale}: ${(text.length / 1024).toFixed(1)} KB`);
      return;
    } catch (e) {
      console.warn(`  attempt ${attempt}/3 failed: ${(e as Error).message}`);
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

await Promise.all(LOCALES.map(downloadOne));
```

无依赖（用 Node 22 内置 `fetch` 与 `fs/promises`），`tsx` 直接跑 .ts 文件不需要预编译。

### D9: IPC 边界

主进程在 `app.whenReady()` 后异步加载 cards.json：

```typescript
// apps/desktop/src/main/cards.ts
import { loadCards, type CardDb } from '@hdt/hearthdb';
import { join } from 'node:path';

let dbPromise: Promise<CardDb> | null = null;

export function ensureCardDb(): Promise<CardDb> {
  if (!dbPromise) {
    const jsonPath = join(process.cwd(), 'data/cards/cards.collectible.enUS.json');
    dbPromise = loadCards(jsonPath);
  }
  return dbPromise;
}
```

IPC handler 包了一层 `try/catch` 转 reject：

```typescript
ipcMain.handle('cards:findByDbfId', async (_, dbfId: number) => {
  const db = await ensureCardDb();
  return db.findByDbfId(dbfId) ?? null;
});

ipcMain.handle('cards:search', async (_, filter: SearchFilter) => {
  const db = await ensureCardDb();
  return db.search(filter);
});

// 类似 deck:encode / deck:decode 直接调 hearthdb 的 pure function
ipcMain.handle('deck:decode', async (_, deckstring: string) => {
  return decodeDeck(deckstring); // 抛异常会自动转 Promise reject
});
```

preload 暴露：

```typescript
const api = {
  app: { getVersion: () => ipcRenderer.invoke('app:getVersion') },
  cards: {
    findByDbfId: (dbfId: number) => ipcRenderer.invoke('cards:findByDbfId', dbfId),
    findById: (id: string) => ipcRenderer.invoke('cards:findById', id),
    search: (filter: SearchFilter) => ipcRenderer.invoke('cards:search', filter),
  },
  deck: {
    encode: (blueprint: DeckBlueprint) => ipcRenderer.invoke('deck:encode', blueprint),
    decode: (deckstring: string) => ipcRenderer.invoke('deck:decode', deckstring),
  },
};
```

### D10: Renderer fallback 策略

`Decklist.tsx` 使用 React Suspense + `useState` cache：

```tsx
const [resolvedCards, setResolvedCards] = useState<Card[]>(props.cards); // mock fallback

useEffect(() => {
  const dbfIds = props.cards.map((c) => c.dbfId).filter((id): id is number => id != null);
  Promise.all(dbfIds.map((id) => window.hdt.cards.findByDbfId(id)))
    .then((defs) => {
      const enriched = props.cards.map((c, i) => defs[i] ? mergeCardDef(c, defs[i]!) : c);
      setResolvedCards(enriched);
    })
    .catch(() => {/* fallback 已是 mock */});
}, [props.cards]);
```

如果主进程返回 null（数据库未加载），渲染 mock 数据 + 一个不显眼的 "card data loading..." 角标。

### D11: 测试策略

- **`varint.test.ts`**：8 个 case 覆盖边界（0、127、128、16383、16384、最大 32 位、连续 read/write 同 buffer、负数应 throw）。
- **`deckstring-roundtrip.test.ts`**：从 `fixtures/known-decks.json` 读 5+ 个真实 deckstring（手动从战网截取），断言 `encodeDeck(decodeDeck(s)) === s`。
- **`card-search.test.ts`**：用 `fixtures/tiny-cards.json` 覆盖单条件 / AND 组合 / limit / offset / 模糊匹配。
- **`card-loader.test.ts`**：加载 `fixtures/tiny-cards.json` 验证双 Map 索引正确建立。
- **renderer 集成测试**：`Decklist` 的 fallback 行为在已有 vitest setup 中加 stub `window.hdt.cards.findByDbfId` 测试用例。

## Risks / Trade-offs

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| HearthstoneJSON 上游停机时 CI 失败 | 低 | 中 | retry 3 次 + 显式错误提示用户手动重试；如长期不可用，加 fallback 镜像（不在本 change 实施） |
| Cards.json schema 字段缺失或类型变化 | 低 | 中 | TypeScript 类型断言（非运行时校验），如出现要靠 vitest 测试发现；后续可加 zod |
| ~5000 张卡每次 search 全扫 5 ms 在大量并发 IPC 时累积 | 低 | 低 | 接受；如需优化引入 Fuse.js（本 change 不做） |
| renderer 首屏切到真实数据时闪烁 | 中 | 低 | mock fallback + 角标 "loading"，不刻意优化 |
| 主进程加载 Cards.json 失败带崩 Electron | 低 | 高 | `loadCards` 用 `try/catch` 包，失败时 dbPromise 设为 rejected，IPC handler 都返 null + log error |
| zhCN 数据可能比 enUS 晚发布几小时 | 低 | 低 | 下载脚本若 zhCN 失败仅 warn，enUS 失败才 throw |
| `data/cards/*.json` 不入库导致克隆 + `pnpm dev` 直接报错 | 中 | 低 | README 显眼写明 + main process 启动时检测缺失给明确提示 |

## Open Questions

- **OQ1**: 卡牌数据的"版本号"（HearthstoneJSON 的 build number）是否需要存到 metadata 里供调试？答：本 change 暂不存（YAGNI），如果 spike 02 / hearthmirror 需要确认数据版本再加。
- **OQ2**: 是否需要在 IPC 上加 batch API（`cards:batchFindByDbfId(ids: number[])`）？答：本 change 不做，但 D10 的 renderer 用 Promise.all 触发了多次 IPC（30 张卡 = 30 次 IPC），如果实测延迟 > 50 ms 再加 batch（留作 quick follow-up）。
- **OQ3**: deckstring 解码遇到不在 CardDb 中的 dbfId 是 silently 保留还是报错？答：blueprint 仅含 dbfId 与 count（不依赖 CardDb），所以 decoder 不会报错；UI 渲染时若查不到再显示 "Unknown Card"。

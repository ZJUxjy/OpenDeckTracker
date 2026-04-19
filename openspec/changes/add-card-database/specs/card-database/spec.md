## ADDED Requirements

### Requirement: CardDef 类型契约

The `@hdt/hearthdb` package SHALL export a `CardDef` TypeScript interface containing at least: `id` (string), `dbfId` (number), `name` (string), `cardClass` (string union), `set` (string), `type` (string union), `collectible` (boolean true). Optional fields: `cost`, `attack`, `health`, `armor`, `text`, `rarity`, `mechanics`. Class/rarity/type SHALL be string literal unions (not TypeScript `enum`).

#### Scenario: CardDef 字段对齐 HearthstoneJSON
- **WHEN** 用 `loadCards()` 加载真实 `cards.collectible.enUS.json`
- **THEN** 至少 90% 的卡牌的 `id`、`dbfId`、`name`、`cardClass`、`set`、`type` 字段都非 undefined（剩余 10% 是 hero / hero_power 这种部分字段缺失的特殊卡）

### Requirement: 加载与索引

`@hdt/hearthdb` SHALL export `loadCards(jsonPath: string): Promise<CardDb>` that reads a HearthstoneJSON `cards.collectible.json` file from disk and returns a `CardDb` instance with two internal indices: a `Map<number, CardDef>` keyed by `dbfId` and a `Map<string, CardDef>` keyed by `id`. Both maps SHALL share the same `CardDef` references (no deep copy).

#### Scenario: 加载真实 enUS 数据
- **GIVEN** `data/cards/cards.collectible.enUS.json` 存在并合法
- **WHEN** `await loadCards('data/cards/cards.collectible.enUS.json')`
- **THEN** 返回 `CardDb` 实例，`db.size` ≥ 2000（合理下界，一般 5000+）

#### Scenario: 损坏的 JSON 抛出明确错误
- **GIVEN** `data/cards/broken.json` 内容为 `{not valid json`
- **WHEN** `await loadCards('data/cards/broken.json')`
- **THEN** Promise reject 一个 Error，message 含 `JSON` 与文件路径

#### Scenario: 文件不存在抛出明确错误
- **GIVEN** `data/cards/missing.json` 不存在
- **WHEN** `await loadCards('data/cards/missing.json')`
- **THEN** Promise reject 一个 Error，message 含 "ENOENT" 或 "no such file"

### Requirement: 按 ID 查找

`CardDb` SHALL expose `findByDbfId(dbfId: number): CardDef | undefined` and `findById(cardId: string): CardDef | undefined`. Both SHALL be O(1) Map lookups. They SHALL return `undefined` (not throw) for unknown IDs.

#### Scenario: dbfId 命中返回 CardDef
- **GIVEN** 已加载 `cards.collectible.enUS.json`，且其中包含 dbfId 1746（"Argent Squire"）
- **WHEN** `db.findByDbfId(1746)`
- **THEN** 返回的 CardDef.name 为 "Argent Squire"

#### Scenario: 未知 dbfId 返回 undefined
- **WHEN** `db.findByDbfId(99999999)`
- **THEN** 返回 `undefined`，不抛错

#### Scenario: cardId 命中返回相同实例
- **GIVEN** 同上
- **WHEN** `const a = db.findByDbfId(1746); const b = db.findById(a.id);`
- **THEN** `a === b`（引用相同，证明双 Map 共享对象）

### Requirement: 多条件搜索

`CardDb` SHALL expose `search(filter: SearchFilter): CardDef[]`. The filter accepts optional `query` (case-insensitive substring match against `name` and `text`), `cost` (number or `{min?, max?}`), `cardClass`, `rarity`, `set`, `type` (each can be single or array), `mechanic` (single string), `limit` (default 50), `offset` (default 0). All conditions are AND-combined.

#### Scenario: 单条件 cost 过滤
- **WHEN** `db.search({ cost: 1, limit: 1000 })`
- **THEN** 返回数组中所有元素的 `cost` 都等于 1

#### Scenario: cost 范围过滤
- **WHEN** `db.search({ cost: { min: 2, max: 4 }, limit: 1000 })`
- **THEN** 所有元素 2 ≤ cost ≤ 4

#### Scenario: AND 组合过滤
- **WHEN** `db.search({ cardClass: 'MAGE', cost: 3, type: 'SPELL', limit: 1000 })`
- **THEN** 所有元素同时满足 `cardClass === 'MAGE'` 且 `cost === 3` 且 `type === 'SPELL'`

#### Scenario: query 模糊匹配
- **WHEN** `db.search({ query: 'fireball', limit: 100 })`
- **THEN** 至少返回一条 name 含 "Fireball"（case-insensitive）的卡

#### Scenario: limit 与 offset 分页
- **GIVEN** 全部 1 费法术共 N 条（N ≥ 30）
- **WHEN** `db.search({ cost: 1, type: 'SPELL', limit: 10, offset: 0 })` 与 `db.search({ cost: 1, type: 'SPELL', limit: 10, offset: 10 })`
- **THEN** 两次结果不重叠且每次 length === 10

### Requirement: 性能基线

`findByDbfId` and `findById` SHALL each complete in < 100 µs on a typical developer machine (i5/i7 era). `search` with a typical filter (one to three conditions, default limit) SHALL complete in < 20 ms over a real-size database (~5000 cards).

#### Scenario: findByDbfId 性能
- **GIVEN** 已加载 enUS 真实数据
- **WHEN** 连续 10000 次 `db.findByDbfId(<random valid id>)`
- **THEN** 总耗时 < 1000 ms（平均 < 100 µs/call）

#### Scenario: search 性能
- **GIVEN** 同上
- **WHEN** `db.search({ cardClass: 'MAGE', cost: { min: 1, max: 5 } })`
- **THEN** 单次耗时 < 20 ms

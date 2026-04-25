## MODIFIED Requirements

### Requirement: CardDef 类型契约

The `@hdt/hearthdb` package SHALL export a `CardDef` TypeScript interface containing at least: `id` (string), `dbfId` (number), `name` (string), `cardClass` (string union), `set` (string), `type` (string union), `collectible` (boolean). Optional fields: `cost`, `attack`, `health`, `armor`, `text`, `rarity`, `mechanics`. Class/rarity/type SHALL remain TypeScript string literal unions (not TypeScript `enum`) and SHALL include every mapped hsdata value emitted by the converter. `collectible` SHALL support both `true` and `false` because the new generated full dataset includes non-collectible cards.

#### Scenario: CardDef 字段对齐 hsdata generated JSON

- **WHEN** loading `data/cards/generated/cards.all.enUS.json`
- **THEN** every card has non-undefined `id`, `dbfId`, `name`, `cardClass`, `set`, `type`, and `collectible`

#### Scenario: non-collectible cards are representable

- **GIVEN** a generated card with `collectible=false`
- **WHEN** the card is typed as `CardDef`
- **THEN** TypeScript accepts the value without casts or schema exceptions

### Requirement: 加载与索引

`@hdt/hearthdb` SHALL export `loadCards(jsonPath: string): Promise<CardDb>` that reads a generated card JSON array from disk and returns a `CardDb` instance with two internal indices: a `Map<number, CardDef>` keyed by `dbfId` and a `Map<string, CardDef>` keyed by `id`. Both maps SHALL share the same `CardDef` references (no deep copy). The loader SHALL accept both full-card generated JSON and collectible-only generated JSON.

#### Scenario: 加载 hsdata full enUS 数据

- **GIVEN** `data/cards/generated/cards.all.enUS.json` exists and is valid
- **WHEN** `await loadCards('data/cards/generated/cards.all.enUS.json')`
- **THEN** the returned `CardDb` size is greater than or equal to the generated collectible dataset size

#### Scenario: 加载 hsdata collectible enUS 数据

- **GIVEN** `data/cards/generated/cards.collectible.enUS.json` exists and is valid
- **WHEN** `await loadCards('data/cards/generated/cards.collectible.enUS.json')`
- **THEN** every searchable card has `collectible === true`

#### Scenario: 损坏的 JSON 抛出明确错误

- **GIVEN** `data/cards/broken.json` content is `{not valid json`
- **WHEN** `await loadCards('data/cards/broken.json')`
- **THEN** the Promise rejects with an Error whose message contains `JSON` and the file path

#### Scenario: 文件不存在抛出明确错误

- **GIVEN** `data/cards/missing.json` does not exist
- **WHEN** `await loadCards('data/cards/missing.json')`
- **THEN** the Promise rejects with an Error whose message contains `ENOENT` or `no such file`

### Requirement: 按 ID 查找

`CardDb` SHALL expose `findByDbfId(dbfId: number): CardDef | undefined` and `findById(cardId: string): CardDef | undefined`. Both SHALL be O(1) Map lookups. They SHALL return `undefined` (not throw) for unknown IDs. These lookups SHALL work for collectible and non-collectible cards when the full generated dataset is loaded.

#### Scenario: dbfId 命中返回 CardDef

- **GIVEN** `cards.all.enUS.json` is loaded and includes dbfId `315` (`CS2_029`)
- **WHEN** `db.findByDbfId(315)`
- **THEN** the returned `CardDef.id` is `CS2_029`

#### Scenario: 未知 dbfId 返回 undefined

- **WHEN** `db.findByDbfId(99999999)`
- **THEN** it returns `undefined` and does not throw

#### Scenario: cardId 命中返回相同实例

- **GIVEN** `cards.all.enUS.json` is loaded and `const a = db.findByDbfId(315)` returns a card
- **WHEN** `const b = db.findById(a.id)`
- **THEN** `a === b`

### Requirement: 多条件搜索

`CardDb` SHALL expose `search(filter: SearchFilter): CardDef[]`. The filter accepts optional `query` (case-insensitive substring match against `name` and `text`), `cost` (number or `{min?, max?}`), `cardClass`, `rarity`, `set`, `type` (each can be single or array), `mechanic` (single string), `collectible` (boolean), `limit` (default 50), and `offset` (default 0). All conditions are AND-combined.

#### Scenario: collectible filter returns only collectible cards

- **GIVEN** a `CardDb` loaded from `cards.all.enUS.json`
- **WHEN** `db.search({ collectible: true, limit: 1000 })`
- **THEN** every returned card has `collectible === true`

#### Scenario: non-collectible filter returns only non-collectible cards

- **GIVEN** a `CardDb` loaded from `cards.all.enUS.json`
- **WHEN** `db.search({ collectible: false, limit: 1000 })`
- **THEN** every returned card has `collectible === false`

#### Scenario: AND 组合过滤

- **WHEN** `db.search({ cardClass: 'MAGE', cost: 4, type: 'SPELL', collectible: true, limit: 1000 })`
- **THEN** all returned cards satisfy `cardClass === 'MAGE'`, `cost === 4`, `type === 'SPELL'`, and `collectible === true`

#### Scenario: query 模糊匹配

- **WHEN** `db.search({ query: 'fireball', limit: 100 })`
- **THEN** at least one returned card has a name containing `Fireball` case-insensitively

#### Scenario: limit 与 offset 分页

- **GIVEN** more than 20 cards match `type: 'SPELL'`
- **WHEN** searching with `limit: 10, offset: 0` and then `limit: 10, offset: 10`
- **THEN** both result sets contain 10 cards and do not overlap by `id`

### Requirement: 性能基线

`findByDbfId` and `findById` SHALL each complete in < 100 µs on a typical developer machine. `search` with a typical filter (one to three conditions, default limit) SHALL complete in < 20 ms over the generated full hsdata dataset.

#### Scenario: findByDbfId 性能

- **GIVEN** `cards.all.enUS.json` is loaded
- **WHEN** calling `db.findByDbfId(<random valid id>)` 10000 times
- **THEN** total elapsed time is < 1000 ms

#### Scenario: search 性能

- **GIVEN** `cards.all.enUS.json` is loaded
- **WHEN** executing `db.search({ cardClass: 'MAGE', cost: { min: 1, max: 5 } })`
- **THEN** single-call elapsed time is < 20 ms

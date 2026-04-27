## ADDED Requirements

### Requirement: DeckBlueprint 类型契约

The `@hdt/hearthdb` package SHALL export a `DeckBlueprint` interface and a `DeckFormat` enum (or string literal union). `DeckBlueprint` SHALL contain `format` (DeckFormat), `heroes` (number[]), and `cards` (Array<{ dbfId: number; count: number }>). `DeckFormat` SHALL include at minimum: `Wild`, `Standard`, `Classic`, `Twist` mapped to numeric values 1, 2, 3, 4 respectively (matching HearthSim deckstring spec).

#### Scenario: DeckFormat 数值对齐 HearthSim 规范
- **WHEN** 检查 `DeckFormat.Standard`
- **THEN** 数值等于 2

### Requirement: encodeDeck

`@hdt/hearthdb` SHALL export `encodeDeck(blueprint: DeckBlueprint): string` that produces a base64 deckstring conforming to [HearthSim deckstring format](https://hearthsim.info/docs/deckstrings):

- Bytes start with `0x00` (reserved) + version `0x01` + format varint
- Heroes section: count varint + heroes varints
- Single-copy section: count varint + dbfId varints (sorted ascending)
- Two-copy section: count varint + dbfId varints (sorted ascending)
- N-copy section: count varint + (dbfId varint, count varint) pairs

The function SHALL automatically partition `cards` into 1-copy / 2-copy / n-copy sections by `count`. If `count <= 0` for any card, the function SHALL throw an Error.

#### Scenario: 编码空卡组
- **WHEN** `encodeDeck({ format: DeckFormat.Standard, heroes: [7], cards: [] })`
- **THEN** 返回非空字符串，前 1 字节 base64 解码后是 `0x00`

#### Scenario: 自动按 count 分段
- **GIVEN** blueprint cards 含 1 张 dbfId=100、2 张 dbfId=200、3 张 dbfId=300
- **WHEN** encode 后 decode
- **THEN** decoded blueprint 的 cards 数组（顺序无关）等于原 input

#### Scenario: count 为 0 抛错
- **WHEN** `encodeDeck({ format: 2, heroes: [7], cards: [{ dbfId: 1, count: 0 }] })`
- **THEN** 抛出 Error，message 含 "count" 与 "positive"

### Requirement: decodeDeck

`@hdt/hearthdb` SHALL export `decodeDeck(deckstring: string): DeckBlueprint` that parses a base64 deckstring and returns the blueprint with merged cards (single flat array, not partitioned). It SHALL throw a typed Error on:

- Empty / non-base64 input
- First decoded byte is not `0x00`
- Version byte is not `0x01`

It SHALL NOT throw if dbfIds within sections are not sorted (lenient decoder).

#### Scenario: 解码已知合法 deckstring
- **GIVEN** fixture `known-decks.json` 含一个 deckstring 与 expected blueprint
- **WHEN** `decodeDeck(fixture.deckstring)`
- **THEN** 返回 blueprint 的 `format`、`heroes`、`cards` 全部与 expected 相等（cards 按 dbfId 排序后比较）

#### Scenario: 空字符串抛错
- **WHEN** `decodeDeck('')`
- **THEN** 抛出 Error

#### Scenario: 非法 base64 抛错
- **WHEN** `decodeDeck('not!valid@base64')`
- **THEN** 抛出 Error，message 含 "base64" 或 "decode"

#### Scenario: 错误 reserved byte 抛错
- **GIVEN** 一个 deckstring 首字节 base64 解码后是 `0x42`
- **WHEN** `decodeDeck(<that string>)`
- **THEN** 抛出 Error，message 含 "reserved byte" 或 "0x00"

### Requirement: Round-trip 正规化

For any `blueprint` in canonical form (cards sorted by dbfId ascending within each count group), `decodeDeck(encodeDeck(blueprint))` SHALL deeply equal the original `blueprint`.

#### Scenario: 真实 fixture 的 round-trip
- **GIVEN** fixture `known-decks.json` 含 5 个真实游戏内卡组
- **WHEN** 对每个 blueprint 跑 `decodeDeck(encodeDeck(b))`
- **THEN** 返回值与 input 深度相等

#### Scenario: 编码相同 blueprint 产生相同 deckstring
- **GIVEN** 同一个 blueprint
- **WHEN** 调用 `encodeDeck` 两次
- **THEN** 两次返回的字符串完全相同（确定性 / canonical 输出）

### Requirement: Varint 工具

`@hdt/hearthdb` SHALL internally use unsigned LEB128 varint encoding for all integers in deckstring. The encoder SHALL write integers correctly for the range `[0, 2^32 - 1]`. The decoder SHALL read them back losslessly.

#### Scenario: 边界值 round-trip
- **GIVEN** 测试值集合 `[0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 268435455, 268435456, 4294967295]`
- **WHEN** 对每个值 `writeVarint` 后 `readVarint`
- **THEN** 读回的值与写入相等

#### Scenario: 负数抛错
- **WHEN** `writeVarint(buf, -1)`
- **THEN** 抛出 Error，message 含 "negative" 或 "unsigned"

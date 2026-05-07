## Context

`@hdt/core` 已经把 HearthWatcher（log 解析）和 HearthMirror（内存读取）
整合成 `DeckTracker` 状态机：每个 poll tick 产出一份 `DeckTrackerSnapshot`
通过 `deck-tracker:state` IPC 通道广播给 renderer。当前 snapshot 只
描述 deck 多重集 + 对手揭示卡 + 双方手牌大小。

Hearthstone 部分卡牌（**Cleansing Cleric**、**Tame Pet** 等）打出后会
留下"对局剩余时间一直生效"的修正：

- Cleansing Cleric → 自身后续治疗效果 +2，没有解除条件。
- Tame Pet → 抽 3 张更高 mana 的随机野兽固化为本场剩余的 *Animal
  Companion* 召唤池，替换游戏内置的 Misha/Leokk/Huffer。

记牌器目前不暴露这种状态。本设计在 core 层加一层 `GlobalEffectsRegistry`，
在 renderer 层让己方与对手 panel 变成「分页容器」（Deck / Effects 两个
tab），把 effects 列表展示出来。

## Goals / Non-Goals

**Goals:**

- Core 层有可扩展的 effect catalog，每张已知卡 = 一个 EffectDef 文件，
  注册-即-生效。
- Effects 触发只依赖 HearthWatcher 已经发出的 `card:played` 事件流，
  不要求新的 IPC 通道、不要求新的 Rust/HearthMirror 调用（M1）。
- Renderer 用纯前端分页 UI 展示效果列表，主窗口 Tracker 页 + 两个
  in-game overlay 表现一致。
- 框架对带参数效果（Tame Pet 的 3 选 1 池子）有正式建模；缺数据时
  优雅降级到「只显示效果存在」。

**Non-Goals:**

- 真正介入治疗/召唤计算 —— 我们只展示「buff 已存在」，数值由游戏
  端结算。
- 自动从卡牌文本反推 EffectDef —— catalog 是 hand-curated 白名单。
- 解除/到期检测的 M1 实现 —— EffectDef 上预留 `expiresOn?: ExpireRule`
  字段但不实例化任何规则；Standard 当前轮换内全局效果都是「本场剩余
  生效」。
- Wild / Twist / Arena / BG / Mercenaries 模式效果 —— catalog 留
  `mode?: GameMode` 接口但只填 Standard。
- Tab 状态跨 session 持久化 —— 关窗即重置，默认始终 Deck tab。
- 让用户手动加/减/隐藏 effect —— 面板纯只读。

## Decisions

### D1. Registry 落在 `@hdt/core`，主进程持有单例

- **Context**：`DeckTracker` 已经是 core 层的对象，主进程通过
  `apps/desktop/src/main/deck-tracker.ts` 持有一个 instance；snapshot
  在那里序列化进 IPC payload。Effects 是同一个对局生命周期的派生
  state。
- **Options**:
  1. Effects 完全在 renderer Zustand 里维护：从 `card:played` IPC
     事件流自己累加；core 不感知。
  2. Effects 在 main 进程里用一个独立 service 维护，不进 core；
     注入到 deck-tracker host 后再合并 snapshot。
  3. 加进 `@hdt/core`：DeckTracker 持有 `GlobalEffectsRegistry`，
     和 deck multiset 一起属于「per-match canonical state」。
- **Choice**: **3**。
- **Rationale**: Renderer 不应该成为状态权威源（重启 / 第二个
  BrowserWindow 连接时会丢状态）；Effects 与 deck multiset 同根同源
  —— 都是从 `card:played` 派生 —— 拆 service 反而要重复处理 game
  reset 的 lifecycle。Core 已经有 vitest 化的测试基础设施，
  registry 单测最好写。

### D2. Catalog 存储格式：TypeScript 文件，每张卡一个

- **Context**：M1 大约 10–15 个 EffectDef，未来每个标准轮换会有
  增删。需要类型安全 + 可嵌入 detector function。
- **Options**:
  1. 一个 JSON 数据文件，detectors 写在 registry 主文件里 switch-case
     dispatch。
  2. `packages/core/src/global-effects/catalog/<card-slug>.ts`，每个
     文件 `export default <EffectDef>`，registry 启动时扫一个 barrel。
- **Choice**: **2**。
- **Rationale**: TypeScript 类型让 EffectDef shape 不能漂移；detector
  逻辑（尤其 Tame Pet 这种带 params 解析）天然就是函数；JSON 容易
  在 catalog 长大后变成单点修改地狱。一个文件一张卡也方便 PR review
  和并行开发。
- **Trade-off**: 导出聚合需要写 barrel；用 vite glob import 方便但
  会绑死 vite/esbuild。M1 用手写 barrel `catalog/index.ts`，长大了
  再考虑 codegen。

### D3. 触发数据源：HearthWatcher 已有事件，不动 HearthMirror

- **Context**：HearthWatcher 已经从 Power.log 派生出
  `EntityEvent.kind === 'tag-change'` 等事件，可以判断 `ZONE` 从
  `HAND` → `PLAY` 的转移并推出 cardId + controllerId（已是 deck
  multiset 的输入源）。
- **Options**:
  1. 直接订阅 HearthWatcher 的 events bus；EffectsRegistry 自己 dedupe。
  2. 让 `DeckTracker` 在已经处理 `card:played` 的同一处把事件转发
     给 registry。
  3. 写一个全新的 hearthmirror 内存读取去对账。
- **Choice**: **2**。
- **Rationale**: DeckTracker 已经为 deck multiset 做了 controller
  归类、deduplication、phase guard；让 effects 复用一遍就好，无新
  数据通路、无新延迟。HearthMirror 的开销和 IPC round-trip 没必要为
  effects 多付一次。

### D4. 带参数效果的 params 提取（Tame Pet 三选一）

- **Context**：Tame Pet 打出后的随机野兽池子是 game 端临时生成的；
  我们需要拿到 3 个具体 cardId 才能在 panel 上展示。
- **Options**:
  1. **HearthMirror**：cast 后立刻 read 对应玩家 SetAside / Discover
     选项 zone 的 entities → 拿 cardIds。
  2. **HearthWatcher / Power.log**：解析 `Tame Pet` 后紧跟的
     `SHOW_ENTITY` 或 `FULL_ENTITY` 事件，按 controller + zone-time
     窗口匹配。
  3. **暂不支持 params**，只显示 effect 存在；Tame Pet 的展示退化为
     "本场召唤池被替换"文字，无具体牌名。
- **Choice**: **2 + fallback 到 3**。M1 在 EffectDef 里允许
  `parameterExtractor?: (event, watcher) => Promise<Params | null>`。
  Cleansing Cleric 不实现 extractor → 直接登记 active。Tame Pet
  实现 Power.log 解析；如果 extractor 返回 `null`（解析失败 / 数据
  延迟未达），先 push 一条 `params: undefined` 的 ActiveEffect，
  后续 poll 如果数据补到了再 mutate 同条记录。
- **Rationale**: HearthMirror 路径需要新 IPC + 32-bit native call，
  开发成本远超本 change 范畴。Power.log 路径已经是 deck-tracker 的
  常规数据源，复用风险低。优雅降级保证未来 Power.log 格式变了不会
  让整个 effects 面板崩。

### D5. Snapshot shape 与 IPC 通道复用

- **Context**：renderer 已经从 `deck-tracker:state` 拿到 snapshot
  并塞进 Zustand。新增 effects 字段最低成本路径就是搭车这个通道。
- **Options**:
  1. 新增 `effects:state` IPC 通道；effects state 与 deck snapshot
     解耦。
  2. `DeckTrackerSnapshot` 顶层加 `friendlyEffects` / `opposingEffects`
     字段，复用既有通道。
- **Choice**: **2**。
- **Rationale**: Effects 与 deck state 的更新频率、生命周期完全一致
  （同一个 game tick）。开两条通道意味着 renderer 要做两次合流。
  字段为可选 `T[] = []`，旧版 main 推老 snapshot 也不会让 renderer 崩。

### D6. Renderer 分页容器：原生 React state，不引入新依赖

- **Context**：项目现有 React 18 + Tailwind v4 + Radix（按需）。Tab
  组件用例只有这一处。
- **Options**:
  1. 引入 `@radix-ui/react-tabs`。
  2. 用一个本地 React useState 做 tab 切换，自己写最小 tab strip。
- **Choice**: **2**。
- **Rationale**: tab 数固定为 2、内容静态、没有键盘导航需求（
  in-game overlay 用鼠标）；多一个依赖收益不大。Radix tabs 也是 100+ KB
  级别的。如果未来 tab 数 ≥ 3 或要 a11y 强保证，再换。

### D7. 文件结构

`packages/core/` 新增：

```
packages/core/src/global-effects/
  index.ts                           # 公共出口
  types.ts                           # EffectDef / ActiveEffect / GameMode 等
  registry.ts                        # GlobalEffectsRegistry 类
  power-log-extractor.ts             # 共用的 Power.log 解析助手
  catalog/
    index.ts                         # barrel: 聚合所有 EffectDef
    cleansing-cleric.ts
    tame-pet.ts
    ...                              # 其他 Standard global effects
```

`apps/desktop/src/renderer/src/components/` 新增：

```
TrackerPanelTabs.tsx                 # 通用分页容器（player + opponent 复用）
GlobalEffectsPanel.tsx               # 单侧 effects 列表
GlobalEffectRow.tsx                  # 列表中单个 effect 的展示行
```

`apps/desktop/src/renderer/src/components/` 修改：

- `OverlayView.tsx`、`OpponentOverlayView.tsx`、`routes.tsx` —— 把
  panel 用 TrackerPanelTabs 包裹。
- 不动 `LiveDeckPanel.tsx` / `OpponentCardsPanel.tsx` 内部逻辑。

`resources/locales/{en-US,zh-CN}.json` 新增 `globalEffects` 命名空间。

### D8. EffectDef Schema（M1 形态）

```ts
interface EffectDef<P = Record<string, unknown>> {
  /** 唯一 id，文件名同名（kebab-case），用于 i18n key 与测试。*/
  id: string;
  /** 触发卡 cardId（hsdata），用于 catalog 索引。*/
  sourceCardId: string;
  /** 触发的玩家侧（M1 只支持 'caster'：谁打的就归谁）。*/
  side: 'caster';
  /** 模式过滤；M1 全部填 'STANDARD'。*/
  mode: GameMode;
  /** 可选的 params extractor，从已经发生的事件流推断参数。*/
  parameterExtractor?: (
    event: CardPlayedEvent,
    ctx: ExtractCtx,
  ) => Promise<P | null>;
  /** 可选过期规则（M1 不实现，预留以后兼容）。*/
  expiresOn?: ExpireRule;
}

interface ActiveEffect<P = Record<string, unknown>> {
  id: string;             // EffectDef.id
  sourceCardId: string;   // 冗余，方便 renderer 不再 join catalog
  triggeredAt: number;    // wall-clock ms
  params?: P;             // extractor 解析失败时为 undefined
}
```

### D9. Catalog 初始内容（M1）

| EffectDef.id        | 来源卡 (Standard)        | 是否带参数 | 备注 |
|---------------------|--------------------------|------------|------|
| `cleansing-cleric`  | Cleansing Cleric (牧师)  | 否         | +2 healing for rest of match |
| `tame-pet`          | Tame Pet (猎人)          | 是 (3 cardId) | replaces Animal Companion pool |
| _其他 Standard 全局效果_ | — | — | 实现期间穷举当前 Standard 卡池补齐；具体清单在 tasks.md 一一列入 |

不强求初版面面俱到 —— catalog 是开放扩展的，后续 PR 一张卡一文件
往 `catalog/` 里塞即可。

## Risks / Trade-offs

- **[Risk] Catalog 漂移**：标准轮换每年重做，过时 EffectDef 会污染
  开发实例（旧卡触发、新卡漏识）。→ Mitigation：catalog 文件加
  `validFromBuild` / `validUntilBuild?` 字段；测试断言「所有 active
  EffectDef 的 sourceCardId 都在当前 hsdata 里 collectible 卡集合中」。
- **[Risk] Power.log 解析失败导致 Tame Pet 池子永远空**：→ Mitigation：
  ActiveEffect.params 允许 undefined；UI 退化为「只显示效果存在」；
  失败/降级路径有单测覆盖。
- **[Risk] 双 BrowserWindow 状态不一致**：tab state 是 per-window
  的 React state，不同步。→ 这是 by-design：每个窗口独立切换 tab。
- **[Risk] In-game overlay 高度不够装 tab strip**：→ tab strip 设计成
  极简 24px 横条，整体高度只占面板原 header 一行的 1/3。空闲时
  Effects tab 显示淡灰，触发后变 accent，避免冗余视觉负担。
- **[Trade-off] 不接 HearthMirror**：等 Tame Pet 这类带 params 的卡多
  起来后可能需要直接读内存才能补齐。M1 先靠 Power.log；记录在
  Open Questions 里跟踪。

## Migration Plan

- **schema 兼容**：`DeckTrackerSnapshot.friendlyEffects` /
  `opposingEffects` 是 optional `T[] = []`。renderer 在收到旧 snapshot
  缺字段时按空数组解释；老 main 推 snapshot 不会让新 renderer 崩。
- **回滚**：渲染层把 TrackerPanelTabs 替换回直接 `<LiveDeckPanel />`
  即可；core 那边的 registry 即便仍写 effects 也不会影响 renderer。
- **数据持久化**：effects 是 per-match 衍生 state，不写 sqlite，对局
  结束自然丢弃；零迁移压力。

## Open Questions

1. Tame Pet 的 Power.log 模式具体是什么？需要在 implement 阶段抓一组
   real-game fixtures 来确认 entity-spawn 的标记。
2. 对手打出 Tame Pet 的池子是否会被 log 完整暴露？还是只在 friendly
   side 才能拿到 cardId？如果 opponent-side 解析不到 → params 永远
   degraded；UI 文案需要明确「对手已替换召唤池（具体 3 张未知）」。
3. 当 catalog 增长到 ≥ 30 个 effect 时，barrel `catalog/index.ts` 的
   手工维护是否还可接受？阈值确定后可考虑迁到 vite glob import。
4. 后续 mini-set / balance patch 改了某张卡的全局效果（比如 Cleansing
   Cleric 的 +2 改成 +1），EffectDef 的版本管理怎么做？M1 暂不处理，
   下一次 catalog 进化时再决定。

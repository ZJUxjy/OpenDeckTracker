## 1. core 类型 + deck-tracker 投影改造

- [x] 1.1 修改 `packages/core/src/tracker/types.ts`：
      - `OpponentCardRecord` 加 `created: boolean`
      - `DeckTrackerSnapshot` 加 `opponentClass: HeroClass | null`
      - 同步 export
      （注：core 中类型定义在 `tracker/deck-tracker.ts` 内联，已直接修改）
- [x] 1.2 修改 `packages/core/src/tracker/deck-tracker.ts` 的 `buildOpponentRecords()`：
      投影时把 `entity.info?.created ?? false` 写入 record
- [x] 1.3 在 deck-tracker 内部加 `opponentClassCache: HeroClass | null` + 解析逻辑：
      - 找 `game.opposingPlayer.entities` 中 cardId 匹配 `HERO_*` 的实体
      - 通过注入的 `cardLookup(cardId)` 拿 CardDef
      - cardClass ∈ {DEATHKNIGHT..WARRIOR} 时返回，否则 null
      - cache 在 onMatchStart / onMatchEnd 里清空
- [x] 1.4 写 / 更新单测 `packages/core/src/tracker/deck-tracker.test.ts`：
      - revealed 每条都有 `created: boolean`
      - `info.created === true` 的 entity → record.created === true
      - 对手是 MAGE hero 时 `snapshot.opponentClass === 'MAGE'`
      - hero entity 缺失但之前 set 过 → 沿用缓存值
      - 没有 cardClassLookup 时返回 null
- [x] 1.5 跑 `pnpm --filter @hdt/core test` 全绿（285 + 5 新增 = 290 tests）
- [x] 1.6 提交：`feat(deck-tracker-core): capture opponentClass + propagate created flag`

## 2. 预测引擎纯函数

- [x] 2.1 写 `packages/core/src/tracker/opponent-deck-prediction.test.ts`，覆盖：
      - 空 observation → `[]`
      - 全部 created → `[]`
      - class 过滤生效（MAGE 候选只剩 MAGE）
      - format 过滤生效
      - created 不进入 observed 多重集（"对手只打了一张 Fireball 但 created=true 的卡组不应该
        加分"）
      - observed ⊆ deck 时 score = 1.0
      - tiebreak by gamesCount desc
      - confidence: 3/7/12 → low/medium/high
      - topN 截断
      - 解码失败的 candidate 静默 drop
- [x] 2.2 实现 `packages/core/src/tracker/opponent-deck-prediction.ts` 导出
      `predictOpponentDecks(input)`：
      - 不依赖 `@hdt/hearthdb` / Buffer / electron
      - `deckCardLookup` 返回 `null` 时跳过
      - 算法严格按 design.md：observation-coverage IoU 变体 + tiebreak + confidence + topN
- [x] 2.3 在 `packages/core/src/index.ts` 重新导出预测函数 + 类型
- [x] 2.4 跑 `pnpm --filter @hdt/core test` 全绿（295 tests, 10 new for prediction）
- [x] 2.5 提交：`feat(opponent-deck-prediction): add pure prediction function in core`

## 3. 主进程 IPC + 推送

- [x] 3.1 写 `apps/desktop/src/main/opponent-deck-prediction-ipc.test.ts`（mock `electron.ipcMain`），覆盖：
      - 调 `opponent-deck-prediction:get` 返回 `OpponentDeckPrediction[]`
      - opponent.revealed 为空时返回 `[]`
      - 同样 snapshot + cache 调两次结果相等（idempotent）
      - 注入 mock snapshot/decks/cardDb，断言 push 走 `webContents.send('opponent-deck-prediction:update', ...)`
- [x] 3.2 实现 `apps/desktop/src/main/opponent-deck-prediction-ipc.ts`：
      - 暴露 `registerOpponentDeckPredictionIpc({ getSnapshot, getPopularDecks, getCardDb, onSnapshotChange })`
      - 内部 cached `deckstring → Map<cardId, count>`（按 (decks, cardDb) 引用键）
      - 内部 helper `computePredictions(snapshot, popularDecks, cardDb, lookup)`
      - subscribe 到 onSnapshotChange，每次 snapshot 推送时算 + `BrowserWindow.getAllWindows().forEach(win.webContents.send(...))`
      - 暴露 `dispose()` 拆 handler + 取消订阅
- [x] 3.3 修改 `apps/desktop/src/main/ipc.ts`，注册 prediction IPC，
      复用 `getPopularDecksList(...)` 拿 enriched decks + `onDeckTrackerSnapshotChange` 推送；
      `app.before-quit` 里调 dispose
- [x] 3.4 跑 `pnpm --filter @hdt/desktop test src/main/opponent-deck-prediction-ipc.test.ts` 全绿
- [x] 3.5 提交：`feat(opponent-deck-prediction): add IPC handler + push channel`

## 4. preload + 类型

- [x] 4.1 修改 `apps/desktop/src/preload/index.ts`：在 api 对象里加 `opponentDeckPrediction` 命名空间
- [x] 4.2 typecheck 通过（`HdtApi` 自动包含新 namespace）
- [x] 4.3 提交：`feat(preload): expose opponentDeckPrediction.get/onUpdate`

## 5. UI 区块

- [ ] 5.1 写 `apps/desktop/src/renderer/src/components/OpponentDeckPredictionSection.test.tsx`：
      - 空 predictions + 空 observed → 区块不在 DOM
      - 空 predictions + 非空 observed → 显示 "No matching popular decks"
      - top-1 显示 deck name + 职业 + 胜率 + 匹配分 + confidence badge
      - 创造卡 ≥ 1 时显示"已剔除 N 张创造卡"
      - 展开按钮显示 top2~5
- [ ] 5.2 实现 `OpponentDeckPredictionSection.tsx`：
      - props: `predictions: OpponentDeckPrediction[]`, `excludedCount: number`, `observedCount: number`
      - 折叠 / 展开 state（useState）
      - 用 `useTranslation` 走 i18n
- [ ] 5.3 修改 `OpponentCardsPanel.tsx`：
      - 在文件顶部用 `useEffect` 订阅 `window.hdt.opponentDeckPrediction.onUpdate`，初始挂载时调 `get()`，state 存 predictions
      - 从当前 snapshot 派生 `excludedCount = revealed.filter(c => c.created).length`
      - 在 revealed list 之上渲染 `<OpponentDeckPredictionSection .../>`
- [ ] 5.4 跑 `pnpm --filter @hdt/desktop test src/renderer/tests` 该区块测试全绿
- [ ] 5.5 提交：`feat(opponent-deck-prediction): add Predicted Deck section to OpponentCardsPanel`

## 6. i18n

- [ ] 6.1 在 `resources/locales/en-US.json` 加 `decks.opponentPrediction.*` 文案集（按 design 表）
- [ ] 6.2 在 `resources/locales/zh-CN.json` 加对应中文文案
- [ ] 6.3 提交：`feat(i18n): add opponent-deck-prediction strings`

## 7. 验证

- [ ] 7.1 `pnpm --filter @hdt/core test` 全绿
- [ ] 7.2 `pnpm --filter @hdt/desktop test` 全绿（除既有 App.i18n flake）
- [ ] 7.3 `pnpm --filter @hdt/desktop typecheck` 全绿
- [ ] 7.4 `pnpm --filter @hdt/desktop dev` 跑起来开一局：对手打几张牌后看预测区块出现，
      职业 / 胜率 / 匹配分显示正确；对手发现一张牌时"已剔除 N 张创造卡"出现
- [ ] 7.5 验证 mulligan 阶段不显示预测（因为 revealed 还没更新）
- [ ] 7.6 验证对手退场 / 重新进局 → 预测重置

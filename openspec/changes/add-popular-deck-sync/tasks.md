## 1. 解析器移植 + 单测

- [x] 1.1 创建目录 `apps/desktop/src/main/popular-decks-sync/` 和测试 fixture
      `apps/desktop/src/main/popular-decks-sync/__fixtures__/hsguru-meta.html`
      （从 `data/hsguru-data-spider/` 跑一次脚本截一份当前 HTML 落进 fixture）
      和 `__fixtures__/hsguru-archetype.html`
- [x] 1.2 写 `parser.test.ts`：
      - `parseLegendArchetypes(metaHtml)` 在 fixture 上返回 ≥ 1 条，每条字段齐全
      - `parseDeckVariants(archetypeHtml)` 在 fixture 上返回 ≥ 1 条，每条字段齐全
      - 空 HTML 输入两个函数都返回 `[]`，不抛
- [x] 1.3 实现 `parser.ts`，移植 spider 的 `decodeHtml` / `parseLegendArchetypes` /
      `parseDeckVariants` / `buildDeckUrls` 为命名导出 + TS 类型；跑 1.2 测试通过
- [x] 1.4 提交：`feat(popular-decks-sync): port HSGuru HTML parser to main process`

## 2. archetype 分类映射 + 单测

- [x] 2.1 写 `classifier.test.ts`：
      - 输入 `'Aggro Hunter'` → `'Aggro'`
      - 输入 `'Control Warrior'` → `'Control'`
      - 输入 `'Tempo Mage'` → `'Tempo'`
      - 输入 `'Combo Druid'` → `'Combo'`
      - 输入 `'Ramp Druid'` → `'Ramp'`
      - 输入 `'Big Priest'` 或 `'Whatever Foo'` → `'Midrange'`（兜底）
- [x] 2.2 实现 `classifier.ts` 导出 `classifyArchetypeLabel(label: string): PopularDeckArchetype`
      用关键字匹配表（大小写不敏感、按优先级 Combo > Tempo > Ramp > Aggro > Control > Midrange）
- [x] 2.3 提交：`feat(popular-decks-sync): add archetype label classifier`

## 3. 转换器（spider → PopularDeck）

- [x] 3.1 写 `transformer.test.ts`：
      - 给定一个真实 mage deckstring，转换后 `class === 'MAGE'`、`format` 与解码一致
      - 同样的 (archetype, deckId) 调用两次产生相同 `id`
      - 未知 archetype label 时 `archetype === 'Midrange'`
      - `author === 'hsguru'`，`updatedAt === fetchedAt.slice(0,10)`
      - 解码失败的 deckstring 被跳过（返回 null 而不是抛）
- [x] 3.2 实现 `transformer.ts` 导出 `transformVariant(archetype, variant, fetchedAt): PopularDeck | null`
      内部调用 `@hdt/hearthdb` `decodeDeck`、用 `classifyArchetypeLabel`
- [x] 3.3 提交：`feat(popular-decks-sync): add hsguru variant → PopularDeck transformer`

## 4. 持久化 storage + 单测

- [x] 4.1 写 `storage.test.ts`（用 `tmp` 目录）：
      - `loadCache(dir)` 返回 `null` 当文件不存在
      - `loadCache(dir)` 返回 `null` 当 JSON 损坏
      - `loadCache(dir)` 返回 `null` 当 `schemaVersion !== 1`
      - `loadCache(dir)` 返回 `null` 当任一 deck 缺字段
      - `saveCache(dir, snapshot)` 先写 `synced.json.tmp` 再 rename，最终读得回
      - 模拟"写 tmp 但 rename 前进程退出" → 现存 `synced.json` 仍可读
- [x] 4.2 实现 `storage.ts` 导出 `loadCache(dir) / saveCache(dir, snapshot)`，
      内部用 `fs.promises.writeFile` + `fs.promises.rename`
- [x] 4.3 提交：`feat(popular-decks-sync): add atomic synced.json persistence`

## 5. fetcher（net.fetch + abort + delay）

- [x] 5.1 写 `fetcher.test.ts`（mock `net.fetch`）：
      - 成功 fetch 返回 text
      - 非 2xx 抛 `Error('Request failed: <status>')`
      - `signal.aborted` 在循环中被检查 → 后续不发请求
      - 两次请求间隔 ≥ 1000ms（fake timers）
- [x] 5.2 实现 `fetcher.ts` 导出 `fetchHsguruMeta(signal) / fetchHsguruArchetypeVariants(label, signal)`
      内部用 Electron `net.fetch`，1s delay，45s 超时（与 spider 一致）
- [x] 5.3 提交：`feat(popular-decks-sync): add electron net.fetch wrapper with abort + throttle`

## 6. sync 协调器 + IPC

- [x] 6.1 写 `index.test.ts`：
      - `startSync()` 在已有 sync 运行时返回 `{ ok: false, error: 'already-syncing' }`
      - `startSync()` 触发的 progress events 至少包含 4 个 phase（meta/variants/transform/persist）
      - `getStatus()` 在 sync 完成后返回 `{ inFlight: false, lastFetchedAt: <iso> }`
      - 解析返回 0 条时 `startSync` 返回 `{ ok: false, error: 'parse-failed' }` 且不写 cache
- [x] 6.2 实现 `index.ts` 导出 `startSync(progressCb, signal) / getStatus() / loadCache()`，
      串联 fetcher → parser → transformer → storage，实现互斥锁、进度回调
- [x] 6.3 写 `ipc.test.ts`：
      - 注册三个通道后 `ipcMain.listenerCount('popular-decks:sync-start') === 1` 等
- [x] 6.4 实现 `ipc.ts` 导出 `registerPopularDecksSyncIpc()`：
      - `ipcMain.handle('popular-decks:sync-start', ...)`
      - `ipcMain.handle('popular-decks:sync-status', ...)`
      - sync 内部 progress 回调 → `webContents.send('popular-decks:sync-progress', payload)`
        （遍历 `BrowserWindow.getAllWindows()` 广播，避免依赖具体 window 引用）
- [x] 6.5 在 `apps/desktop/src/main/ipc.ts` 的 `registerIpc` 里调用
      `registerPopularDecksSyncIpc()`，并在 `app.before-quit` 注册 abort 钩子
- [x] 6.6 提交：`feat(popular-decks-sync): add sync orchestrator + IPC channels`

## 7. 修改 popular-decks:list IPC 数据源

- [x] 7.1 修改 `apps/desktop/src/main/popular-decks-ipc.ts`：
      - 启动时调用 `loadCache(userDataDir)` 一次，结果存模块级 `let cachedSnapshot`
      - sync 完成事件触发时（通过 EventEmitter 或重新 loadCache）刷新 `cachedSnapshot`
      - `popular-decks:list` handler 改为返回
        `{ decks, source: 'synced' | 'seed', fetchedAt }`，根据 cachedSnapshot 选择来源
- [x] 7.2 更新该文件的现有单测以断言新返回 shape；增加两个测试：
      - cache 存在 → `source === 'synced'`、`fetchedAt` 与 cache 一致
      - cache 缺失 → `source === 'seed'`、`fetchedAt === null`、`decks` 长度 == seed 长度
- [x] 7.3 提交：`feat(deck-finder-ipc): switch popular-decks:list to synced cache with seed fallback`

## 8. preload API

- [x] 8.1 修改 `apps/desktop/src/preload/index.ts`：在 `popularDecks` 命名空间下追加
      `syncStart()`, `syncStatus()`, `onSyncProgress(cb)` 方法
      （`onSyncProgress` 内部用 `ipcRenderer.on` 包装并返回 `() => ipcRenderer.removeListener(...)`）
- [x] 8.2 同步更新 preload 类型导出，确保 `HdtApi` 包含新签名
- [x] 8.3 提交：`feat(preload): expose popularDecks.syncStart/syncStatus/onSyncProgress`

## 9. DeckFinderTab UI

- [x] 9.1 在 `apps/desktop/src/renderer/src/components/DeckFinderTab.tsx` 顶部加
      sync 控制行：sync 按钮、上次更新时间标签、（条件渲染的）进度条
- [x] 9.2 用 `useEffect` 在挂载时订阅 `window.hdt.popularDecks.onSyncProgress`，
      卸载时调用返回的 unsubscribe
- [x] 9.3 点按钮调用 `syncStart()`：成功后重新调用 `list()` 刷新 grid；失败显示错误（toast 或
      行内）；失败保留旧 grid 数据
- [x] 9.4 按钮在 `inFlight` 期间 `disabled`；在挂载时通过 `syncStatus()` 拿初始 inFlight 状态
      （主进程退出再开启时 inFlight 必为 false）
- [x] 9.5 提交：`feat(deck-finder-ui): add manual sync button + progress UI to DeckFinderTab`

## 10. i18n

- [x] 10.1 在 `resources/locales/en-US.json` 的 `decks.finder` 下加：
      `syncButton: "Sync popular decks"`,
      `syncing: "Syncing... ({phase})"`,
      `lastUpdated: "Last updated: {date}"`,
      `lastUpdatedNever: "Never synced"`,
      `syncErrorNetwork: "Network error — check your connection or proxy"`,
      `syncErrorParse: "HSGuru data format changed — try again later"`,
      `syncErrorAlreadySyncing: "Sync already in progress"`,
      `syncErrorUnknown: "Sync failed"`
- [x] 10.2 在 `resources/locales/zh-CN.json` 加对应中文文案
- [x] 10.3 提交：`feat(i18n): add popular-decks sync strings`

## 11. 验证

- [x] 11.1 `pnpm --filter @hdt/desktop test` 全绿（除既存的 App.i18n 多匹配 flake，与本 change 无关）
- [x] 11.2 `pnpm --filter @hdt/desktop typecheck` 全绿
- [x] 11.3 `pnpm dev` 跑起来，DeckFinderTab 顶部按钮可点；
      点一次完成同步（实测 35s，meta 84KB → 16 archetypes → 77 variants → 72 valid decks
      → 写入 `<userData>/@hdt/desktop/popular-decks/synced.json`，IPC 返回
      `{ ok: true, count: 72 }`）。重启 + 删除快照场景由用户验收时再覆盖。
- [~] 11.4 离线场景未实测——单测覆盖了 `network-failed` 错误码与 UI 错误文案映射，
      runtime 实测留作后续。
- [x] 11.5 无需 lint 修复

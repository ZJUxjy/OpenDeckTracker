# OpenDeckTracker v0.5.0 beta

First public test build. Use this version to verify the installer /
launch path / Hearthstone integration on real machines. Data shape and
IPC contracts MAY shift before v1.0 — do not depend on saved decks /
stats / recordings surviving a future migration without notice.

**首个公开测试版**。装这个版本主要是验证安装流程、启动链路、和炉石联动在真实机器上是否正常工作。在 v1.0 之前数据结构和 IPC 协议**可能会改**——请不要假设当前保存的卡组 / 战绩 / 录像在以后的版本里一定保留得住。

## Two install forms / 两种安装形态

- **`OpenDeckTracker-Setup-0.5.0-beta.exe`** — NSIS installer (~95 MB).
  Standard install path under `%LOCALAPPDATA%\Programs\OpenDeckTracker\`,
  creates a Start Menu shortcut, uninstall via "Add or Remove Programs".
  **Recommended for normal use.**
- **`OpenDeckTracker-0.5.0-beta-win-x64-portable.zip`** — portable bundle
  (~131 MB). Unzip anywhere, double-click `OpenDeckTracker.exe` inside the
  unzipped folder. No registry writes, no Start Menu entry, and no
  SmartScreen "untrusted publisher" prompt during install (you'll see it
  on first launch instead).

Both share `%APPDATA%\OpenDeckTracker\` for user data, so you can switch
between them without losing decks / stats / recordings.

中文说明：

- **`OpenDeckTracker-Setup-0.5.0-beta.exe`** — 标准安装包（约 95 MB）。
  装到 `%LOCALAPPDATA%\Programs\OpenDeckTracker\`，建开始菜单快捷方式，
  可以从"添加或删除程序"卸载。**普通用户推荐这个**。
- **`OpenDeckTracker-0.5.0-beta-win-x64-portable.zip`** — 免安装版
  （约 131 MB）。解压到任意位置，双击文件夹里的 `OpenDeckTracker.exe`
  就能用。不写注册表、不建快捷方式，**安装阶段没有 SmartScreen 警告**
  （首次启动时仍会弹一次）。

两种形态共用 `%APPDATA%\OpenDeckTracker\` 这个用户数据目录，所以你
随时可以从安装版切到免安装版（或反过来），卡组 / 统计 / 录像不会丢。

## ⚠️ Install warnings / 安装注意事项

- **Windows SmartScreen will block the installer / `.exe` on first run.**
  This build is not yet code-signed; SmartScreen flags any unsigned `.exe`
  from a new publisher as untrusted. To proceed:
  1. Click "More info" on the SmartScreen prompt.
  2. Click "Run anyway".
  An OV / EV code-signing certificate is on the roadmap for v1.0 — at
  which point SmartScreen reputation accumulates over the first few
  hundred installs and the prompt eventually goes away.
- **The installer runs per-user** — no admin elevation required.
- **A handful of low-reputation AV scanners** (mostly domestic ones)
  flag unsigned Electron apps. False positive. Either whitelist the
  install directory or wait for code-signing.

中文说明：

- **Windows SmartScreen 会拦截首次运行**。这版还没做代码签名；任何
  未签名、来自"新发布者"的 `.exe` 都会被标成不可信。绕过方法：
  1. SmartScreen 弹窗里点"详细信息"
  2. 点"仍要运行"
  v1.0 计划上代码签名证书，签名之后随着前几百次安装积累信誉，
  SmartScreen 警告会逐渐消失。
- **安装器是 per-user 的**，不需要管理员权限。
- **个别国产杀软**对未签名 Electron 应用会误报"可疑"。是误报。
  把安装目录加白名单即可，或者等签名落地。

## What's in this build / 本版本包含什么

This is mostly internal hardening — the goal is to verify install /
launch / persistence on testers' machines. User-facing surface:

- **Main window**: Tracker / Decks / Stats / Collection + Settings nav.
  Three placeholder routes (Opponent / Lethal / Replay) and their
  Dashboard ad cards are hidden until they're real features.
- **Default UI style is macOS Tahoe.** Other styles (Tavern / Fallout 76
  / WeChat Dark) are reachable via Settings → Appearance → UI style.
- **Live deck tracker overlay** + **opponent overlay** anchored to the
  Hearthstone game window. Each carries a four-tab panel: deck list,
  active global effects, graveyard, narration.
- **Live game narration panel** in the player overlay — running
  transcript of who played what, generated from the same pipeline that
  feeds the post-match replay analyzer. Translated for zh-CN.
- **Ebonok (时光领主埃博克 / TIME_714) hover preview** showing which
  opponent minions remain from the prior opponent turn, with empty-pool
  highlight warning before you commit Ebonok.
- **Cost-reduction giant-series** hover lines (current count → resulting
  cost) for Felfused Fel-Fisher (邪能浮宝鱼师) and related cards.
- **Bottom version pill** for at-a-glance build identification.

中文说明：本版本以内部加固为主——主要是想在测试者的机器上把
"装得上、跑得起来、数据存得住"这条路验完。用户看得见的部分：

- **主窗口**：记牌器 / 卡组 / 统计 / 收藏 + 右上角设置。三个占位
  路由（Opponent / Lethal / Replay）和首页对应的广告位卡片**已隐藏**，
  等功能真做出来再露出。
- **默认主题切到 macOS Tahoe**。Tavern / Fallout 76 / WeChat 暗色等
  其它皮肤可以在 设置 → 外观 → UI 风格 里切换。
- **场内记牌覆盖层**（己方 + 对方）会贴在炉石游戏窗口边上。每个覆盖层
  上有 4 个 tab：卡组、全局效应、墓地、实时旁白。
- **实时旁白面板**（己方覆盖层）—— 滚动展示双方出牌历史，跟赛后录像
  分析器同一套生成管线。中文已翻译。
- **时光领主埃博克（TIME_714）悬停预览**——展示对方上一回合打下来
  且仍在场上的随从。空池子时有高亮警告，避免你打了埃博克扑空。
- **巨人系减费提示**——邪能浮宝鱼师等卡片的悬停文字会显示"已减费用 →
  当前费用"。
- **底部版本药丸**，看一眼就知道当前是哪个 build。

## What's been hardened in this beta / 这版本做了哪些加固

- **Lethal calculator throttled** to turn boundaries instead of running
  on every Power.log event — significant CPU reduction during the
  opponent's turn.
- **Hardened path-traversal in `recordings:get` IPC** — `recordingId` is
  now validated against a separator / NUL / `..` allowlist with a
  base-dir containment check.
- **Spectator round-trip no longer leaks per-match state** — entering
  spectator mid-match and starting a new live match used to leave the
  global-effects registry, extra-display counters, and identified deck
  pointing at the previous game's state.
- **Native addons properly unpacked from app.asar** — fixed the silent
  failure path where `better-sqlite3` and `@hdt/hearthmirror-native`
  weren't loadable in packaged builds.
- **Auto-update wired to GitHub Releases** (this release feed).
- **userData renamed** from `%APPDATA%\@hdt\desktop\` to
  `%APPDATA%\OpenDeckTracker\`. One-shot migration runs on first launch
  for testers of pre-v0.5 builds; existing data is preserved in-place.
- **SQLite stores explicitly closed on quit** — deckStore, stats,
  player-profile, and collection-snapshot databases now checkpoint
  their WAL on `before-quit` instead of relying on OS cleanup.

中文说明：

- **斩杀计算器节流到回合边界**——之前每次 Power.log 事件都会重算，
  对方回合时 CPU 占用明显，现在只在回合切换时算。
- **`recordings:get` IPC 的路径穿越漏洞已修**——`recordingId` 现在
  会校验分隔符 / NUL / `..` 白名单，并做 base-dir 容纳检查。
- **观战来回切换不再泄漏对局状态**——以前观战期间进入再退出再开新对局，
  全局效应、附加显示计数器、已识别的卡组指针仍指着上一局，本版本修复。
- **原生模块正确从 app.asar 解压**——修了之前打包版里 `better-sqlite3` 和
  `@hdt/hearthmirror-native` 无法加载的隐藏 bug。
- **自动更新接到 GitHub Releases**（也就是本 release feed）。
- **用户数据目录改名**，从 `%APPDATA%\@hdt\desktop\` 迁到
  `%APPDATA%\OpenDeckTracker\`。首次启动时一次性自动迁移，老版本测试者
  的数据原地保留。
- **SQLite 数据库在退出时显式关闭**——deckStore、stats、player-profile、
  collection-snapshot 现在在 `before-quit` 时主动 checkpoint WAL，不再
  依赖操作系统兜底。

## Known limitations / 已知限制

- **Card art is fetched on demand from `art.hearthstonejson.com`** the
  first time each card appears. If that CDN is slow or blocked from your
  network (occasionally an issue in mainland China), expect 200–500 ms
  latency for new cards and possible placeholder cards on a cold
  profile. Cached locally after first fetch — subsequent appearances
  work offline.
- **Auto-update** checks fire on launch and again every 6 hours. The
  prerelease channel is opt-in; users on a future stable channel will
  NOT auto-update into a beta.
- **No macOS / Linux build** in this beta. Windows x64 only.
- **One pre-existing core test failure** (`hsdata-coverage` against a
  specific set ID) is known and accepted; does not affect runtime
  behavior, will be cleaned up in a follow-up.

中文说明：

- **卡牌图片首次按需从 `art.hearthstonejson.com` 下载**。这个 CDN
  在大陆有时慢甚至无法访问，第一次见到某张卡可能加载 200–500 ms，
  全新档案下还可能临时显示占位卡面。第一次拉过后本地缓存，下次离线
  也能显示。
- **自动更新**在启动时检测一次，之后每 6 小时一次。Prerelease 通道是
  显式 opt-in 的，未来正式版用户不会被自动推到 beta 上。
- **本测试版只有 Windows x64**，没有 macOS / Linux 构建。
- **有一项已知的 core 测试失败**（`hsdata-coverage` 针对某个特定卡牌
  系列），不影响运行时行为，后续清理。

## Reporting issues / 反馈问题

File a GitHub issue at https://github.com/ZJUxjy/OpenDeckTracker/issues
with:

- App version (bottom-left pill, e.g. `v0.5.0 beta`)
- Hearthstone log directory and first error message from main-process
  stderr if you have one
- Repro steps

For crashes, the relevant log lives at `%APPDATA%\OpenDeckTracker\logs\` —
attaching the tail of that file is very helpful.

中文说明：在 https://github.com/ZJUxjy/OpenDeckTracker/issues 提 issue，
最好带上：

- 当前版本号（左下角药丸，例如 `v0.5.0 beta`）
- 你的炉石日志目录路径 + 主进程 stderr 报的第一行错误（如果有）
- 复现步骤

崩溃日志在 `%APPDATA%\OpenDeckTracker\logs\` 下，附上文件末尾几十行
帮助很大。

## File integrity / 文件完整性

- Installer: `OpenDeckTracker-Setup-0.5.0-beta.exe` (~95 MB)
- Portable: `OpenDeckTracker-0.5.0-beta-win-x64-portable.zip` (~131 MB)
- SHA-512 for the installer: see `sha512` field in `latest.yml`
  attached to this release.

---

Not affiliated with Blizzard Entertainment. Hearthstone is a trademark
of Blizzard Entertainment, Inc.

非暴雪娱乐官方产品，与暴雪娱乐无关联。Hearthstone（炉石传说）是
Blizzard Entertainment, Inc. 的商标。

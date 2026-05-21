<h1 align="center">OpenDeckTracker</h1>

<p align="center">
  An open-source <b>Hearthstone deck tracker</b> for Windows, written in TypeScript + Rust.<br>
  开源的炉石传说<b>记牌器</b>，基于 TypeScript 与 Rust 编写。
</p>

<p align="center">
  <a href="https://github.com/ZJUxjy/OpenDeckTracker/releases/latest">
    <img alt="Latest release" src="https://img.shields.io/github/v/release/ZJUxjy/OpenDeckTracker?include_prereleases&label=latest&style=flat-square">
  </a>
  <a href="https://github.com/ZJUxjy/OpenDeckTracker/releases/latest">
    <img alt="Downloads" src="https://img.shields.io/github/downloads/ZJUxjy/OpenDeckTracker/total?style=flat-square">
  </a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20x64-blue?style=flat-square">
  <img alt="License" src="https://img.shields.io/github/license/ZJUxjy/OpenDeckTracker?style=flat-square">
</p>

---

## 🎯 Download / 下载

**v0.5.0 beta** is the first public test build. Two install forms available:

**v0.5.0 beta** 是首个公开测试版，提供两种安装形态：

| | EN | 中文 |
|---|---|---|
| **Installer** | NSIS installer (~95 MB), registers Start Menu shortcut + uninstaller. Recommended for normal use. | 标准安装包（约 95 MB），自动建开始菜单快捷方式 + 卸载入口。**推荐普通用户**。 |
| **Portable** | Zip bundle (~131 MB), unzip anywhere and run. No registry writes, no install. | 免安装版（约 131 MB），解压即用，不写注册表。 |

👉 **Get it: [Releases page](https://github.com/ZJUxjy/OpenDeckTracker/releases/latest)** —— 下载地址：[Releases 页面](https://github.com/ZJUxjy/OpenDeckTracker/releases/latest)

> ⚠️ Windows SmartScreen will warn about an "unknown publisher" because this beta isn't yet code-signed. Click **More info → Run anyway** to proceed. See the release notes for the full walkthrough.
>
> ⚠️ Windows SmartScreen 会因为本测试版尚未代码签名而提示"未知发布者"。点 **详细信息 → 仍要运行** 即可继续。详细说明见 release notes。

## ✨ Features / 主要功能

- **Live deck tracker** — your remaining deck, your hand, and your opponent's revealed cards, anchored to the Hearthstone game window.
- **Match recordings & replay narration** — every match is recorded; a turn-by-turn narration is generated for review.
- **Stats & history** — win-rate aggregation, format / class breakdown, opponent reveal log.
- **Collection progress** — see how close you are to "all collectible cards" per set.
- **Bilingual UI** — full English / 简体中文 interface.
- **Live overlays** — separate player + opponent panels with deck list, active global effects, graveyard, and live narration tabs.
- **Privacy-first** — everything runs locally. No game data leaves your machine; the only outbound calls are card-art fetches to a public CDN.

中文说明：

- **场内实时记牌**——己方剩余卡组、己方手牌、对方已揭示卡，覆盖层贴在炉石窗口边上。
- **对局录像 + 旁白复盘**——每局自动录像，按回合生成可读旁白，方便事后复盘。
- **战绩与统计**——胜率聚合、模式/职业分布、对手揭示卡 log。
- **收藏进度**——按系列展示离"全收齐"还差多少。
- **中英文双语界面**——简体中文 + 英文均可切换。
- **可分置覆盖层**——己方 / 对方各自一个面板，含卡组列表、全局效应、墓地、实时旁白 4 个 tab。
- **本地优先**——一切运行在本机，游戏数据不外传。唯一会请求的外网是公共 CDN 的卡牌图片。

## 🛠 System Requirements / 系统要求

- **OS**: Windows 10 / 11, x64
- **Hearthstone**: latest live client (running in DirectX mode, default)
- **Disk**: ~500 MB after install (cached card images grow over time, capped via LRU)
- **Memory**: <300 MB typical
- **Network**: required for first-time card-image downloads and auto-update checks; gameplay tracking itself is fully local

中文：仅支持 64 位 Windows 10 / 11；炉石使用最新正式版客户端、默认 DX 渲染；安装后磁盘约 500 MB（卡图缓存按 LRU 上限自动回收）；内存常驻 300 MB 左右；首次下载卡图和检查更新需要网络，对局期间的追踪是完全本地的。

## 🚀 Quick start (users) / 普通用户快速上手

1. Download the installer or portable zip from the [latest release](https://github.com/ZJUxjy/OpenDeckTracker/releases/latest).
2. Run it. If SmartScreen complains, click "More info → Run anyway".
3. Launch Hearthstone. Open OpenDeckTracker. The tracker auto-detects the running game.
4. Settings → Appearance gives you UI style (macOS / Tavern / Fallout 76 / WeChat) and accent color.

中文步骤：

1. 从 [最新 release](https://github.com/ZJUxjy/OpenDeckTracker/releases/latest) 下载安装包或免安装包。
2. 双击运行。SmartScreen 警告时点"详细信息 → 仍要运行"。
3. 打开炉石客户端，启动 OpenDeckTracker；本程序会自动检测到运行中的炉石进程。
4. 设置 → 外观 里可以切 UI 风格（macOS / Tavern / Fallout 76 / 微信暗色）和强调色。

## 👩‍💻 For developers / 给开发者

### Prerequisites / 前置

- **Node.js** ≥ 20 LTS
- **pnpm** ≥ 9 (install via `corepack enable`; repo pins `pnpm@10.10.0`)
- **Rust** stable (for rebuilding `@hdt/hearthmirror-native`; not needed for normal contributor work)
- **Hearthstone** installed locally (for hands-on testing)

### Dev loop / 开发循环

```bash
corepack enable           # picks up the pinned pnpm version
pnpm install              # installs all workspace deps
pnpm cards:convert        # first-time: generate card JSON from data/cards/hsdata/CardDefs.xml
pnpm dev                  # launches Electron with HMR
```

### Common scripts / 常用脚本

| Command | Purpose |
|---|---|
| `pnpm dev` | Launch desktop with HMR / 启动开发模式 |
| `pnpm build` | Build all workspace packages / 编译所有包 |
| `pnpm lint` | ESLint across packages / 跨包 lint |
| `pnpm typecheck` | Strict TypeScript check / 严格类型检查 |
| `pnpm test` | Vitest across workspace / 跨包测试 |
| `pnpm --filter @hdt/desktop package` | Produce a Windows NSIS installer + portable build / 出 Windows 安装包和免安装版 |
| `pnpm cards:convert` | Generate runtime card JSON / 生成运行时卡牌 JSON |

### Repo layout / 仓库结构

```
apps/desktop/      Electron app (main / preload / renderer)
packages/
  core/            Pure domain — deck tracker state machine, stats, recordings
  hearthdb/        Card database, deck-string codec
  hearthmirror/    TypeScript wrapper around the napi-rs bridge
  hearthmirror/native/  Rust crate — reads Hearthstone process memory
  hearthwatcher/   Tails Power.log
  shared/          Cross-package types and constants
data/cards/        Card data source + generated JSON
openspec/          Spec-driven workflow (proposals / specs / tasks)
docs/              Design references, ADRs, spike reports
```

### Contributing / 贡献流程

1. Open an issue first if the change is non-trivial, so we can align on direction.
2. Write the proposal under `openspec/changes/<name>/` following the [OpenSpec](https://github.com/openspec/openspec) convention (`proposal.md` / `design.md` / `specs/` / `tasks.md`).
3. Implement TDD-style — failing test → minimal code → green → commit.
4. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:` / `fix:` / `chore:` / `build:` / `docs:` / `refactor:` / `test:` / `ci:`).
5. PR triggers CI (`.github/workflows/ci.yml`) — must be green to merge.
6. After implementation, `openspec validate <name> --strict` and `openspec archive <name>`.

中文流程：非小改动请先开 issue 对齐方向；按 OpenSpec 在 `openspec/changes/<name>/` 写好 proposal / design / specs / tasks 再实施；TDD 优先（先红再绿）；提交信息遵循 Conventional Commits；PR 跑通 CI 才能合并；功能落地后 `openspec validate` + `openspec archive` 归档。

## 📌 Project status / 项目状态

Pre-1.0. This project is in beta — APIs, persistence shape, and IPC contracts may still change between releases. The current public release (`v0.5.0-beta`) focuses on verifying install / launch / persistence on real machines before broader rollout. See [`RELEASE_NOTES.md`](./RELEASE_NOTES.md) for what's in each release.

Foundational subsystems (matched against `openspec/changes/`):

- ✅ Monorepo skeleton, Electron three-segment build, CI
- ✅ HearthMirror Rust bridge (`@hdt/hearthmirror-native`)
- ✅ Card database (`@hdt/hearthdb`) — JSON loader + deckstring codec
- ✅ Deck tracker domain (`@hdt/core/tracker`) — phase machine + remaining algorithm + extra display
- ✅ Match recordings + replay analysis narration
- ✅ Stats & match history aggregation
- ✅ Collection progress
- ✅ Console theme system (macOS Tahoe default)
- ✅ Live deck overlays (player + opponent)
- 🚧 Opponent deck prediction
- 🚧 Lethal calculator (full UI)
- 🚧 Global-effects extended catalog
- 🚧 Replay viewer surface
- ⏳ Code signing certificate (will remove the SmartScreen warning)
- ⏳ macOS / Linux builds

中文：1.0 之前的预发布阶段，**API、数据格式、IPC 协议在 release 间仍可能调整**。当前对外版本 `v0.5.0-beta` 主要用于在真实机器上验证安装 / 启动 / 数据持久化链路，再扩大邀请。每次发版的细节见 [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)。

## ⚖️ License & disclaimer / 许可证与免责声明

Source code is released under the repository's [LICENSE](./LICENSE). Third-party components are listed in [`THIRD_PARTY_NOTICES.txt`](./THIRD_PARTY_NOTICES.txt).

**Not affiliated with Blizzard Entertainment.** Hearthstone is a trademark of Blizzard Entertainment, Inc. This is a third-party fan tool that reads publicly available game state on the player's local machine. It does not modify the game, automate gameplay, or transmit anything to or from Blizzard servers.

源代码在仓库 [LICENSE](./LICENSE) 之下发布，第三方组件见 [`THIRD_PARTY_NOTICES.txt`](./THIRD_PARTY_NOTICES.txt)。

**与暴雪娱乐无关联**。Hearthstone（炉石传说）是 Blizzard Entertainment, Inc. 的商标。本项目为第三方爱好者工具，仅在玩家本机读取公开可见的游戏状态，**不修改游戏行为、不自动操作、不与暴雪服务器进行任何通信**。

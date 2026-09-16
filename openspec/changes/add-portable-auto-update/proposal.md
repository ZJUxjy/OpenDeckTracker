## Why

Windows ZIP 用户需要在应用内完成更新，避免每次手工下载覆盖。这补齐 DEVELOPMENT_PLAN.md 中的桌面分发能力，沿用已交付的安装版更新界面。

## What Changes

- 已打包的 Windows ZIP 支持检测稳定版本、下载校验、确认后退出替换并重启。
- 独立更新助手负责安全解压、逐文件备份、失败回滚；保留用户数据及无关文件。
- 发版元数据增加 ZIP 的 SHA-512 和大小，发布校验及 Windows 集成测试覆盖便携更新。

## Capabilities

### New Capabilities
- `portable-auto-update`: Windows ZIP 便携应用原地更新。

### Modified Capabilities
无已归档 capability 修改；此能力扩展 add-desktop-auto-update 的支持范围。

## Impact

Electron 主进程、Windows PowerShell 助手、electron-builder 配置、发布验证、更新提示及分发文档。

## Non-goals

开发版更新、macOS/Linux、自提权、静默安装、改写已发布 v0.7.0、自动发布新版本、断电下的跨文件原子事务。

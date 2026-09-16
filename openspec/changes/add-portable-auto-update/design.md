## Context

0.7.0 的 NSIS 更新已实现，ZIP 与开发版被拦截。此次保留 IPC 和 React UI，增加 ZIP 分支。

## Goals / Non-Goals

Goals: Windows x64 ZIP 应用内更新，校验、确认、恢复、重启与安装版兼容。
Non-Goals: 开发版、自提权、断电原子性、覆盖 v0.7.0 或自行发布新版本。

## Decisions

### Feed and download
- Context: 已有 electron-updater 6.8.3（lockfile 与本地实现已核对）、Electron 37.2.6、builder 25.1.8。
- Options: 自写 GitHub API/下载器；复用 AppUpdater。
- Choice: subclass AppUpdater，选 ZIP，复用稳定版本比较、HTTPS、SHA-512、缓存及进度；打包后将 ZIP 加入 latest.yml.files，保留 NSIS 顶层字段。
- Rationale: 避免两套版本策略，不新增 npm 依赖。已核对 executeDownload 的 done 钩子在缓存命中时也执行。

### Replacement
- Context: Windows 锁定运行中的 EXE/DLL，解压目录可能包含用户其他文件。
- Options: 整目录替换；独立助手逐文件事务。
- Choice: Windows 自带 PowerShell 5.1/.NET ZipArchive 助手复制到独立临时目录，不参与被替换的应用文件；下载完成后先解压校验到应用目录内的唯一临时目录，确认重启后独立进程等待退出，逐文件备份/替换，失败逆序恢复并启动旧版。
- Rationale: 同卷移动避免跨卷部分复制；不移动整个用户目录，不触碰 userData，不删除 ZIP 未声明的旧文件。保留旧版本独有文件的空间代价可接受，未来可增加构建文件清单。

### Handoff and failure reporting
- Context: PowerShell 可能被策略禁止，父进程不能先退出再发现助手未启动。
- Options: fire-and-forget；stdout ready 握手。
- Choice: 助手完成准备/校验后输出 READY，主进程收到才 app.quit；退出等待有超时；失败写 userData 结果文件，重启后显示可重新检查的错误。
- Rationale: 启动失败可留在当前 UI 重试；正常退出不会擅自更新。

## File tree

```text
apps/desktop/src/main/
  auto-update.ts
  portable-updater.ts
  portable-update-helper.ts
apps/desktop/build/portable-update.ps1
scripts/
  add-portable-update-metadata.mjs
  verify-release.mjs
  smoke-portable-update.ps1
```

## Risks / Trade-offs

- Performance: 完整 ZIP + 解压 + 旧文件备份需要额外磁盘空间；解压在子进程进行，失败在退出前呈现。
- Security: SHA-512；拒绝越界、重名、ADS、设备路径、符号链接和 reparse point；所有移动删除前检查绝对路径；不拼接 shell 命令；限制 ZIP 条目和解压大小。
- Compatibility: Windows 10/11 x64、PowerShell 5.1；目录不可写直接报错，不申请管理员权限；锁定文件触发回滚。
- Reliability: 替换错误可以回滚；突然断电无法保证事务原子性。异常备份保留在临时目录供恢复。成功启动指进程创建成功，不保证新版本业务逻辑无错误。

## Migration Plan

后续发版包含新代码、助手及 ZIP 元数据。0.7.0 ZIP 首次需手动升级，之后可应用内更新。此次不改变公开 release。

## Open Questions

无阻塞问题。

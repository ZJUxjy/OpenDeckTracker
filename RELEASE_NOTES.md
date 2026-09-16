# OpenDeckTracker v0.7.1

## 便携版自动更新 / Portable in-app updates

- Windows ZIP 便携版现在也会在启动时及每 6 小时自动检查新版本。
- 在 **设置 → 关于** 中点击下载，查看进度；下载并校验完成后，确认重启即可自动替换文件并启动新版，无需手动下载重装。
- 更新保留原有设置、卡组、收藏、战绩及解压目录中的无关文件。文件被占用等替换失败会回滚已替换的文件，并重新启动旧版。
- 更新前校验 ZIP 的 SHA-512 和解压路径；损坏下载可重试。普通退出不会自动安装，也不会在对局中强制重启。
- Windows portable ZIP builds now check for stable releases, download and verify on demand, then replace files and relaunch after confirmation. Failed replacements roll back and restart the old copy; existing player data is preserved.

## 更新方式 / How to upgrade

- **v0.7.0 安装版：** 可直接在应用内检查更新并升级到 v0.7.1。
- **v0.7.0 及更早的 ZIP 便携版：** 需要手动下载 v0.7.1 ZIP、退出旧版后解压使用一次。此后发布更高版本时，即可通过应用内更新按钮升级。
- **v0.6.0 及更早的安装版：** 需要手动运行 v0.7.1 Setup 安装包一次。
- 便携更新需要目录可写、Windows PowerShell 可用；开发版不支持自动更新。
- Installed v0.7.0 can update in-app. Older portable builds require one manual upgrade to v0.7.1 to enable future in-app updates. Installed v0.6.0 and earlier also require a manual upgrade. Development builds remain unsupported.

## 下载文件 / Downloads

- `OpenDeckTracker-Setup-0.7.1.exe`：Windows x64 安装版。
- `OpenDeckTracker-0.7.1-win.zip`：Windows x64 便携版，解压后运行 `OpenDeckTracker.exe`。
- `latest.yml` 和 `.exe.blockmap` 为应用自动更新所需文件，玩家无需手动下载。

本测试版本尚未代码签名，Windows 可能显示未知发布者提示。This beta remains unsigned.

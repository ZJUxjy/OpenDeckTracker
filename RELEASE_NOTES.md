# OpenDeckTracker v0.7.0

## 应用内更新 / In-app updates

- Windows 安装版启动时及每 6 小时自动检查 GitHub Releases，主界面提示新版本。
- 在设置 → 关于中检查更新、查看更新说明；点击“立即更新”后才开始下载，并显示进度。
- 下载完成后由玩家确认“重启并安装”，不会在对局中强制重启，也不会在普通退出时自动安装。
- 下载失败可重试；保留原有设置、卡组、收藏和对局记录的存储位置。
- Windows installations now check GitHub Releases on launch and every six hours. Download on demand, see progress, and confirm restart to install. Updates never force a restart or install on ordinary exit.

## 本次一并发布 / Also included

- 追踪分析：关键卡抽取概率、疲劳/爆牌风险、对手公开手牌时间线和资源分组。
- 对局复盘与统计：起手留牌统计、回放关键回合与标注、卡组版本对比。
- 桌面界面与设置控件更新，热门卡组同步和卡牌数据更新。
- Tracker analysis, replay/statistics improvements, refreshed desktop controls, and card/deck data fixes from the current development snapshot.

## 安装说明 / Installation

- **v0.6.0 及更早版本需要手动下载安装 v0.7.0 一次。** 旧版内置占位更新地址，不能自动发现本次发布。以后更高版本可通过安装版内的更新按钮升级。
- **ZIP 便携版不支持原地自动更新。** 希望使用自动更新的玩家请选择 Setup.exe 安装版。
- Older versions require one manual install of v0.7.0 to enable future in-app updates. Portable ZIP builds continue to update manually.
- 本测试版本尚未代码签名，Windows 可能显示未知发布者提示。The beta remains unsigned.
- 这是 1.0 之前的测试版本；自动更新安装包保留 userData，未来若有数据格式迁移会单独说明。

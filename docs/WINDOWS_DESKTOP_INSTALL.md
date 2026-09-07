# 在 Windows 上安装（DSH Desktop GUI / headless web 两用）

> 2026-09-07 实测（DSH Desktop 2.0.5 / dsh core 0.1.2-rc.1 / cordis 4.0.2 / Windows x64）。

## 目标宿主

| 你的运行形态 | 目标 profile | 说明 |
|---|---|---|
| **DSH Desktop（Windows GUI）** | `desktop` | GUI 本身就是一个 cordis/bundle 宿主，插件可以装进它并正常工作（实测：手机远程全流程通过） |
| 无 GUI 的 `dsh web` | `web` | headless 宿主，与官方文档一致 |

同一个 `DSH_HOME` 下 `desktop` 与 `web` 两个 profile 可以共存（实测同场运行无锁/农场冲突，数据共享），
但**日常只装你实际运行的 profile 即可**。

## 一键安装（推荐：外部终端/脚本执行）

```powershell
# 目标默认 = desktop（DSH Desktop GUI）。Desktop 正在运行时会拒绝/或用 -Force 先关掉它。
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 `
    -TarballPath <本地构建的 dsh-remote-web-gateway-0.2.2.tgz>

# 装 npm 发布版：去掉 -TarballPath 即可
# 目标改为 headless web：追加 -ProfileName web
```

**为什么必须由外部终端/脚本执行、且 Desktop 要关闭**：
Desktop 运行时若有第二个 DSH 进程去改它的 profile 依赖，会搅乱 GUI 的 bundle 栈/共享农场，
曾实测触发恢复模式（`PackageOverlayNotFoundError … ui-workspace`）。脚本已内置：
应用在跑 → 拒绝（或 `-Force` 自动停）→ ASCII 路径暂存 tgz → 改 profile 前快照、失败自动回滚 →
只走官方 `dsh plugin --profile desktop add` → 装完校验 bundle/可解析 → 提示**重启 DSH Desktop**。

手动等价步骤（与脚本一致）：
1. 完全退出 DSH Desktop；
2. 在独立终端执行：`dsh plugin --profile desktop add C:\dshbuild\dsh-remote-web-gateway-0.2.2.tgz`
   （本地 tgz 放纯 ASCII 路径；若提示 `'pnpm' 不是内部或外部命令`，先执行
   `$env:PATH = "$env:APPDATA\DSH Desktop\runtime-commands\bin;$env:PATH"`）；
3. 重新打开 DSH Desktop → 设置 → 远程控制 → 开启 → 手机扫码。

## 若进入恢复模式

DSH 会自动记录健康启动快照。恢复窗口点「**回滚**」回到最近一次健康启动即可恢复（插件会被撤下），
然后用上面的脚本重装即可；不要把"回滚"当作常规路径，它只是安全兜底。

## 关联

- 自动化安装：`scripts/install-windows.ps1`
- 用户指南（web profile 标准流程）：`docs/USER_GUIDE.md`

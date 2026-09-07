# 兼容性清单（V2）

> 状态含义：
> - `实现支持` = 源码/结构就绪，映射与下载验证通用（不代表真实验证）；
> - `已验证` = 有真实设备/真实公网/真人证据；
> - `未验证` = 尚无真实平台证据（不宣传为支持）。

## 固定源码基线

- DSH 固定源码（本机验收基线）：`99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`（tag `dsh-v0.1.0-rc.7`）
- DSH Remote Web Gateway V2：`0.2.2`（macOS 支持 + 更新 UX + 配对认证跳转 + 按钮/图标适配）
- 插件兼容声明（peer）：DSH `0.1.0-rc.5+` 客户端包 / cordis `^4.0.1`

## Host（运行插件 + 隧道的电脑）

| 平台 | 实现支持 | 已验证 | 说明 |
|---|---|---|---|
| Windows x64 | ✅ | ✅ | 真实公网 Quick Tunnel 冒烟 + 真实 DSH 插件加载 + 真实 E2E（配对→会话→代理→WS→撤销）；主要真实验证平台 |
| Windows ia32 | ✅ | ❌ | resolver prepared：官方 asset 映射存在，无实机证据 |
| macOS x64 / arm64 | ✅ | ❌ | resolver prepared：官方 asset 为 `.tgz`；已实现「固定版本 + SHA-256 校验 → 解压为单个 `cloudflared` → `--version` 复验」（v0.2.2）；darwin 真机端到端仍 pending 人工 |
| Linux x64 / ia32 / arm / arm64 | ✅ | ❌ | resolver prepared：官方 asset 映射存在，无实机证据 |

- **不宣传「Windows / macOS / Linux 全平台完整支持」**。仅 Windows x64 经过端到端验证。
- 远程端（手机/平板）**只需要浏览器**，不下载、不运行 cloudflared。

## Remote browser（远程访问端）

| 平台 | 实现支持 | 已验证 | 说明 |
|---|---|---|---|
| Android（Phone） | ✅ | ✅ | **已真实验证**：V1 时代真实设备完成基础远程能力（认证→DSH UI）；V2 Phone UI 真机视觉验收 PASS（R06C4C/C1）；R14.3 工作区选择器在真实 DSH Web + 受控浏览器 360×800 设备仿真下完成「此电脑」盘符根、D:\\dev 二级目录、选择/返回/取消与固定 footer 视觉验收 PASS；完整横屏/键盘/上传下载矩阵仍待补录 |
| iPhone | ✅ | ❌ | 检测与 Phone UI 实现存在；**没有真实 iPhone 验收就不能写真实验证**（pending 人工） |
| iPad / 平板 | ✅ | ❌ | DSH 主界面保持原生；仅添加工作区使用触屏 browse picker。R14.3 真实 DSH Web + 受控浏览器 1024×1366 / 1366×1024 设备仿真视觉 PASS（居中 720px、24px 安全边距、footer/列表无裁剪）；物理 iPad/Android tablet 仍 pending，不计入「已验证」 |
| Desktop（≥1024px） | ✅ | ⏳ | DSH 原生界面；桌面视觉矩阵待人工验收（pending） |

必须区分两类结论：

1. **基础远程能力已验证**（V1 真实设备 + V2 真实公网冒烟：配对 → 会话 → 代理 DSH → WS → 撤销）；
2. **V2 新界面视觉验收**：Android Phone UI 已 PASS；iPhone / iPad / Desktop 完整矩阵 **pending 人工**。

## 代理能力（源码确认，与 DSH 基线一致）

| 能力 | 状态 |
|---|---|
| SPA / 静态资源透明代理 | ✅ 自动化通过 |
| `/api` HTTP POST（含大 body） | ✅ 自动化通过（假上游） |
| WebSocket `/api/events.mux`、`/api/events.host` | ✅ 自动化 + 真实冒烟（101 upgrade） |
| 插件 HMR EventSource `/plugins/events` | ✅ 自动化通过 |
| 上传/下载、Content-Disposition | ✅ 自动化通过 |
| Host/Origin/Fetch-Metadata 栅栏 | ✅ 自动化 + 真实（非 loopback 403） |
| 管理 RPC 公网不可达 | ✅ 真实（9 端点 404） |

## 自动化验证基线

- Root：typecheck PASS · **271/271** 测试 · build PASS（2026-09-07 D2/D2.1 后；255 + 16）
- Plugin：verify（host）PASS · **228/228** 测试（14 文件）· build + client-boundary PASS（219 + 9 D2/D2.1；2026-09-07 D1 移除曾 233 − 14；client 侧 tsc 已知漂移例外，见下表末行）
- 打包：tarball 审计通过（无 maps/绝对路径/敏感信息）；`npm pack --dry-run` 67 文件 / 157.0 kB（0.2.2）

## 人工验收状态

- ✅ 已 PASS：配对生命周期真人验收；Android Phone UI 视觉验收；GitHub 真实 Device Flow 实机验证（历史记录，功能已随 D1 产品面移除）；Windows x64 真实 Quick Tunnel E2E（含 Ready 门禁、无 1033）；R13 活动会话常显侧边栏入口；R14 手机工作区目录选择器（模拟器 E2E 9/9，含撤销后 401）。
- ⏳ Pending：Ready 门禁真人扫码验收（QR 一出现立即扫码、首次打开无 1033）；iPhone / iPad 物理设备；Desktop 视觉矩阵；V2 移动层完整 A–E 逐项矩阵。

## Fork 实测补充（2026-09-07，DSH Desktop 2.0.5 / core 0.1.2-rc.1 / 大陆网络）

| 场景 | 结论 | 说明 |
|---|---|---|
| 安装到 **DSH Desktop 的 desktop profile** | ✅ 真实可用 | 官方 CLI + 外部执行（Desktop 关闭）→ 重启 Desktop → 插件随 GUI 加载（见 `WINDOWS_DESKTOP_INSTALL.md` / `scripts/install-windows.ps1`） |
| desktop host 端到端 | ✅ | 配对 → 设备会话 → 代理 GUI Web → WSS → 手机收发 → 撤销 → 停止，全部通过 |
| 手机端 Android（夸克）+ 4G / WiFi | ✅ | 两种网络均可连接；4G 一次瞬时不可用（当时记录为 503/网关门抖动；2026-09-07 二轮电脑侧实测：断连窗口 CF 边缘实际应答为 530/Error1033 HTML，正文归属需 T1 真机复核），**刷新即恢复且无需重配** |
| **E1-A 断连→恢复（2026-09-07 二轮，电脑侧）** | ✅ 实测 | 挂起 cloudflared 25s（进程存活）→ 进程内自动重连、URL/设备会话不变（`Lost connection with the edge` → `Retrying connection` → `Registered tunnel connection`，新 connection UUID、hostname 不变）；断连窗口内 CF 边缘返回 530/Error1033（非网关 503） |
| **手机断网恢复复核（2026-09-07 傍晚，真机，旧版插件）** | ✅ 实测 | 恢复后**立刻刷新 → CF 530/Error1033**（边缘重新注册滞后窗口，请求未达电脑）；**数秒后关闭标签重开 → 正常进入、无需重新扫码**（URL/设备会话有效）；滞后窗口实锤；带 E1-A 构建的复核见下行（T1） |
| **T1 整机断网→恢复（2026-09-07 晚，带 E1-A 构建）** | ✅ 实测 | 断网窗口内 cloudflared 无失联行输出（TCP 静默死亡、无信号源）→ UI 无提示、保持「已连接」；恢复瞬间感知失联（17:07:20.6）→ **degradedMs=1693ms** 重连成功（同 URL、进程未重启）；手机恢复后刷新即进入、**无 530/1033、无需重扫**（会话有效）；「恢复→可访问」滞后 ≈ **2s 级**。缺口：整机断网瞬间无即时反馈（需主动探活，待拍板） |
| **E1-A 实现（2026-09-07 二轮）** | ✅ 自动化 | ready 后边缘失联→回归监听（`edgeState`/`edgeDegradedSinceMs`/`edgeEvents` 诊断字段）；进程存活失联不清 origin（fail-closed 语义不变）；UI「短暂失联·自动恢复中」+ 诊断事件时间线；root 271 / plugin 228 全绿（D1/D2/D2.1 后计数） |
| **D1 GitHub 登录移除（2026-09-07，产品面）** | ✅ 已安装复核 | host 全链路移除（`config`/`runtime`/`rpc`/`wire`/`locales`/设置页/测试；`github.ts`、`GithubBindCard.tsx`、`github.test.ts` 删除，包描述同步）；本地覆盖安装 desktop profile → 重启后设置页**已无「绑定 GitHub」卡**（用户复核）；updater GitHub Releases 回退保留；root `src/github.ts` 清理 = 后续单独任务 |
| **D2/D2.1 长期配对码（2026-09-07）** | ✅ 自动化 + 已覆盖安装 | 与一次性配对并存：默认 9 位随机码 / **自定义码 6–12 位**（同字符集，越界/非法拒绝），**永久有效**直至「换一组/自定义」手动重置；**v2 明文落盘（ACL 目录）→ 重启后原码仍显示且仍可连**（v1 摘要文件兼容：可校验不可显示，升级即转 v2）；换组只影响未来新配对（已连设备不受影响）；claim 与一次性票据共享限速（rate-limited 不绕过）；/pair 手动输入 6–12 位（常量共享）；设置页「手机连接」卡 + 一次性/长期 Tab（none/active/persisted + 自定义面板 + 警示）；root 271 / plugin 228 全绿；已覆盖安装（备份 D2pre-20260907-173226，D2.1 版另备份）。**真机验收 pending**（重启后原码显示可连、自定义码、换组后已连设备仍可用） |
| **Pending（真机/决策）** | ⏳ | T2 多次采样（大断网时长下窗口波动）；530 vs 网关 503 正文归属复核；整机断网瞬间即时提示（主动探活，设计决策待拍板）；E2 状态细分补全；E3「URL 已更换需重扫」提示；E4 TROUBLESHOOTING 增补（530/1033=边缘恢复中、无需重扫语义） |
| desktop 与 headless web 同 `DSH_HOME` 并发 | ✅ 单机实测 | 两 profile 同场约 30 分钟无锁/农场冲突（会话/工作区数据共享） |
| plugin `verify` client 侧类型 | ⚠️ 已知差异 | host core `0.1.2-rc.1` 的 client 类型把 slot/Context API 收窄（TS2344 `'shell.overlay'`/`'settings.section'`），上游 rc.7 基线源码在此类型下 client 侧 verify 红；host tsc / build / client-boundary / 真机运行均正常。作为 host 版本差异记录，不影响使用 |

# Changelog

This project uses a fixed, human-readable release-notes format. Every GitHub
Release body and every user-facing update note follows the same sections,
written from what the user will NOTICE — never a raw commit log. The technical
commit history stays in git; the changelog is for people.

## Format (copy this block for every release)

```text
## v0.x.y

### 新增
- ...

### 优化
- ...

### 修复
- ...

### 安全
- ...

### 兼容性
- ...
```

Rules:

- Only shipped, user-perceivable changes belong in the notes; drop empty
  sections rather than leaving them blank.
- Security-relevant entries must never be omitted or blocked by missing notes
  (the updater offers them regardless).
- The updater renders the release body as SANITIZED PLAIN TEXT (HTML is
  stripped host-side; the settings UI uses React text interpolation).

## Version history

## [Unreleased] — fork 基线（Windows Desktop 安装指引）

> 本地 fork 基线收口（2026-09-07）。命名与对外发布待定；此段在定名后并入正式版本条目。

### 新增
- Windows 安装指引：`docs/WINDOWS_DESKTOP_INSTALL.md` + 一键脚本 `scripts/install-windows.ps1`
  —— 支持把插件装进 **DSH Desktop 的 `desktop` profile**（Desktop 关闭后由外部终端/脚本执行，
  装完重启 Desktop 生效）；已在 DSH Desktop 2.0.5 / core 0.1.2-rc.1 实测手机远程全流程通过。
- README / USER_GUIDE 增加 DSH Desktop（GUI）用户的 desktop 目标安装提示。

## [0.2.2] - 2026-08-28

### 新增
- 更新检查增加 GitHub Releases 回退源：npm 注册表不可达（例如被墙）时改用 GitHub Release 列表作为只读信号，设置页仍能看到最新的稳定版本
- macOS 平台支持 Cloudflare Tunnel 组件下载：darwin `cloudflared` 以 `.tgz` 压缩包分发，现可下载并解压后使用

### 优化
- 设置导航「远程控制」图标改为单个 DSH 原生镂空窗口图形，与系统图标大小和风格一致（此前为两台设备填色图形，视觉拥挤）
- 远程控制区「停止 / 复制地址 / 停止远程控制 / 撤销 / 撤销全部设备」与「检查更新 / 绑定 GitHub / 解除绑定 / 保存设置 / 稍后」按钮统一为带边框的 outline 样式，全页按钮层级一致、更易识别为按钮
- 更新卡片：已是最新时额外显示「上次检查 <时间>」；文案区分为「当前已经是最新版本」与「检查更新失败，请稍后重试」

### 修复
- 修复手机扫码配对后无法进入 DSH（浏览器停留在「dsh web authentication required; reopen the URL printed by dsh web」）：配对成功改为跳转到 DSH 的已认证启动链接（含 launch token），一次拿到网关层 + DSH 层双重会话，不再因缺少 DSH 浏览器会话被 401 拦截
- 修复更新卡片点击「稍后」后错误显示「正在检查更新…」：稍后进入独立的「已选择稍后更新」状态，不再回到检查中并卡住
- 修复 macOS 安装时报「当前平台暂未支持」：darwin `.tgz` 资产经固定版本 + SHA-256 校验后解压为单个 `cloudflared` 可执行文件，再以 `--version` 复验（此前视为不可运行并抛 `unsupported-platform`）
- 修复更新检查在 npm 与 GitHub 均不可达时显示误导性「正式版本发布到 npm 后即可在线检查」的文案

### 安全
- `.tgz` 解压只接受单个名为 `cloudflared` 的常规文件；拒绝路径穿越 / 绝对路径 / 符号链接 / 目录 / 多条目归档，防止被篡改归档注入任意路径

### 兼容性
- darwin：Cloudflare Tunnel 组件可下载并解压，`--version` 运行门检查通过；darwin 真机端到端（隧道启动 / 配对 / DSH 访问）仍需在 Mac 上人工验收
- Windows x64 仍为唯一 `validated: true` 平台；darwin 尚未声明已验证

## [0.2.1] - 2026-08-21

Mobile Experience Update 正式稳定版（npm `latest`）；RC `0.2.1-rc.1` 已由人工真机/仿真验收通过。

### 新增
- 手机/平板工作区目录选择器：添加工作区时从「此电脑」浏览完整文件系统与全部 Windows 盘符，支持完整面包屑、返回上级与选择当前目录
- 活动会话中始终可用的侧边栏入口：正在对话的会话页也能一键打开工作区 / 会话抽屉

### 优化
- 手机端活动会话页新增左上角紧凑入口，会话头部自动让位，不遮挡内容
- 手机底部 sheet / 平板 720px 居中安全边距布局；目录列表独立滚动、footer 固定不随列表移动
- 目录浏览有界加载（单层最多 1000 项）并提示截断；隐藏目录按主机平台约定过滤

### 修复
- 修复手机活动会话缺少侧边栏入口的问题（v0.2.0 悬浮按钮在会话页被隐藏后无处打开抽屉）
- 修复 Workspace Picker 真机布局问题：底部 sheet 被裁剪/漂浮、header 与目录列表消失、进入二级目录保留旧滚动位置（portal 化 + 显式 role + 滚动归零）

### 安全
- 目录浏览为只读接口（仅 list，无创建 / 删除 / 修改）；仍要求设备会话 / 配对授权，公网未认证请求一律拒绝

### 兼容性
- 桌面端工作区选择器保持 DSH Windows 原生行为；手机和平板使用远程目录浏览器，窄窗口桌面不注入
- Android 手机与平板真机/仿真验收 PASS（360×800、1024×1366、1366×1024）；iPhone / iPad 物理设备仍待人工验收
- 上游适配归因更新：dsh-web-mobile v1.5.0（MobileNavToggle 设计思想）、DSH 官方 directory-picker-browse 的 list 语义（详见 plugin/NOTICE）

## [0.2.1-rc.1] - 2026-08-21

Mobile Experience Update 预发布（Pre-release）版本；尚未发布到 npm。

### 新增
- 手机/平板工作区目录选择器：添加工作区时从「此电脑」浏览完整文件系统与全部 Windows 盘符，支持完整面包屑、返回上级和选择当前目录，不再错误进入账号主目录
- 活动会话中始终可用的侧边栏入口：正在对话的会话页也能一键打开工作区 / 会话抽屉

### 优化
- 手机端活动会话页新增左上角紧凑入口，会话头部自动让位，不遮挡内容
- 电脑目录浏览有界加载（单层最多 1000 项）并提示截断；隐藏目录按主机平台约定过滤
- 平板选择器采用 720px 居中安全边距布局；手机保持底部 sheet，目录列表独立滚动且 footer 固定

### 修复
- 修复手机活动会话缺少侧边栏入口的问题（v0.2.0 悬浮按钮在会话页被隐藏后无处打开抽屉）
- 修复 Workspace Picker footer 被手机通用 modal CSS 误改后漂浮、header/目录列表消失，以及进入二级目录保留旧滚动位置的问题

### 安全
- 目录浏览为只读接口（仅 list，无创建 / 删除 / 修改）；仍要求设备会话 / 配对授权，公网未认证请求一律拒绝

### 兼容性
- 桌面端工作区选择器保持 DSH Windows 原生行为；手机和平板使用远程目录浏览器，窄窗口桌面不注入
- 上游适配归因更新：dsh-web-mobile v1.5.0（MobileNavToggle 设计思想）、DSH 官方 directory-picker-browse 的 list 语义（详见 plugin/NOTICE）
- 真实 DSH Web + 受控浏览器设备仿真视觉验收 PASS：Android 360×800、Tablet 1024×1366、Tablet landscape 1366×1024；iPhone / iPad 物理设备仍待人工验收

## [0.2.0] - 2026-08-20

首个正式稳定版本：公开 npm 发布（`latest`），外部 RC 验收通过。

### Stable

- 首个正式稳定版 DSH Remote Web Gateway
- 完成公开 npm RC 外部验收（Windows x64 真实环境 + 外部朋友真实环境）
- DSH 原生插件：一条命令安装（`dsh plugin --profile web add dsh-remote-web-gateway`）
- Cloudflare Quick Tunnel：一键开启公网访问，无需公网 IP / 端口转发 / VPS
- 二维码 / 8 位一次性配对码安全配对（同一张一次性 Ticket 的两种输入方式）
- 独立设备授权与随时撤销（Device Session / revoke）
- 可选 GitHub 身份验证
- 手机专用界面（Phone UI）；平板与桌面保持 DSH 原生界面
- 自动更新（updater，默认约 24 小时检查一次，应用后需重启生效）
- 下载网络 / 下载源自动回退（download / proxy / fallback，镜像不降低验证标准）
- 安全加固（一次性配对、设备会话、loopback 管理 RPC、cloudflared 固定版本 + SHA-256 + Authenticode，详见 THREAT_MODEL）

### Validation

- Windows x64（主要真实验证平台）
- DeepSeek Harness `0.1.0-rc.7` 开发与验收基线
- Android 手机真机 PASS
- 公开 npm 全新安装 PASS
- 外部朋友 RC 验收 PASS
- iPhone / iPad 尚未真机验证

## [0.2.0-rc.2] - 2026-08-20

首个公开 npm 预发布（Pre-release）版本；尚未发布到 npm。

### 新增
- DSH 原生插件：`dsh plugin --profile web add dsh-remote-web-gateway` 一条命令安装，设置页内「远程控制」开关
- 手机 / 平板浏览器直接访问电脑上的 DeepSeek Harness，无需安装 App
- Cloudflare Quick Tunnel 一键开启公网访问，无需公网 IP / 路由器端口映射 / VPS
- 二维码 / 8 位配对码安全配对（同一张一次性 Pairing Ticket 的两种输入方式）
- 独立设备授权：每台设备独立 Device Session，可逐台或全部撤销
- 可选 GitHub Device Flow 身份认证（绑定后可用 GitHub 身份登录配对）
- 自动检查更新（默认约 24 小时一次）与「立即更新」，更新说明随版本展示
- 下载网络 / 下载源设置：自动（系统 / 环境代理 / 直连）、仅官方源、备用镜像

### 优化
- 配对二维码只在 Cloudflare Edge 确认隧道可访问（Tunnel Ready）后显示，避免首次扫码遇到 Cloudflare 1033
- Phone 专用轻量界面（侧边抽屉 + 悬浮按钮 + 触控优化），只对明确手机启用；平板与桌面保持 DSH 原生界面
- 备用下载镜像只改变传输路径：镜像下载的文件仍执行固定版本 / SHA-256 / 签名验证，不降低验证标准
- 发布产物为单一自包含 npm 包（核心库随包分发，无 file:/workspace: 依赖）

### 修复
- 修复设置页重挂载自动生成新配对凭证的问题（凭证只在用户点击「生成新的配对码」或停止后重新开启时更换）
- 修复首次扫码偶发 Cloudflare 1033：二维码改为在 Tunnel Ready 后才显示
- 修正配对文案：二维码是一次性配对凭据，公网地址本身不授予访问权限

### 安全
- 公网地址本身不授予访问权限；只有一次性配对凭据 / 已绑定 GitHub 身份才能换取设备会话
- 一次性配对凭证 5 分钟有效、单次使用；二维码与 8 位码共享同一张 Ticket，任一种使用后整体作废
- 设备会话可逐个或全部撤销，撤销持久化且立即生效
- 管理操作（开启 / 停止、撤销、更新、GitHub 绑定）仅限本机设置页，公网不可达
- cloudflared 二进制固定版本 + 官方 SHA-256 校验，每次启动复验；损坏缓存自动丢弃重下
- PATH 中的 cloudflared 必须通过 Authenticode（Cloudflare 签名）才执行，否则回退受管固定版本
- GitHub 令牌仅存在于内存，身份确认后立即丢弃，绝不落盘
- 配对凭证状态由插件端权威管理：已使用 / 过期后不再显示二维码 / 配对码 / 倒计时

### 兼容性
- 正式验证宿主环境：Windows x64；要求 DeepSeek Harness `0.1.0-rc.5` 及以上（当前开发与验收基线 `0.1.0-rc.7`）
- Android 手机界面已真机视觉验收；iPhone / iPad / 桌面视觉矩阵待人工验收
- 默认路径为 Cloudflare Quick Tunnel；V1（ngrok 路径）内容已标记为 Legacy

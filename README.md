<div align="center">

# DSH Remote

### [前往 Android 下载页](https://peaceful-fare-scan-camcorders.trycloudflare.com/)

[Android 下载页](https://peaceful-fare-scan-camcorders.trycloudflare.com/) · [English](./README_EN.md)

</div>

通过手机或平板浏览器，安全地远程使用电脑上正在运行的 **DeepSeek Harness（DSH）**。

`dsh-remote` 在电脑本机运行 Remote Gateway，并通过 Cloudflare Quick Tunnel 建立公网 HTTPS 入口。手机完成配对后，就可以通过浏览器或 Android App 继续访问 DSH Web UI、查看 Agent 执行状态、继续对话、处理确认操作和选择工作区。

项目、会话、工具、文件和 Agent 仍然运行在电脑端，移动设备只负责远程访问。

## 主要功能

### 🤖 Android App

- [前往 Android 下载页](https://peaceful-fare-scan-camcorders.trycloudflare.com/)，查看版本与安装要求后下载（Android 8.0+）。
- 打开 App 扫描电脑端二维码，即可在独立 WebView 中连接 DSH。
- App 与浏览器使用同一套配对、Device Session 和网关安全边界。

### 📱 手机 / 平板远程访问

- 可直接使用浏览器，也可安装 DSH Remote Android App。
- 使用 Cloudflare Quick Tunnel 建立公网 HTTPS 连接。
- 不需要公网 IP、端口转发或额外 VPS。
- Remote Gateway 仅监听本机回环地址，公网请求必须先经过认证。

### 🔐 一次性配对

- 开启远程控制后生成二维码和 8 位配对码。
- 配对票据默认 5 分钟有效。
- 支持扫码或手动输入配对码。
- 配对成功后票据立即失效。
- 可随时生成新的配对码，旧票据同时失效。

### 🔢 长期配对码

适合自己的常用手机或平板长期使用。

- 与一次性配对并存，可在设置页中切换。
- 支持二维码和手动输入。
- 长期码在手动更换前持续有效，并可在 DSH 重启后继续使用。
- 默认生成 9 位随机码。
- 支持自定义 6–12 位字母 / 数字组合（`A-Z`、`0-9`）。
- 可一键更换长期码，旧码和旧二维码立即失效。
- 更换长期码只影响之后的新配对，不会自动断开已经授权的设备。

### 💻 独立设备授权

- 每台已配对设备拥有独立 Device Session。
- 可以查看已授权设备。
- 支持单独撤销某台设备。
- 支持一次撤销全部设备。
- 获取公网地址本身不代表拥有访问权限，设备仍需先完成配对。

### 🗂️ 远程工作区选择

- 手机端可以浏览电脑目录并选择 DSH 工作区。
- Windows 下支持浏览不同磁盘根目录。
- 实际文件访问权限仍由本机操作系统权限控制。

### 📡 Quick Tunnel 状态与自动恢复

- 显示下载、校验、启动、连接、就绪等状态。
- 只有 Cloudflare Edge 真正确认连接后才显示可用远程地址和配对信息。
- 持续监测 Tunnel Edge 连接状态。
- 短暂网络抖动时保持当前公网地址和设备授权，并等待 `cloudflared` 自动恢复。
- 可查看最近的失联 / 恢复事件和持续时间。
- 如果 `cloudflared` 进程真正退出，则关闭当前公网入口并提示重新开启。

### 🌐 cloudflared 下载与网络适配

项目可以自动准备 Quick Tunnel 所需的 `cloudflared`：

- 检查本机已有 `cloudflared` 是否可信、可用。
- 使用固定版本和 SHA-256 校验下载文件。
- Windows 下额外检查 Authenticode 签名。
- 缓存文件损坏时自动重新下载。
- 显示下载大小、速度、来源和当前网络路径。
- 支持官方源和备用镜像。
- 支持自动、直连、自定义代理三种下载网络模式。

### 🔄 更新管理

- 设置页提供版本检查和更新状态。
- 更新通过 DSH 官方 `dsh plugin` 命令执行。
- 安装完成后重新校验实际安装版本。
- 不会自动重启正在工作的 DSH，更新完成后由用户手动重启生效。

### 🪟 DSH Desktop 安装

- 支持直接在 DSH Desktop 中让 DSH 协助完成插件安装。
- 不需要退出 Desktop，也不需要另外打开终端手动执行安装脚本。
- 只需在 DSH 对话中发送安装请求并附上本仓库地址，即可让 DSH 完成安装流程。
- 安装完成后可直接进入 **设置 → 远程控制** 开启远程访问。

---

## 工作原理

```text
手机 / 平板浏览器
        │
        │ HTTPS
        ▼
Cloudflare Quick Tunnel
        │
        ▼
Remote Gateway（127.0.0.1）
        │
        ├─ 一次性配对
        ├─ 长期配对码
        ├─ Device Session
        └─ 请求认证 / 反向代理
        │
        ▼
DeepSeek Harness

项目 / 会话 / Agent / 工具 / 文件仍保留在电脑端
```

Quick Tunnel 负责把公网 HTTPS 流量送回电脑，Remote Gateway 负责认证访问者并把通过认证的请求代理到本机 DSH。

`cloudflared` 的目标始终是 Remote Gateway，而不是直接暴露 DSH，因此公网请求不能绕过配对和设备会话认证直接进入 DSH。

---

## 快速开始

`dsh-remote` 以 DSH 插件形式使用。安装完成后，在 DSH 中进入：

```text
设置 → 远程控制
```

开启远程控制，等待 Quick Tunnel 就绪后，即可使用手机或平板扫码 / 输入配对码连接。

### DSH Web

使用 `dsh web` 时，可以直接将插件安装到 `web` profile：

```bash
dsh plugin --profile web add "github:AercherC/dsh-remote#main&path:/plugin"
```

安装完成后重启 `dsh web`，然后进入：

```text
设置 → 远程控制
```

开启远程控制即可。

### DSH Desktop

此插件支持直接让 DSH 协助安装，不需要退出 Desktop，也不需要另外打开终端。

在 DSH Desktop 的对话中直接发送：

```text
帮我安装这个 DSH 插件：
https://github.com/AercherC/dsh-remote
```

DSH 会根据仓库中的插件配置完成安装。安装完成后进入：

```text
设置 → 远程控制
```

开启远程控制，然后使用手机扫码或输入配对码即可连接。

---

## 使用方式

### 一次性连接

1. 在电脑端打开 DSH 的“远程控制”。
2. 开启远程控制并等待 Tunnel 就绪。
3. 使用手机扫描二维码，或手动输入 8 位配对码。
4. 配对成功后进入 DSH Web UI。
5. 之后该设备通过自己的 Device Session 继续访问。

### 长期连接

1. 在“远程控制”中切换到“长期配对码”。
2. 生成长期码和二维码。
3. 使用常用手机扫码或输入长期码。
4. 如需废止该凭据，点击“换一组新码”或设置新的自定义码。

### 撤销设备

不再使用某台设备时，可以在电脑端设备列表中单独撤销；需要让所有已授权设备立即失效时，可以使用“撤销全部设备”。

---

## 安全设计

- Remote Gateway 仅监听 `127.0.0.1`。
- `cloudflared` 只主动建立出站连接，不要求本机开放公网端口。
- 公网 URL 只是传输入口，不是访问凭据。
- 一次性票据有有效期，并在成功使用后立即失效。
- 长期配对码在用户主动更换前持续有效。
- 每台设备拥有独立会话，可以单独撤销。
- 开启 / 停止远程访问、设备撤销、网络设置等管理操作只通过本机管理通道执行。
- 配对 claim 使用限速保护，凭据比较使用 timing-safe 方式处理。
- 二维码中的敏感配对 secret 放在 URL Fragment 中，不通过 query 参数传输。
- Tunnel 进程退出时会立即清除当前公网入口。
- 自动下载的 `cloudflared` 使用固定版本和 SHA-256 校验；Windows 下额外验证 Authenticode 签名。

为了支持重启后继续显示长期配对码和二维码，长期凭据会保存在插件状态目录中。Windows 下该目录限制为当前用户和 `SYSTEM` 可访问；更换长期码时使用原子覆盖，不保留旧码历史。

长期码属于长期有效凭据，请不要分享包含长期二维码或配对码的截图。

---

## License

MIT License。详见 [LICENSE](./LICENSE)。

第三方组件及相关许可信息见 [plugin/NOTICE](./plugin/NOTICE)。

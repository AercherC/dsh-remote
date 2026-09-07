<div align="right">

简体中文 · [English](README_EN.md)

</div>

# dsh-remote — DSH Remote Web Gateway（增强版）

**在手机 / 平板浏览器上，继续使用电脑上正在运行的 DeepSeek Harness（DSH）：**
**看进度、继续对话、查看结果、处理需要确认的操作——项目和工具仍然留在电脑上。**

本项目是开源项目
[**summer1238/dsh-remote-web-gateway**](https://github.com/summer1238/dsh-remote-web-gateway)
（作者 summer1238，MIT 协议）的**二次开发（fork）版本**。
上游的成果归上游，本仓库只对自己的增量负责：**先声明上游，再讲我设计的东西。**

---

## 一、上游项目声明

| | |
|---|---|
| 上游项目 | [dsh-remote-web-gateway](https://github.com/summer1238/dsh-remote-web-gateway)，作者 summer1238 |
| 上游基线 | v0.2.2（main @ `5b2db96`，2026-08-28），MIT |
| 本仓库 | 在该基线上二次开发；增补改动的版权归 AercherC（见 [LICENSE](LICENSE)） |

**继承自上游、并非本仓库原创的核心能力**（上游成熟且经过真机验证，直接复用、不重复造轮子）：

- 一次性扫码 / 8 位配对码的安全配对（票据 5 分钟有效、单次原子认领）
- 独立设备授权：每台设备独立 Device Session，可逐台或全部撤销（磁盘只存 SHA-256）
- Cloudflare Quick Tunnel 一键公网传输：电脑主动出站建立，无需公网 IP、端口转发或 VPS
- 认证层网关：仅回环监听的反向代理 + Host / Origin 改写，透明代理官方 DSH Web UI
- 手机 UI 注入层（只对明确手机生效）与只读的远程工作区目录选择器
- 更新提醒（用户确认才安装，不偷偷重启正在工作的 DSH）与下载源 / 代理网络自动回退
- cloudflared 供应链校验：固定版本 + SHA-256 复验、Windows Authenticode 签名校验、损坏自动重下

此外，插件内还适配了其它 MIT 开源项目的片段（[dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile)、
[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)），逐条归因见
[plugin/NOTICE](plugin/NOTICE)。

> 想用原版？直接安装上游发布的 npm 包 `dsh-remote-web-gateway`，或访问上游仓库。
> 本仓库是独立的 fork 增强版，**没有占用也没有替代上游的发布渠道**。

---

## 二、我的设计与功能增量

在继承上游架构（传输与认证解耦、配对 / 设备会话 / 管理面仅回环）的前提下，
我按"先取证、再实现、自动化全绿 ≠ 真人验收"的纪律做自己的增量。
以下功能均已写入本仓库代码，随版本维护：

### 🪟 Windows / DSH Desktop 安装体验

- [scripts/install-windows.ps1](scripts/install-windows.ps1)：把插件装进 **DSH Desktop 的 `desktop` profile** 的一键安装脚本——
  ASCII 路径暂存、改依赖前自动快照、失败自动回滚、只走官方 `dsh plugin` 命令；
  在 DSH Desktop 2.0.5 / core 0.1.2-rc.1 上实测"手机远程全流程"通过。
- 配套的 Windows CI 质量门（[.github/workflows/ci.yml](.github/workflows/ci.yml)）：
  每次 push / PR 在 Windows 上跑 typecheck + test + build + pack。

### 🔢 长期配对码（与一次性配对并存，ToDesk 式）

- 设置页「手机连接」新增 **一次性配对 / 长期配对码** 两个 Tab；长期码同样支持扫码或输码连接。
- 长期码**永久有效、手动重置**：默认不展示；远程控制开启后，进入「长期配对码」Tab 且当前无码时会自动生成一次随机码 + QR（不会自动轮换）；可一键「换一组新码」，旧码立即失效。
- **自定义码**：6–12 位字母（A–Z）/ 数字（0–9），便于记忆；服务端二次校验格式。
- **重启后原码仍可查看**：明文只存于"当前用户 + SYSTEM"ACL 保护目录（与设备凭据同一信任域）；
  换组 / 设置自定义码即原子覆盖，不留旧明文历史。
- 语义明确：换组 / 自定义只影响**未来的新配对**，已连接设备不受影响（强制下线请用「撤销全部设备」）。
- 安全：与一次性配对**共享同一 claim 限速预算**；凭据比较使用 timing-safe 比较；
  长期码只走 `/pair#<secret>` 深链或输码，不接收 query 明文。
- 实现位置：root 库层 `src/pairing-long.ts` 与 `src/pairing-routes.ts` 的 claim 回退；
  plugin 侧 runtime / rpc / wire 接口与设置页「手机连接」卡 UI（zh / en 文案）。

### 📡 Quick Tunnel 断连诊断与恢复体验

- `src/quick-tunnel.ts` 在隧道就绪后**持续监听边缘连接**，记录失联 / 回归事件与时长（edgeState、degraded 起止、事件时间线）。
- 瞬时失联 → 设置页显示「**短暂失联 · 自动恢复中**」，公网地址与已授权设备不变、**无需重新扫码**；
  只有进程退出（换 URL）才显示明确的错误与一键「重新开启」。
- 诊断区展示最近边缘事件时间线；fail-closed 语义保持不变（仅进程退出 / 用户停止才关闭公网入口）。

### ⚖️ 与上游的产品差异

- 按产品决策**移除了 GitHub 身份绑定**：上游可选配的 GitHub Device Flow 登录，在本仓库的设置页 / 配对入口 /
  RPC / 配置中均不再出现。认证只保留：一次性配对、长期配对码、独立设备会话。

> 本仓库只对以上增量负责；任何上游能力的问题请先到上游仓库反馈。

---

## 三、快速开始（源码形态）

> 本 fork 尚未发布 npm 包或正式 Release，以下路径为"本地构建 + 安装"。

**环境**：Node `^22.19 || >=24`，pnpm 11。

```bash
# 1) 仓库根：装依赖并构建（root build 会产出 gateway 运行时 dist）
pnpm install
pnpm run check        # typecheck + test + build

# 2) plugin：装依赖并构建出可安装的插件产物
cd plugin
pnpm install
pnpm run build
pnpm pack             # 生成 dsh-remote-web-gateway-0.2.2.tgz
```

**DSH Desktop（Windows GUI）**：先完全退出 Desktop，再在外部终端执行

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 -TarballPath <plugin 的 .tgz 路径>
```

重启 DSH Desktop → 设置 → 远程控制 → 开启 → 手机扫码 / 输码。

**无 GUI 的 `dsh web`**：`dsh plugin --profile web add <plugin 的 .tgz 路径>`，重启 DSH Web 后路径同上。

> ⚠️ npm 上的 `dsh-remote-web-gateway` 是上游 summer1238 发布的**原版**；
> 本仓库的改动没有发布到那个 npm 名，安装时请勿混淆。

---

## 四、它怎么工作（简图）

```text
手机浏览器 ── HTTPS ──▶ Cloudflare Quick Tunnel（由电脑主动出站建立）
                              │
                              ▼
                  本机回环 Remote Gateway
                  （配对 / 长期码 / 设备会话认证 + 透明反向代理）
                              │  127.0.0.1
                              ▼
                  正在运行的 DeepSeek Harness
                  （项目、会话、工具、Agent 全部留在电脑上）
```

"传输层（把公网流量送回本机）"与"认证层（谁能进）"解耦的架构设计来自上游；
本仓库不重做这两层，只在其上叠加上述增量。

---

## 五、安全与漏洞上报

- **链接 ≠ 权限**：拿到公网地址不等于能进入 DSH；进入需要一次性配对或长期码换取独立的设备会话。
- 长期码是**长期有效的强凭据**：界面已提示勿分享截图；可随时「换一组」使其立即失效。
- 每台设备独立授权、可逐台或全部撤销；管理操作（开启 / 停止 / 撤销 / 更新）仅限本机回环，公网不可达。
- 发现安全漏洞请走 GitHub **Security 页的私有上报**（不要开公开 Issue）。

---

## 六、开源协议

[MIT License](LICENSE)。上游 dsh-remote-web-gateway 的版权归 summer1238；
本仓库的增补改动版权归 AercherC。第三方适配组件的逐条归因见 [plugin/NOTICE](plugin/NOTICE)。

---

## 七、致谢

感谢 summer1238 的开源工作，以及 dsh-web-mobile、DeepSeek Harness 等 MIT 项目的作者——
没有这些公开成果，就不会有本仓库。

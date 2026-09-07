<div align="right">

简体中文 · [English](README_EN.md)

</div>

# DSH Remote Web Gateway

## **手机也能继续用 DeepSeek Harness。**

### **扫个码，电脑上的 DSH 随身带走。**

### **链接不是权限 · 一次性配对 · 每台设备独立授权、随时撤销**

### **无需远程桌面 · 无需 SSH · 无需公网 IP / 端口转发**

![DSH Remote Web Gateway](docs/assets/hero-zh.png)
---

## **电脑上的 DSH 还在干活，你人已经走了？**

下班路上，Agent 还在跑任务。

你只是想掏出手机看看：

### **做到哪了？结果出来了吗？**

出门以后，它突然停下来等你确认。

或者已经躺床上了，你突然想到：

> “刚才那个需求还得补一句。”

你真正想要的其实很简单：

### **打开手机，继续使用电脑上正在运行的那个 DeepSeek Harness。**

**DSH Remote Web Gateway 就是干这个的。**

不用把整个 Windows 桌面塞进手机，也不用在手机里重新部署一套 Agent。

**项目、会话、工具和 Agent 继续留在电脑上。**

## **你只是把 DSH 带在了身边。**

---

## ⭐ [**这个项目刚好解决了你的痛点？给它一个 Star →**](https://github.com/AercherC/dsh-remote)

### **Star 不是安装门槛，也不会影响任何功能。**

### 它只是让我知道：

## **这个项目值得继续维护，也能让更多正在找“手机远程 DSH”的人看到它。**

---

# 🚀 **一条命令，装完就能用**

```bash
dsh plugin --profile web add dsh-remote-web-gateway
```

> 💻 在 **DSH Desktop（Windows GUI）** 上？插件可以装进 Desktop 的 `desktop` profile，
> 但必须在 Desktop 关闭后由**外部终端/脚本**执行（运行中的 Desktop 不能被第二进程改依赖）：
> `scripts\install-windows.ps1 -TarballPath <本地tgz>`，装完重启 DSH Desktop。
> 详见 [Windows/Desktop 安装说明](docs/WINDOWS_DESKTOP_INSTALL.md)。

### 安装以后：

## **重启 DSH → 设置 → 远程控制 → 开启远程控制 → 手机扫码**

**就这么简单。**

### 📘 [**第一次用？打开《用户指南》 →**](docs/USER_GUIDE.md)

安装、扫码、第二台设备、撤销权限、更新和常见问题，都在里面一步一步带你完成。

### 🤖 [**不想自己装？让 AI 帮你安装 →**](docs/USER_GUIDE.md#让-ai-帮你安装)

把项目链接和用户指南里准备好的提示词发给 DSH、Codex、Claude Code 或其它 Coding Agent。

**能操作终端的 AI 可以直接协助安装；不能操作电脑的 AI，也可以按照官方文档一步一步带你完成。**

---

# **手机里的 DSH，不是“缩小版 Windows”**
![DSH Remote Web Gateway](docs/assets/mobile-showcase-zh.png)
传统远程桌面解决的是：

> 怎么把整台电脑搬到手机屏幕里？

我们解决的是：

> ## **怎么让我离开电脑以后，继续使用 DSH？**

电脑上的 Agent 继续工作。

你在手机上：

### **看进度 · 继续对话 · 查看结果 · 处理需要你确认的操作**

手机看到的是 DSH。

## **不是一个需要疯狂缩放和拖动的 Windows 桌面。**

---

# **你只是想在手机上继续用 DSH，真的需要这么折腾吗？**

### **为了看一眼 Agent，真的要远程整个 Windows？**

不用。

## **只把 DSH 带到手机上。**

### **为了手机连电脑，真的要先买 VPS、配 SSH、改路由器端口？**

默认不用。

## **一键建立 Cloudflare Quick Tunnel。**

### **为了手机使用 DSH，真的要重新部署一套 Agent？**

不用。

## **继续使用电脑上已经运行的 DSH、项目和工具。**

### **为了方便，真的要让一个长期 Token 跟着链接到处跑？**

我们选择了另一种方式：

## **一次性配对 + 独立设备授权 + 随时撤销。**

---

# **能连上只是第一步，安全才是默认设计。**

![DSH Remote Web Gateway](docs/assets/security-model-zh.png)


手机远程 DSH 本身并不难。

**反向代理 + 内网穿透**，很快就能让手机打开一个 Web UI。

真正困难的是：

## **谁能进？**

## **凭证泄露以后怎么办？**

## **设备授权以后还能不能收回来？**

因为 DSH 背后不是一个普通网页。

它可能连接着：

**你的项目源码、开发文件、本地工具，以及已经配置好的模型能力。**

如果这是公司的开发电脑，一条设计得过于简单的远程入口，带来的风险也不只是“别人看到一个页面”。

可能暴露的是开发环境。

甚至有人可以不断调用你已经配置好的模型额度。

### **一觉醒来发现 API 额度被刷掉，只是其中比较轻的一种后果。**

所以我们没有把：

> “手机已经能打开”

当成：

> “远程访问已经做完”。

整个访问过程更接近：

```text
临时连接
    ↓
一次性配对
    ↓
独立设备授权
    ↓
持续认证
    ↓
随时撤销
    ↓
DeepSeek Harness
```

## **链接不是权限。**

拿到访问地址，不等于已经获得 DSH 控制权。

## **配对凭证不是长期密码。**

首次配对使用一次性凭证，而不是让一个长期万能 Token 跟着二维码和链接到处跑。

## **每台设备独立授权。**

不是所有手机共享同一把长期钥匙。

## **授权可以收回来。**

某台设备不再可信？

**在电脑端撤销它。**

想看完整安全边界、我们防什么以及不防什么：

安全模型与信任边界见《用户指南》"安全"一节。

---

# **一个反向代理就能搞定的事，为什么我们偏要做这么复杂？**

因为一个最小实现主要解决：

> ## **怎么从外面打开这个网页？**

而我们还想解决：

> ## **怎么让它真正适合长期远程使用？**

所以除了连接，我们还做了：

**一次性配对 · 独立 Device Session · 单设备 / 全设备撤销 · HTTP / WebSocket 访问认证 · 本机管理面隔离**

我们宁愿把这件事做复杂一点。

## **也不愿意把“能打开”误认为“可以放心用”。**

---

# **它到底怎么连接？**

![DSH Remote Web Gateway](docs/assets/architecture-zh.png)
```text
手机浏览器
     │
     │ HTTPS
     ▼
Cloudflare Quick Tunnel
     │
     ▼
DSH Remote Web Gateway
     │
     │ 127.0.0.1
     ▼
DeepSeek Harness
```

电脑主动向外建立 Tunnel。

## **DeepSeek Harness 和 Gateway 仍然只监听本机。**

所以默认不需要公网 IP，也不需要给路由器开放新的入站端口。

---

# **你真正会用到的能力**

### 📱 **Phone 专门适配**
不是把桌面 UI 硬缩进手机。

### ⚡ **一键 Quick Tunnel**
默认无需 VPS、SSH 和端口转发。

### 🔐 **一次性扫码 / 8 位配对码**
第一次设备接入简单直接。

### 📱 **独立设备授权**
多台设备分别拥有自己的访问权限。

### 🚫 **随时撤销**
单台设备或者全部设备，都能从电脑端收回权限。

### 🌐 **网络自动适配**
支持系统 / 环境代理，并在官方下载异常时尝试经过验证的备用下载路径。

### 🔄 **更新提醒**
发现新版本后通知你，由你确认安装，不偷偷重启正在工作的 DSH。

---

# 📚 **文档**

### 📘 [**用户指南**](docs/USER_GUIDE.md)
**第一次使用，从这里开始。**

里面还准备了可以直接复制给 AI 的安装 / 排障提示词。

### 🧰 [**故障排查**](docs/TROUBLESHOOTING.md)
Tunnel、下载、配对、网络、更新等常见问题。

### 🧰 [**Windows / DSH Desktop 安装**](docs/WINDOWS_DESKTOP_INSTALL.md)
在 DSH Desktop（Windows GUI）上一键安装与回滚。

### 📋 [**CHANGELOG**](CHANGELOG.md)
版本变化与更新内容。

---

# 🤖 **遇到问题，也可以直接把项目链接交给 AI**

```text
https://github.com/AercherC/dsh-remote
```

把：

### **项目链接 + 你的报错 / 截图**

一起发给 DSH、Codex、Claude Code 或其它 AI。

告诉它：

> **先阅读本项目 README、User Guide 和 Troubleshooting，再按照项目当前文档帮我排查。**

### 🤖 [**让 AI 帮你安装 / 排错 →**](docs/USER_GUIDE.md#让-ai-帮你安装)

---

# **开源**

这个项目会一直保持**免费开源**。

如果它替你省下了一次远程桌面折腾、一台 VPS，或者只是让你下班以后还能舒服地继续用 DSH——

那就已经值了。

如果它对你也有帮助，欢迎给这个项目一个 ⭐：

### ⭐ [**Star dsh-remote →**](https://github.com/AercherC/dsh-remote)

本项目使用 [MIT License](LICENSE)。

**DSH Remote Web Gateway（dsh-remote）是一个社区开源项目。**

---

# [⭐ **如果它真的让你离开了电脑，欢迎右上角留下一个 Star**](https://github.com/AercherC/dsh-remote)

![DSH Remote Web Gateway](docs/assets/continue-work.png)


电脑上的 Agent 继续跑。

你已经走出了办公室。

然后从手机里继续把这个任务做完。

## **这就是这个项目存在的意义。**

### ⭐ [**请记得点星 Star DSH Remote Web Gateway，让更多 DSH 用户找到它 →**](https://github.com/AercherC/dsh-remote)

window.__ModuleLoader__.load({
	id: "dsh-remote-web-gateway",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		/** Client-side shape check for a custom long code (6–12 chars, A–Z + 0–9). */
		function isPairingLongCodeShape(value) {
			const code = value.trim().toUpperCase();
			if (code.length < 6 || code.length > 12) return false;
			return /^[A-Z0-9]+$/.test(code);
		}
		/**
		* The QR payload for one pairing ticket: `https://<origin>/pair#<secret>`.
		*
		* The secret travels ONLY in the URL fragment — never in the query string,
		* the HTML source, logs, or localStorage. The fragment is stripped from the
		* address bar by the /pair page before it posts the claim.
		*/
		function pairingQrContent(publicUrl, secret) {
			return `${publicUrl}/pair#${secret}`;
		}
		/** Every stable error code the plugin can emit (host + client use this set). */
		const REMOTE_ERROR_CODE_SET = /* @__PURE__ */ new Set([
			"unsupported-platform",
			"config-conflict",
			"download-failed",
			"proxy-invalid",
			"proxy-connect-failed",
			"source-too-slow",
			"checksum-mismatch",
			"size-mismatch",
			"binary-rejected",
			"version-mismatch",
			"start-timeout",
			"spawn-failed",
			"exit-before-ready",
			"connection-lost",
			"internal",
			"startup-failed",
			"tunnel-not-ready",
			"persist-failed",
			"bad-request",
			"update-unavailable",
			"update-failed",
			"update-version-mismatch",
			"update-in-progress",
			"cli-not-found"
		]);
		/** User copy for every error code (zh + en). NEVER an empty string. */
		const REMOTE_ERROR_MESSAGES = {
			"unsupported-platform": {
				zh: "当前平台暂未支持 Cloudflare Tunnel 组件",
				en: "Cloudflare Tunnel is not supported on this platform yet"
			},
			"config-conflict": {
				zh: "检测到现有 Cloudflare 配置。为避免修改你的配置，本次未启动远程访问。",
				en: "An existing Cloudflare configuration was detected. Remote access was not started to avoid modifying your configuration."
			},
			"download-failed": {
				zh: "无法下载 Cloudflare Tunnel。已尝试当前可用的网络路径，请检查网络或下载网络设置后重试。",
				en: "Could not download Cloudflare Tunnel. The available network paths were tried; check the network or the download network setting and try again."
			},
			"proxy-invalid": {
				zh: "代理配置无效，请检查下载网络设置。",
				en: "The proxy configuration is invalid; check the download network setting."
			},
			"proxy-connect-failed": {
				zh: "无法通过代理下载 Cloudflare Tunnel。请检查代理地址或网络后重试。",
				en: "Could not download Cloudflare Tunnel through the proxy. Check the proxy address or the network and try again."
			},
			"source-too-slow": {
				zh: "下载源速度过慢，已尝试切换备用下载镜像。",
				en: "The download source was too slow; a backup mirror was tried instead."
			},
			"checksum-mismatch": {
				zh: "Cloudflare Tunnel 组件下载校验失败，已停止启动。",
				en: "The downloaded Cloudflare Tunnel component failed verification; startup was stopped."
			},
			"size-mismatch": {
				zh: "Cloudflare Tunnel 组件下载校验失败，已停止启动。",
				en: "The downloaded Cloudflare Tunnel component failed verification; startup was stopped."
			},
			"binary-rejected": {
				zh: "Cloudflare Tunnel 组件校验失败，已停止启动。",
				en: "The Cloudflare Tunnel component failed verification; startup was stopped."
			},
			"version-mismatch": {
				zh: "Cloudflare Tunnel 组件版本校验失败，已停止启动。",
				en: "The Cloudflare Tunnel component version failed verification; startup was stopped."
			},
			"start-timeout": {
				zh: "Cloudflare Tunnel 在规定时间内未就绪，请检查网络后重试。",
				en: "Cloudflare Tunnel did not become ready in time; check the network and try again."
			},
			"spawn-failed": {
				zh: "Cloudflare Tunnel 组件启动失败，请重试。",
				en: "Failed to start the Cloudflare Tunnel component; try again."
			},
			"exit-before-ready": {
				zh: "Cloudflare Tunnel 连接建立失败，请重试。",
				en: "The Cloudflare Tunnel connection failed to establish; try again."
			},
			"connection-lost": {
				zh: "远程连接已断开。",
				en: "The remote connection was lost."
			},
			"internal": {
				zh: "发生未预期的内部错误。请查看诊断信息后重试。",
				en: "An unexpected internal error occurred. Check the diagnostics and try again."
			},
			"startup-failed": {
				zh: "远程访问组件启动失败，请查看本地日志",
				en: "The remote-access component failed to start; see local logs"
			},
			"tunnel-not-ready": {
				zh: "请先开启远程控制",
				en: "Enable remote control first"
			},
			"persist-failed": {
				zh: "操作失败，请重试",
				en: "The operation failed; try again"
			},
			"bad-request": {
				zh: "请求无效",
				en: "Invalid request"
			},
			"update-unavailable": {
				zh: "暂时无法检查更新，请稍后再试",
				en: "Update check is unavailable right now; try again later"
			},
			"update-failed": {
				zh: "更新失败，当前版本继续运行，请重试",
				en: "Update failed — the current version keeps running; try again"
			},
			"update-version-mismatch": {
				zh: "更新后版本校验失败，当前版本继续运行",
				en: "Version verification failed after the update; the current version keeps running"
			},
			"update-in-progress": {
				zh: "正在更新中，请稍候",
				en: "An update is already in progress"
			},
			"cli-not-found": {
				zh: "未找到 DSH 命令行工具，无法更新",
				en: "The DSH CLI was not found; cannot update"
			}
		};
		/**
		* Logical connection-RPC channel for the mobile workspace directory browse.
		* Deliberately NOT under the `/dsh-remote` prefix: the gateway denies public
		* requests by `path.startsWith('/dsh-remote')` (defense in depth for the
		* management plane), and this channel must stay reachable from paired phones
		* through the gateway — still behind the device-session / pairing
		* authentication the gateway applies to every public request.
		*/
		const WORKSPACE_BROWSE_CHANNEL = "/dsh-workspace-browse";
		//#endregion
		//#region src/client/rpc-client.ts
		const CHANNEL = "/dsh-remote";
		/** Extract the plugin error code from a failed RpcResult. */
		function codeOf$1(result) {
			const message = result.error.message;
			return REMOTE_ERROR_CODE_SET.has(message) ? message : "internal";
		}
		function createRemoteClient(connection) {
			const call = connection.rpc.call.bind(connection.rpc);
			return {
				isLoopback: connection.isLoopback,
				async status() {
					const result = await call(CHANNEL, "status", {});
					if (result.ok) return result.value;
					return {
						available: false,
						enabled: false,
						phase: "error",
						errorCode: codeOf$1(result),
						devices: []
					};
				},
				async tunnelStart() {
					const result = await call(CHANNEL, "tunnelStart", {});
					if (result.ok) return {
						ok: true,
						...result.value
					};
					return {
						ok: false,
						errorCode: codeOf$1(result)
					};
				},
				async tunnelStop() {
					const result = await call(CHANNEL, "tunnelStop", {});
					return result.ok ? { ok: true } : {
						ok: false,
						errorCode: codeOf$1(result)
					};
				},
				async pairingStatus() {
					const result = await call(CHANNEL, "pairingStatus", {});
					if (result.ok) return result.value;
					return { state: "none" };
				},
				async pairingRotate() {
					const result = await call(CHANNEL, "pairingRotate", {});
					if (result.ok) return result.value;
					return codeOf$1(result);
				},
				async pairingLongStatus() {
					const result = await call(CHANNEL, "pairingLongStatus", {});
					if (result.ok) return result.value;
					return { state: "none" };
				},
				async pairingLongRotate(customCode) {
					const result = await call(CHANNEL, "pairingLongRotate", customCode === void 0 ? {} : { code: customCode });
					if (result.ok) return result.value;
					return codeOf$1(result);
				},
				async deviceRevoke(deviceId) {
					const result = await call(CHANNEL, "deviceRevoke", { deviceId });
					if (result.ok) return {
						ok: true,
						revoked: result.value.revoked
					};
					return {
						ok: false,
						errorCode: codeOf$1(result)
					};
				},
				async deviceRevokeAll() {
					const result = await call(CHANNEL, "deviceRevokeAll", {});
					return result.ok ? { ok: true } : {
						ok: false,
						errorCode: codeOf$1(result)
					};
				},
				async updateCheck(force) {
					const result = await call(CHANNEL, "updateCheck", { force });
					return result.ok ? result.value : {
						currentVersion: "",
						phase: "unavailable",
						error: codeOf$1(result)
					};
				},
				async updateApply() {
					const result = await call(CHANNEL, "updateApply", {});
					return result.ok ? result.value : {
						currentVersion: "",
						phase: "failed",
						error: codeOf$1(result)
					};
				},
				async networkConfigGet() {
					const result = await call(CHANNEL, "networkConfigGet", {});
					if (result.ok) return result.value;
					return {
						network: "auto",
						source: "auto"
					};
				},
				async networkConfigSet(settings) {
					const result = await call(CHANNEL, "networkConfigSet", { settings });
					return result.ok ? { ok: true } : {
						ok: false,
						errorCode: codeOf$1(result)
					};
				}
			};
		}
		//#endregion
		//#region src/client/locales.ts
		const NS = "dshRemoteAccess";
		const zh = {
			nav: "远程控制",
			offTitle: "远程控制",
			offHint: "通过手机、平板或其他浏览器安全远程控制当前 DSH。",
			enable: "开启远程控制",
			preparing: "正在准备安全连接…",
			checking: "正在检查 cloudflared…",
			creating: "正在创建 Cloudflare Tunnel…",
			onTitle: "远程控制",
			scanHint: "扫码安全配对",
			orManual: "或手动输入配对码",
			manualCode: "配对码",
			expiresIn: "剩余",
			publicUrl: "公网地址",
			copyUrl: "复制地址",
			copied: "已复制",
			devices: "已授权设备",
			deviceCount: "台",
			revoke: "撤销",
			revokeAll: "撤销全部设备",
			revokeAllConfirm: "确定要撤销全部设备吗？所有手机将需要重新配对。",
			revoked: "已撤销",
			revokeFailed: "撤销失败",
			disable: "停止远程控制",
			regenerate: "重新生成",
			expired: "配对码已过期",
			pairedSuccess: "设备已成功配对",
			credentialUsed: "当前配对凭证已使用。如需连接另一台设备，请生成新的配对码。",
			generateNew: "生成新的配对码",
			expiredNote: "为了安全，已过期的二维码和配对码不可继续使用。",
			noTicket: "当前没有可用的配对凭证",
			remoteOnly: "请在电脑上的 DSH 设置中管理远程控制",
			error: "错误",
			startError: "开启失败",
			stop: "停止",
			statusOff: "未开启",
			statusOn: "已开启",
			linkDegraded: "公网连接短暂波动，正在自动恢复…连接地址不变，无需重新扫码。",
			lastSeen: "最近使用",
			unknownDevice: "未知设备",
			drawerOpen: "打开目录",
			drawerClose: "关闭目录",
			credentialWarning: "二维码包含一次性配对凭据，请勿分享。公网访问地址本身不授予访问权限。",
			connectPhoneTitle: "手机连接",
			pairingTabOneTime: "一次性配对",
			pairingTabLong: "长期配对码",
			longTermBadge: "长期有效",
			longNoneHint: "还没有长期配对码。点击下方按钮生成后，手机可以随时用同一组码 / 二维码连接，直到你在此「换一组」。",
			generateLong: "生成长配对码",
			longRotate: "换一组新码（旧码全失效）",
			copyCode: "复制码",
			longActiveHint: "此码永久有效；扫码或输码均可连接。换一组后旧码立即失效。",
			longWarning: "长期配对码是长期有效的强凭据：任何拿到码的人都能连上你的电脑。不要截图分享或发给他人；需要时可随时「换一组」让旧码全部失效。",
			longHiddenHint: "检测到旧版长期码（仍可连接，但为安全不再显示原码）。点「换一组新码」或「设置自定义码」即可升级为新格式并重新显示。",
			longCustomTitle: "设置自定义码",
			longCustomPlaceholder: "输入自定义码",
			longCustomHint: "自定义码 6–12 位：字母 A–Z 与数字 0–9（不区分大小写，不含空格或符号）。",
			longCustomInvalid: "自定义码无效：请输入 6–12 位字母或数字（A–Z、0–9）。",
			longCustomUse: "使用自定义码",
			longRotateNote: "换一组 / 自定义只影响“未来”的新配对：已连接设备不受影响（如需强制下线请用「撤销全部设备」）。",
			diagnostics: "诊断信息",
			waiting: "已等待",
			downloading: "正在下载 Cloudflare Tunnel",
			downloadedSoFar: "已下载",
			of: "/",
			verifying: "正在校验 Cloudflare Tunnel…",
			startingConn: "正在启动安全连接…",
			connectingTunnel: "正在建立安全连接…",
			waitingAddr: "正在等待公网地址…",
			viaSystemProxy: "通过系统代理",
			viaCustomProxy: "通过自定义代理",
			viaEnvProxy: "通过环境代理",
			viaDirect: "直接连接",
			sourceSwitching: "官方源下载较慢，正在尝试备用镜像…",
			sourceOfficialLabel: "官方源",
			sourceMirrorLabel: "备用镜像",
			downloadSettings: "下载设置",
			downloadNetwork: "下载网络",
			networkAuto: "自动（推荐）",
			networkDirect: "直连",
			networkCustom: "自定义代理",
			customProxyUrl: "自定义代理地址",
			customProxyPlaceholder: "http://127.0.0.1:7890",
			customProxyRequired: "请填写自定义代理地址",
			customProxyInvalid: "代理地址格式无效，仅支持 http:// 或 https://",
			customProxyCredentials: "当前版本不支持在自定义代理设置中保存账号密码，请使用 HTTPS_PROXY 环境变量。",
			downloadSource: "下载源",
			sourceAuto: "自动（推荐）",
			sourceOfficial: "仅官方源",
			sourceMirror: "备用镜像",
			sourceNote: "自动模式优先使用 Cloudflare 官方源。官方源不可用时会尝试备用下载镜像。所有下载文件均会经过完整性和数字签名校验。",
			saveSettings: "保存设置",
			settingsSaved: "已保存",
			settingsSaving: "正在保存…",
			updateTitle: "插件更新",
			currentVersion: "当前版本",
			checkUpdate: "检查更新",
			checkingUpdate: "正在检查更新…",
			updateAvailable: "发现新版本",
			upToDate: "当前已经是最新版本",
			lastCheckAt: "上次检查",
			updateNotesUnavailable: "更新说明暂时无法加载",
			updateNow: "立即更新",
			later: "稍后",
			updatePostponed: "已选择稍后更新",
			updating: "正在更新…",
			updateInstalled: "更新已安装，需要重启 DSH 后生效",
			updateFailed: "更新失败，当前版本继续运行",
			updateUnavailable: "检查更新失败，请稍后重试",
			pickerTitle: "选择工作区目录",
			pickerSelectCurrent: "选择当前目录",
			pickerCancel: "取消",
			pickerLoading: "加载中…",
			pickerRetry: "重试",
			pickerUnreadable: "无法读取该目录，请检查权限后重试。",
			pickerInternal: "读取目录时发生错误，请重试。",
			pickerComputer: "此电脑",
			pickerBack: "返回",
			pickerTruncated: "文件夹过多，仅显示开头部分。"
		};
		const en = {
			nav: "Remote Control",
			offTitle: "Remote Control",
			offHint: "Securely control this DSH instance from your phone, tablet, or another browser.",
			enable: "Enable remote control",
			preparing: "Preparing a secure connection…",
			checking: "Checking cloudflared…",
			creating: "Creating the Cloudflare Tunnel…",
			onTitle: "Remote Control",
			scanHint: "Scan to pair securely",
			orManual: "Or enter the pairing code",
			manualCode: "Pairing code",
			expiresIn: "Expires in",
			publicUrl: "Public address",
			copyUrl: "Copy address",
			copied: "Copied",
			devices: "Authorized devices",
			deviceCount: "",
			revoke: "Revoke",
			revokeAll: "Revoke all devices",
			revokeAllConfirm: "Revoke every device? All phones will need to pair again.",
			revoked: "Revoked",
			revokeFailed: "Revocation failed",
			disable: "Stop remote control",
			regenerate: "Regenerate",
			expired: "Pairing code expired",
			pairedSuccess: "Device paired successfully",
			credentialUsed: "This pairing credential has been used. Generate a new pairing code to connect another device.",
			generateNew: "Generate new pairing code",
			expiredNote: "For security, the expired QR code and pairing code can no longer be used.",
			noTicket: "No pairing credential is available",
			remoteOnly: "Manage remote control from the DSH settings on your computer",
			error: "Error",
			startError: "Failed to enable",
			stop: "Stop",
			statusOff: "Off",
			statusOn: "On",
			linkDegraded: "The public link is briefly unstable and is recovering automatically… the address is unchanged, no re-pairing needed.",
			lastSeen: "Last used",
			unknownDevice: "Unknown device",
			drawerOpen: "Open directory",
			drawerClose: "Close directory",
			credentialWarning: "The QR code contains a one-time pairing credential — never share it. The public address itself grants no access.",
			connectPhoneTitle: "Connect your phone",
			pairingTabOneTime: "One-time pairing",
			pairingTabLong: "Long-term code",
			longTermBadge: "Long-term",
			longNoneHint: "No long-term code yet. Generate one below and your phone can keep connecting with the same code / QR until you rotate it here.",
			generateLong: "Generate long-term code",
			longRotate: "Get a new code (the old one stops working)",
			copyCode: "Copy code",
			longActiveHint: "Valid forever — connect by scanning or by typing the code. Rotating invalidates the old code immediately.",
			longWarning: "A long-term code is a standing credential: anyone holding it can reach your computer. Never screenshot or share it; rotate it anytime to invalidate the old one.",
			longHiddenHint: "A legacy-format long-term code is active and still connects, but for security its plaintext is no longer shown. Rotate or set a custom code to upgrade to the current format and display it again.",
			longCustomTitle: "Set a custom code",
			longCustomPlaceholder: "Type a custom code",
			longCustomHint: "Custom codes are 6–12 characters: letters A–Z and digits 0–9 (case-insensitive; no spaces or symbols).",
			longCustomInvalid: "Invalid custom code: use 6–12 letters or digits (A–Z, 0–9).",
			longCustomUse: "Use this code",
			longRotateNote: "Rotating / setting a custom code only affects FUTURE pairing attempts: already-connected devices keep working (force them offline with \"Revoke all devices\").",
			diagnostics: "Diagnostics",
			waiting: "waiting",
			downloading: "Downloading Cloudflare Tunnel",
			downloadedSoFar: "Downloaded",
			of: "of",
			verifying: "Verifying Cloudflare Tunnel…",
			startingConn: "Starting the secure connection…",
			connectingTunnel: "Establishing the secure connection…",
			waitingAddr: "Waiting for the public address…",
			viaSystemProxy: "via system proxy",
			viaCustomProxy: "via custom proxy",
			viaEnvProxy: "via environment proxy",
			viaDirect: "direct connection",
			sourceSwitching: "The official source is slow; trying a backup mirror…",
			sourceOfficialLabel: "official source",
			sourceMirrorLabel: "backup mirror",
			downloadSettings: "Download settings",
			downloadNetwork: "Download network",
			networkAuto: "Auto (recommended)",
			networkDirect: "Direct",
			networkCustom: "Custom proxy",
			customProxyUrl: "Custom proxy URL",
			customProxyPlaceholder: "http://127.0.0.1:7890",
			customProxyRequired: "Enter the custom proxy URL",
			customProxyInvalid: "Invalid proxy URL — only http:// and https:// are supported",
			customProxyCredentials: "This version cannot store credentials in the custom proxy setting; use the HTTPS_PROXY environment variable instead.",
			downloadSource: "Download source",
			sourceAuto: "Auto (recommended)",
			sourceOfficial: "Official source only",
			sourceMirror: "Backup mirrors",
			sourceNote: "Auto mode prefers the official Cloudflare source. When it is unavailable, verified backup mirrors are tried. Every downloaded file passes full integrity and digital-signature verification.",
			saveSettings: "Save settings",
			settingsSaved: "Saved",
			settingsSaving: "Saving…",
			updateTitle: "Plugin updates",
			currentVersion: "Current version",
			checkUpdate: "Check for updates",
			checkingUpdate: "Checking for updates…",
			updateAvailable: "New version available",
			upToDate: "You are up to date",
			lastCheckAt: "Last checked",
			updateNotesUnavailable: "Release notes are unavailable right now",
			updateNow: "Update now",
			later: "Later",
			updatePostponed: "Update postponed",
			updating: "Updating…",
			updateInstalled: "Update installed — restart DSH to apply",
			updateFailed: "Update failed — the current version keeps running",
			updateUnavailable: "Update check failed — try again later",
			pickerTitle: "Select Workspace Directory",
			pickerSelectCurrent: "Select this directory",
			pickerCancel: "Cancel",
			pickerLoading: "Loading…",
			pickerRetry: "Retry",
			pickerUnreadable: "Cannot read this directory; check permissions and try again.",
			pickerInternal: "An error occurred while reading the directory; try again.",
			pickerComputer: "This computer",
			pickerBack: "Back",
			pickerTruncated: "Too many folders to list; only the beginning is shown."
		};
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/can-promise.js
		var require_can_promise = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			module.exports = function() {
				return typeof Promise === "function" && Promise.prototype && Promise.prototype.then;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/utils.js
		var require_utils$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
			let toSJISFunction;
			const CODEWORDS_COUNT = [
				0,
				26,
				44,
				70,
				100,
				134,
				172,
				196,
				242,
				292,
				346,
				404,
				466,
				532,
				581,
				655,
				733,
				815,
				901,
				991,
				1085,
				1156,
				1258,
				1364,
				1474,
				1588,
				1706,
				1828,
				1921,
				2051,
				2185,
				2323,
				2465,
				2611,
				2761,
				2876,
				3034,
				3196,
				3362,
				3532,
				3706
			];
			/**
			* Returns the QR Code size for the specified version
			*
			* @param  {Number} version QR Code version
			* @return {Number}         size of QR code
			*/
			exports.getSymbolSize = function getSymbolSize(version) {
				if (!version) throw new Error("\"version\" cannot be null or undefined");
				if (version < 1 || version > 40) throw new Error("\"version\" should be in range from 1 to 40");
				return version * 4 + 17;
			};
			/**
			* Returns the total number of codewords used to store data and EC information.
			*
			* @param  {Number} version QR Code version
			* @return {Number}         Data length in bits
			*/
			exports.getSymbolTotalCodewords = function getSymbolTotalCodewords(version) {
				return CODEWORDS_COUNT[version];
			};
			/**
			* Encode data with Bose-Chaudhuri-Hocquenghem
			*
			* @param  {Number} data Value to encode
			* @return {Number}      Encoded value
			*/
			exports.getBCHDigit = function(data) {
				let digit = 0;
				while (data !== 0) {
					digit++;
					data >>>= 1;
				}
				return digit;
			};
			exports.setToSJISFunction = function setToSJISFunction(f) {
				if (typeof f !== "function") throw new Error("\"toSJISFunc\" is not a valid function.");
				toSJISFunction = f;
			};
			exports.isKanjiModeEnabled = function() {
				return typeof toSJISFunction !== "undefined";
			};
			exports.toSJIS = function toSJIS(kanji) {
				return toSJISFunction(kanji);
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/error-correction-level.js
		var require_error_correction_level = /* @__PURE__ */ __commonJSMin(((exports) => {
			exports.L = { bit: 1 };
			exports.M = { bit: 0 };
			exports.Q = { bit: 3 };
			exports.H = { bit: 2 };
			function fromString(string) {
				if (typeof string !== "string") throw new Error("Param is not a string");
				switch (string.toLowerCase()) {
					case "l":
					case "low": return exports.L;
					case "m":
					case "medium": return exports.M;
					case "q":
					case "quartile": return exports.Q;
					case "h":
					case "high": return exports.H;
					default: throw new Error("Unknown EC Level: " + string);
				}
			}
			exports.isValid = function isValid(level) {
				return level && typeof level.bit !== "undefined" && level.bit >= 0 && level.bit < 4;
			};
			exports.from = function from(value, defaultValue) {
				if (exports.isValid(value)) return value;
				try {
					return fromString(value);
				} catch (e) {
					return defaultValue;
				}
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/bit-buffer.js
		var require_bit_buffer = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			function BitBuffer() {
				this.buffer = [];
				this.length = 0;
			}
			BitBuffer.prototype = {
				get: function(index) {
					const bufIndex = Math.floor(index / 8);
					return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
				},
				put: function(num, length) {
					for (let i = 0; i < length; i++) this.putBit((num >>> length - i - 1 & 1) === 1);
				},
				getLengthInBits: function() {
					return this.length;
				},
				putBit: function(bit) {
					const bufIndex = Math.floor(this.length / 8);
					if (this.buffer.length <= bufIndex) this.buffer.push(0);
					if (bit) this.buffer[bufIndex] |= 128 >>> this.length % 8;
					this.length++;
				}
			};
			module.exports = BitBuffer;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/bit-matrix.js
		var require_bit_matrix = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			/**
			* Helper class to handle QR Code symbol modules
			*
			* @param {Number} size Symbol size
			*/
			function BitMatrix(size) {
				if (!size || size < 1) throw new Error("BitMatrix size must be defined and greater than 0");
				this.size = size;
				this.data = new Uint8Array(size * size);
				this.reservedBit = new Uint8Array(size * size);
			}
			/**
			* Set bit value at specified location
			* If reserved flag is set, this bit will be ignored during masking process
			*
			* @param {Number}  row
			* @param {Number}  col
			* @param {Boolean} value
			* @param {Boolean} reserved
			*/
			BitMatrix.prototype.set = function(row, col, value, reserved) {
				const index = row * this.size + col;
				this.data[index] = value;
				if (reserved) this.reservedBit[index] = true;
			};
			/**
			* Returns bit value at specified location
			*
			* @param  {Number}  row
			* @param  {Number}  col
			* @return {Boolean}
			*/
			BitMatrix.prototype.get = function(row, col) {
				return this.data[row * this.size + col];
			};
			/**
			* Applies xor operator at specified location
			* (used during masking process)
			*
			* @param {Number}  row
			* @param {Number}  col
			* @param {Boolean} value
			*/
			BitMatrix.prototype.xor = function(row, col, value) {
				this.data[row * this.size + col] ^= value;
			};
			/**
			* Check if bit at specified location is reserved
			*
			* @param {Number}   row
			* @param {Number}   col
			* @return {Boolean}
			*/
			BitMatrix.prototype.isReserved = function(row, col) {
				return this.reservedBit[row * this.size + col];
			};
			module.exports = BitMatrix;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/alignment-pattern.js
		var require_alignment_pattern = /* @__PURE__ */ __commonJSMin(((exports) => {
			/**
			* Alignment pattern are fixed reference pattern in defined positions
			* in a matrix symbology, which enables the decode software to re-synchronise
			* the coordinate mapping of the image modules in the event of moderate amounts
			* of distortion of the image.
			*
			* Alignment patterns are present only in QR Code symbols of version 2 or larger
			* and their number depends on the symbol version.
			*/
			const getSymbolSize = require_utils$1().getSymbolSize;
			/**
			* Calculate the row/column coordinates of the center module of each alignment pattern
			* for the specified QR Code version.
			*
			* The alignment patterns are positioned symmetrically on either side of the diagonal
			* running from the top left corner of the symbol to the bottom right corner.
			*
			* Since positions are simmetrical only half of the coordinates are returned.
			* Each item of the array will represent in turn the x and y coordinate.
			* @see {@link getPositions}
			*
			* @param  {Number} version QR Code version
			* @return {Array}          Array of coordinate
			*/
			exports.getRowColCoords = function getRowColCoords(version) {
				if (version === 1) return [];
				const posCount = Math.floor(version / 7) + 2;
				const size = getSymbolSize(version);
				const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
				const positions = [size - 7];
				for (let i = 1; i < posCount - 1; i++) positions[i] = positions[i - 1] - intervals;
				positions.push(6);
				return positions.reverse();
			};
			/**
			* Returns an array containing the positions of each alignment pattern.
			* Each array's element represent the center point of the pattern as (x, y) coordinates
			*
			* Coordinates are calculated expanding the row/column coordinates returned by {@link getRowColCoords}
			* and filtering out the items that overlaps with finder pattern
			*
			* @example
			* For a Version 7 symbol {@link getRowColCoords} returns values 6, 22 and 38.
			* The alignment patterns, therefore, are to be centered on (row, column)
			* positions (6,22), (22,6), (22,22), (22,38), (38,22), (38,38).
			* Note that the coordinates (6,6), (6,38), (38,6) are occupied by finder patterns
			* and are not therefore used for alignment patterns.
			*
			* let pos = getPositions(7)
			* // [[6,22], [22,6], [22,22], [22,38], [38,22], [38,38]]
			*
			* @param  {Number} version QR Code version
			* @return {Array}          Array of coordinates
			*/
			exports.getPositions = function getPositions(version) {
				const coords = [];
				const pos = exports.getRowColCoords(version);
				const posLength = pos.length;
				for (let i = 0; i < posLength; i++) for (let j = 0; j < posLength; j++) {
					if (i === 0 && j === 0 || i === 0 && j === posLength - 1 || i === posLength - 1 && j === 0) continue;
					coords.push([pos[i], pos[j]]);
				}
				return coords;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/finder-pattern.js
		var require_finder_pattern = /* @__PURE__ */ __commonJSMin(((exports) => {
			const getSymbolSize = require_utils$1().getSymbolSize;
			const FINDER_PATTERN_SIZE = 7;
			/**
			* Returns an array containing the positions of each finder pattern.
			* Each array's element represent the top-left point of the pattern as (x, y) coordinates
			*
			* @param  {Number} version QR Code version
			* @return {Array}          Array of coordinates
			*/
			exports.getPositions = function getPositions(version) {
				const size = getSymbolSize(version);
				return [
					[0, 0],
					[size - FINDER_PATTERN_SIZE, 0],
					[0, size - FINDER_PATTERN_SIZE]
				];
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/mask-pattern.js
		var require_mask_pattern = /* @__PURE__ */ __commonJSMin(((exports) => {
			/**
			* Data mask pattern reference
			* @type {Object}
			*/
			exports.Patterns = {
				PATTERN000: 0,
				PATTERN001: 1,
				PATTERN010: 2,
				PATTERN011: 3,
				PATTERN100: 4,
				PATTERN101: 5,
				PATTERN110: 6,
				PATTERN111: 7
			};
			/**
			* Weighted penalty scores for the undesirable features
			* @type {Object}
			*/
			const PenaltyScores = {
				N1: 3,
				N2: 3,
				N3: 40,
				N4: 10
			};
			/**
			* Check if mask pattern value is valid
			*
			* @param  {Number}  mask    Mask pattern
			* @return {Boolean}         true if valid, false otherwise
			*/
			exports.isValid = function isValid(mask) {
				return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
			};
			/**
			* Returns mask pattern from a value.
			* If value is not valid, returns undefined
			*
			* @param  {Number|String} value        Mask pattern value
			* @return {Number}                     Valid mask pattern or undefined
			*/
			exports.from = function from(value) {
				return exports.isValid(value) ? parseInt(value, 10) : void 0;
			};
			/**
			* Find adjacent modules in row/column with the same color
			* and assign a penalty value.
			*
			* Points: N1 + i
			* i is the amount by which the number of adjacent modules of the same color exceeds 5
			*/
			exports.getPenaltyN1 = function getPenaltyN1(data) {
				const size = data.size;
				let points = 0;
				let sameCountCol = 0;
				let sameCountRow = 0;
				let lastCol = null;
				let lastRow = null;
				for (let row = 0; row < size; row++) {
					sameCountCol = sameCountRow = 0;
					lastCol = lastRow = null;
					for (let col = 0; col < size; col++) {
						let module$1 = data.get(row, col);
						if (module$1 === lastCol) sameCountCol++;
						else {
							if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
							lastCol = module$1;
							sameCountCol = 1;
						}
						module$1 = data.get(col, row);
						if (module$1 === lastRow) sameCountRow++;
						else {
							if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
							lastRow = module$1;
							sameCountRow = 1;
						}
					}
					if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
					if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
				}
				return points;
			};
			/**
			* Find 2x2 blocks with the same color and assign a penalty value
			*
			* Points: N2 * (m - 1) * (n - 1)
			*/
			exports.getPenaltyN2 = function getPenaltyN2(data) {
				const size = data.size;
				let points = 0;
				for (let row = 0; row < size - 1; row++) for (let col = 0; col < size - 1; col++) {
					const last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
					if (last === 4 || last === 0) points++;
				}
				return points * PenaltyScores.N2;
			};
			/**
			* Find 1:1:3:1:1 ratio (dark:light:dark:light:dark) pattern in row/column,
			* preceded or followed by light area 4 modules wide
			*
			* Points: N3 * number of pattern found
			*/
			exports.getPenaltyN3 = function getPenaltyN3(data) {
				const size = data.size;
				let points = 0;
				let bitsCol = 0;
				let bitsRow = 0;
				for (let row = 0; row < size; row++) {
					bitsCol = bitsRow = 0;
					for (let col = 0; col < size; col++) {
						bitsCol = bitsCol << 1 & 2047 | data.get(row, col);
						if (col >= 10 && (bitsCol === 1488 || bitsCol === 93)) points++;
						bitsRow = bitsRow << 1 & 2047 | data.get(col, row);
						if (col >= 10 && (bitsRow === 1488 || bitsRow === 93)) points++;
					}
				}
				return points * PenaltyScores.N3;
			};
			/**
			* Calculate proportion of dark modules in entire symbol
			*
			* Points: N4 * k
			*
			* k is the rating of the deviation of the proportion of dark modules
			* in the symbol from 50% in steps of 5%
			*/
			exports.getPenaltyN4 = function getPenaltyN4(data) {
				let darkCount = 0;
				const modulesCount = data.data.length;
				for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
				return Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10) * PenaltyScores.N4;
			};
			/**
			* Return mask value at given position
			*
			* @param  {Number} maskPattern Pattern reference value
			* @param  {Number} i           Row
			* @param  {Number} j           Column
			* @return {Boolean}            Mask value
			*/
			function getMaskAt(maskPattern, i, j) {
				switch (maskPattern) {
					case exports.Patterns.PATTERN000: return (i + j) % 2 === 0;
					case exports.Patterns.PATTERN001: return i % 2 === 0;
					case exports.Patterns.PATTERN010: return j % 3 === 0;
					case exports.Patterns.PATTERN011: return (i + j) % 3 === 0;
					case exports.Patterns.PATTERN100: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
					case exports.Patterns.PATTERN101: return i * j % 2 + i * j % 3 === 0;
					case exports.Patterns.PATTERN110: return (i * j % 2 + i * j % 3) % 2 === 0;
					case exports.Patterns.PATTERN111: return (i * j % 3 + (i + j) % 2) % 2 === 0;
					default: throw new Error("bad maskPattern:" + maskPattern);
				}
			}
			/**
			* Apply a mask pattern to a BitMatrix
			*
			* @param  {Number}    pattern Pattern reference number
			* @param  {BitMatrix} data    BitMatrix data
			*/
			exports.applyMask = function applyMask(pattern, data) {
				const size = data.size;
				for (let col = 0; col < size; col++) for (let row = 0; row < size; row++) {
					if (data.isReserved(row, col)) continue;
					data.xor(row, col, getMaskAt(pattern, row, col));
				}
			};
			/**
			* Returns the best mask pattern for data
			*
			* @param  {BitMatrix} data
			* @return {Number} Mask pattern reference number
			*/
			exports.getBestMask = function getBestMask(data, setupFormatFunc) {
				const numPatterns = Object.keys(exports.Patterns).length;
				let bestPattern = 0;
				let lowerPenalty = Infinity;
				for (let p = 0; p < numPatterns; p++) {
					setupFormatFunc(p);
					exports.applyMask(p, data);
					const penalty = exports.getPenaltyN1(data) + exports.getPenaltyN2(data) + exports.getPenaltyN3(data) + exports.getPenaltyN4(data);
					exports.applyMask(p, data);
					if (penalty < lowerPenalty) {
						lowerPenalty = penalty;
						bestPattern = p;
					}
				}
				return bestPattern;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/error-correction-code.js
		var require_error_correction_code = /* @__PURE__ */ __commonJSMin(((exports) => {
			const ECLevel = require_error_correction_level();
			const EC_BLOCKS_TABLE = [
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				2,
				2,
				1,
				2,
				2,
				4,
				1,
				2,
				4,
				4,
				2,
				4,
				4,
				4,
				2,
				4,
				6,
				5,
				2,
				4,
				6,
				6,
				2,
				5,
				8,
				8,
				4,
				5,
				8,
				8,
				4,
				5,
				8,
				11,
				4,
				8,
				10,
				11,
				4,
				9,
				12,
				16,
				4,
				9,
				16,
				16,
				6,
				10,
				12,
				18,
				6,
				10,
				17,
				16,
				6,
				11,
				16,
				19,
				6,
				13,
				18,
				21,
				7,
				14,
				21,
				25,
				8,
				16,
				20,
				25,
				8,
				17,
				23,
				25,
				9,
				17,
				23,
				34,
				9,
				18,
				25,
				30,
				10,
				20,
				27,
				32,
				12,
				21,
				29,
				35,
				12,
				23,
				34,
				37,
				12,
				25,
				34,
				40,
				13,
				26,
				35,
				42,
				14,
				28,
				38,
				45,
				15,
				29,
				40,
				48,
				16,
				31,
				43,
				51,
				17,
				33,
				45,
				54,
				18,
				35,
				48,
				57,
				19,
				37,
				51,
				60,
				19,
				38,
				53,
				63,
				20,
				40,
				56,
				66,
				21,
				43,
				59,
				70,
				22,
				45,
				62,
				74,
				24,
				47,
				65,
				77,
				25,
				49,
				68,
				81
			];
			const EC_CODEWORDS_TABLE = [
				7,
				10,
				13,
				17,
				10,
				16,
				22,
				28,
				15,
				26,
				36,
				44,
				20,
				36,
				52,
				64,
				26,
				48,
				72,
				88,
				36,
				64,
				96,
				112,
				40,
				72,
				108,
				130,
				48,
				88,
				132,
				156,
				60,
				110,
				160,
				192,
				72,
				130,
				192,
				224,
				80,
				150,
				224,
				264,
				96,
				176,
				260,
				308,
				104,
				198,
				288,
				352,
				120,
				216,
				320,
				384,
				132,
				240,
				360,
				432,
				144,
				280,
				408,
				480,
				168,
				308,
				448,
				532,
				180,
				338,
				504,
				588,
				196,
				364,
				546,
				650,
				224,
				416,
				600,
				700,
				224,
				442,
				644,
				750,
				252,
				476,
				690,
				816,
				270,
				504,
				750,
				900,
				300,
				560,
				810,
				960,
				312,
				588,
				870,
				1050,
				336,
				644,
				952,
				1110,
				360,
				700,
				1020,
				1200,
				390,
				728,
				1050,
				1260,
				420,
				784,
				1140,
				1350,
				450,
				812,
				1200,
				1440,
				480,
				868,
				1290,
				1530,
				510,
				924,
				1350,
				1620,
				540,
				980,
				1440,
				1710,
				570,
				1036,
				1530,
				1800,
				570,
				1064,
				1590,
				1890,
				600,
				1120,
				1680,
				1980,
				630,
				1204,
				1770,
				2100,
				660,
				1260,
				1860,
				2220,
				720,
				1316,
				1950,
				2310,
				750,
				1372,
				2040,
				2430
			];
			/**
			* Returns the number of error correction block that the QR Code should contain
			* for the specified version and error correction level.
			*
			* @param  {Number} version              QR Code version
			* @param  {Number} errorCorrectionLevel Error correction level
			* @return {Number}                      Number of error correction blocks
			*/
			exports.getBlocksCount = function getBlocksCount(version, errorCorrectionLevel) {
				switch (errorCorrectionLevel) {
					case ECLevel.L: return EC_BLOCKS_TABLE[(version - 1) * 4 + 0];
					case ECLevel.M: return EC_BLOCKS_TABLE[(version - 1) * 4 + 1];
					case ECLevel.Q: return EC_BLOCKS_TABLE[(version - 1) * 4 + 2];
					case ECLevel.H: return EC_BLOCKS_TABLE[(version - 1) * 4 + 3];
					default: return;
				}
			};
			/**
			* Returns the number of error correction codewords to use for the specified
			* version and error correction level.
			*
			* @param  {Number} version              QR Code version
			* @param  {Number} errorCorrectionLevel Error correction level
			* @return {Number}                      Number of error correction codewords
			*/
			exports.getTotalCodewordsCount = function getTotalCodewordsCount(version, errorCorrectionLevel) {
				switch (errorCorrectionLevel) {
					case ECLevel.L: return EC_CODEWORDS_TABLE[(version - 1) * 4 + 0];
					case ECLevel.M: return EC_CODEWORDS_TABLE[(version - 1) * 4 + 1];
					case ECLevel.Q: return EC_CODEWORDS_TABLE[(version - 1) * 4 + 2];
					case ECLevel.H: return EC_CODEWORDS_TABLE[(version - 1) * 4 + 3];
					default: return;
				}
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/galois-field.js
		var require_galois_field = /* @__PURE__ */ __commonJSMin(((exports) => {
			const EXP_TABLE = /* @__PURE__ */ new Uint8Array(512);
			const LOG_TABLE = /* @__PURE__ */ new Uint8Array(256);
			(function initTables() {
				let x = 1;
				for (let i = 0; i < 255; i++) {
					EXP_TABLE[i] = x;
					LOG_TABLE[x] = i;
					x <<= 1;
					if (x & 256) x ^= 285;
				}
				for (let i = 255; i < 512; i++) EXP_TABLE[i] = EXP_TABLE[i - 255];
			})();
			/**
			* Returns log value of n inside Galois Field
			*
			* @param  {Number} n
			* @return {Number}
			*/
			exports.log = function log(n) {
				if (n < 1) throw new Error("log(" + n + ")");
				return LOG_TABLE[n];
			};
			/**
			* Returns anti-log value of n inside Galois Field
			*
			* @param  {Number} n
			* @return {Number}
			*/
			exports.exp = function exp(n) {
				return EXP_TABLE[n];
			};
			/**
			* Multiplies two number inside Galois Field
			*
			* @param  {Number} x
			* @param  {Number} y
			* @return {Number}
			*/
			exports.mul = function mul(x, y) {
				if (x === 0 || y === 0) return 0;
				return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/polynomial.js
		var require_polynomial = /* @__PURE__ */ __commonJSMin(((exports) => {
			const GF = require_galois_field();
			/**
			* Multiplies two polynomials inside Galois Field
			*
			* @param  {Uint8Array} p1 Polynomial
			* @param  {Uint8Array} p2 Polynomial
			* @return {Uint8Array}    Product of p1 and p2
			*/
			exports.mul = function mul(p1, p2) {
				const coeff = new Uint8Array(p1.length + p2.length - 1);
				for (let i = 0; i < p1.length; i++) for (let j = 0; j < p2.length; j++) coeff[i + j] ^= GF.mul(p1[i], p2[j]);
				return coeff;
			};
			/**
			* Calculate the remainder of polynomials division
			*
			* @param  {Uint8Array} divident Polynomial
			* @param  {Uint8Array} divisor  Polynomial
			* @return {Uint8Array}          Remainder
			*/
			exports.mod = function mod(divident, divisor) {
				let result = new Uint8Array(divident);
				while (result.length - divisor.length >= 0) {
					const coeff = result[0];
					for (let i = 0; i < divisor.length; i++) result[i] ^= GF.mul(divisor[i], coeff);
					let offset = 0;
					while (offset < result.length && result[offset] === 0) offset++;
					result = result.slice(offset);
				}
				return result;
			};
			/**
			* Generate an irreducible generator polynomial of specified degree
			* (used by Reed-Solomon encoder)
			*
			* @param  {Number} degree Degree of the generator polynomial
			* @return {Uint8Array}    Buffer containing polynomial coefficients
			*/
			exports.generateECPolynomial = function generateECPolynomial(degree) {
				let poly = new Uint8Array([1]);
				for (let i = 0; i < degree; i++) poly = exports.mul(poly, new Uint8Array([1, GF.exp(i)]));
				return poly;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/reed-solomon-encoder.js
		var require_reed_solomon_encoder = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Polynomial = require_polynomial();
			function ReedSolomonEncoder(degree) {
				this.genPoly = void 0;
				this.degree = degree;
				if (this.degree) this.initialize(this.degree);
			}
			/**
			* Initialize the encoder.
			* The input param should correspond to the number of error correction codewords.
			*
			* @param  {Number} degree
			*/
			ReedSolomonEncoder.prototype.initialize = function initialize(degree) {
				this.degree = degree;
				this.genPoly = Polynomial.generateECPolynomial(this.degree);
			};
			/**
			* Encodes a chunk of data
			*
			* @param  {Uint8Array} data Buffer containing input data
			* @return {Uint8Array}      Buffer containing encoded data
			*/
			ReedSolomonEncoder.prototype.encode = function encode(data) {
				if (!this.genPoly) throw new Error("Encoder not initialized");
				const paddedData = new Uint8Array(data.length + this.degree);
				paddedData.set(data);
				const remainder = Polynomial.mod(paddedData, this.genPoly);
				const start = this.degree - remainder.length;
				if (start > 0) {
					const buff = new Uint8Array(this.degree);
					buff.set(remainder, start);
					return buff;
				}
				return remainder;
			};
			module.exports = ReedSolomonEncoder;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/version-check.js
		var require_version_check = /* @__PURE__ */ __commonJSMin(((exports) => {
			/**
			* Check if QR Code version is valid
			*
			* @param  {Number}  version QR Code version
			* @return {Boolean}         true if valid version, false otherwise
			*/
			exports.isValid = function isValid(version) {
				return !isNaN(version) && version >= 1 && version <= 40;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/regex.js
		var require_regex = /* @__PURE__ */ __commonJSMin(((exports) => {
			const numeric = "[0-9]+";
			const alphanumeric = "[A-Z $%*+\\-./:]+";
			let kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
			kanji = kanji.replace(/u/g, "\\u");
			const byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + ")(?:.|[\r\n]))+";
			exports.KANJI = new RegExp(kanji, "g");
			exports.BYTE_KANJI = /* @__PURE__ */ new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
			exports.BYTE = new RegExp(byte, "g");
			exports.NUMERIC = new RegExp(numeric, "g");
			exports.ALPHANUMERIC = new RegExp(alphanumeric, "g");
			const TEST_KANJI = new RegExp("^" + kanji + "$");
			const TEST_NUMERIC = /* @__PURE__ */ new RegExp("^[0-9]+$");
			const TEST_ALPHANUMERIC = /* @__PURE__ */ new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
			exports.testKanji = function testKanji(str) {
				return TEST_KANJI.test(str);
			};
			exports.testNumeric = function testNumeric(str) {
				return TEST_NUMERIC.test(str);
			};
			exports.testAlphanumeric = function testAlphanumeric(str) {
				return TEST_ALPHANUMERIC.test(str);
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/mode.js
		var require_mode = /* @__PURE__ */ __commonJSMin(((exports) => {
			const VersionCheck = require_version_check();
			const Regex = require_regex();
			/**
			* Numeric mode encodes data from the decimal digit set (0 - 9)
			* (byte values 30HEX to 39HEX).
			* Normally, 3 data characters are represented by 10 bits.
			*
			* @type {Object}
			*/
			exports.NUMERIC = {
				id: "Numeric",
				bit: 1,
				ccBits: [
					10,
					12,
					14
				]
			};
			/**
			* Alphanumeric mode encodes data from a set of 45 characters,
			* i.e. 10 numeric digits (0 - 9),
			*      26 alphabetic characters (A - Z),
			*   and 9 symbols (SP, $, %, *, +, -, ., /, :).
			* Normally, two input characters are represented by 11 bits.
			*
			* @type {Object}
			*/
			exports.ALPHANUMERIC = {
				id: "Alphanumeric",
				bit: 2,
				ccBits: [
					9,
					11,
					13
				]
			};
			/**
			* In byte mode, data is encoded at 8 bits per character.
			*
			* @type {Object}
			*/
			exports.BYTE = {
				id: "Byte",
				bit: 4,
				ccBits: [
					8,
					16,
					16
				]
			};
			/**
			* The Kanji mode efficiently encodes Kanji characters in accordance with
			* the Shift JIS system based on JIS X 0208.
			* The Shift JIS values are shifted from the JIS X 0208 values.
			* JIS X 0208 gives details of the shift coded representation.
			* Each two-byte character value is compacted to a 13-bit binary codeword.
			*
			* @type {Object}
			*/
			exports.KANJI = {
				id: "Kanji",
				bit: 8,
				ccBits: [
					8,
					10,
					12
				]
			};
			/**
			* Mixed mode will contain a sequences of data in a combination of any of
			* the modes described above
			*
			* @type {Object}
			*/
			exports.MIXED = { bit: -1 };
			/**
			* Returns the number of bits needed to store the data length
			* according to QR Code specifications.
			*
			* @param  {Mode}   mode    Data mode
			* @param  {Number} version QR Code version
			* @return {Number}         Number of bits
			*/
			exports.getCharCountIndicator = function getCharCountIndicator(mode, version) {
				if (!mode.ccBits) throw new Error("Invalid mode: " + mode);
				if (!VersionCheck.isValid(version)) throw new Error("Invalid version: " + version);
				if (version >= 1 && version < 10) return mode.ccBits[0];
				else if (version < 27) return mode.ccBits[1];
				return mode.ccBits[2];
			};
			/**
			* Returns the most efficient mode to store the specified data
			*
			* @param  {String} dataStr Input data string
			* @return {Mode}           Best mode
			*/
			exports.getBestModeForData = function getBestModeForData(dataStr) {
				if (Regex.testNumeric(dataStr)) return exports.NUMERIC;
				else if (Regex.testAlphanumeric(dataStr)) return exports.ALPHANUMERIC;
				else if (Regex.testKanji(dataStr)) return exports.KANJI;
				else return exports.BYTE;
			};
			/**
			* Return mode name as string
			*
			* @param {Mode} mode Mode object
			* @returns {String}  Mode name
			*/
			exports.toString = function toString(mode) {
				if (mode && mode.id) return mode.id;
				throw new Error("Invalid mode");
			};
			/**
			* Check if input param is a valid mode object
			*
			* @param   {Mode}    mode Mode object
			* @returns {Boolean} True if valid mode, false otherwise
			*/
			exports.isValid = function isValid(mode) {
				return mode && mode.bit && mode.ccBits;
			};
			/**
			* Get mode object from its name
			*
			* @param   {String} string Mode name
			* @returns {Mode}          Mode object
			*/
			function fromString(string) {
				if (typeof string !== "string") throw new Error("Param is not a string");
				switch (string.toLowerCase()) {
					case "numeric": return exports.NUMERIC;
					case "alphanumeric": return exports.ALPHANUMERIC;
					case "kanji": return exports.KANJI;
					case "byte": return exports.BYTE;
					default: throw new Error("Unknown mode: " + string);
				}
			}
			/**
			* Returns mode from a value.
			* If value is not a valid mode, returns defaultValue
			*
			* @param  {Mode|String} value        Encoding mode
			* @param  {Mode}        defaultValue Fallback value
			* @return {Mode}                     Encoding mode
			*/
			exports.from = function from(value, defaultValue) {
				if (exports.isValid(value)) return value;
				try {
					return fromString(value);
				} catch (e) {
					return defaultValue;
				}
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/version.js
		var require_version = /* @__PURE__ */ __commonJSMin(((exports) => {
			const Utils = require_utils$1();
			const ECCode = require_error_correction_code();
			const ECLevel = require_error_correction_level();
			const Mode = require_mode();
			const VersionCheck = require_version_check();
			const G18 = 7973;
			const G18_BCH = Utils.getBCHDigit(G18);
			function getBestVersionForDataLength(mode, length, errorCorrectionLevel) {
				for (let currentVersion = 1; currentVersion <= 40; currentVersion++) if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, mode)) return currentVersion;
			}
			function getReservedBitsCount(mode, version) {
				return Mode.getCharCountIndicator(mode, version) + 4;
			}
			function getTotalBitsFromDataArray(segments, version) {
				let totalBits = 0;
				segments.forEach(function(data) {
					const reservedBits = getReservedBitsCount(data.mode, version);
					totalBits += reservedBits + data.getBitsLength();
				});
				return totalBits;
			}
			function getBestVersionForMixedData(segments, errorCorrectionLevel) {
				for (let currentVersion = 1; currentVersion <= 40; currentVersion++) if (getTotalBitsFromDataArray(segments, currentVersion) <= exports.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED)) return currentVersion;
			}
			/**
			* Returns version number from a value.
			* If value is not a valid version, returns defaultValue
			*
			* @param  {Number|String} value        QR Code version
			* @param  {Number}        defaultValue Fallback value
			* @return {Number}                     QR Code version number
			*/
			exports.from = function from(value, defaultValue) {
				if (VersionCheck.isValid(value)) return parseInt(value, 10);
				return defaultValue;
			};
			/**
			* Returns how much data can be stored with the specified QR code version
			* and error correction level
			*
			* @param  {Number} version              QR Code version (1-40)
			* @param  {Number} errorCorrectionLevel Error correction level
			* @param  {Mode}   mode                 Data mode
			* @return {Number}                      Quantity of storable data
			*/
			exports.getCapacity = function getCapacity(version, errorCorrectionLevel, mode) {
				if (!VersionCheck.isValid(version)) throw new Error("Invalid QR Code version");
				if (typeof mode === "undefined") mode = Mode.BYTE;
				const dataTotalCodewordsBits = (Utils.getSymbolTotalCodewords(version) - ECCode.getTotalCodewordsCount(version, errorCorrectionLevel)) * 8;
				if (mode === Mode.MIXED) return dataTotalCodewordsBits;
				const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version);
				switch (mode) {
					case Mode.NUMERIC: return Math.floor(usableBits / 10 * 3);
					case Mode.ALPHANUMERIC: return Math.floor(usableBits / 11 * 2);
					case Mode.KANJI: return Math.floor(usableBits / 13);
					case Mode.BYTE:
					default: return Math.floor(usableBits / 8);
				}
			};
			/**
			* Returns the minimum version needed to contain the amount of data
			*
			* @param  {Segment} data                    Segment of data
			* @param  {Number} [errorCorrectionLevel=H] Error correction level
			* @param  {Mode} mode                       Data mode
			* @return {Number}                          QR Code version
			*/
			exports.getBestVersionForData = function getBestVersionForData(data, errorCorrectionLevel) {
				let seg;
				const ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);
				if (Array.isArray(data)) {
					if (data.length > 1) return getBestVersionForMixedData(data, ecl);
					if (data.length === 0) return 1;
					seg = data[0];
				} else seg = data;
				return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
			};
			/**
			* Returns version information with relative error correction bits
			*
			* The version information is included in QR Code symbols of version 7 or larger.
			* It consists of an 18-bit sequence containing 6 data bits,
			* with 12 error correction bits calculated using the (18, 6) Golay code.
			*
			* @param  {Number} version QR Code version
			* @return {Number}         Encoded version info bits
			*/
			exports.getEncodedBits = function getEncodedBits(version) {
				if (!VersionCheck.isValid(version) || version < 7) throw new Error("Invalid QR Code version");
				let d = version << 12;
				while (Utils.getBCHDigit(d) - G18_BCH >= 0) d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
				return version << 12 | d;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/format-info.js
		var require_format_info = /* @__PURE__ */ __commonJSMin(((exports) => {
			const Utils = require_utils$1();
			const G15 = 1335;
			const G15_MASK = 21522;
			const G15_BCH = Utils.getBCHDigit(G15);
			/**
			* Returns format information with relative error correction bits
			*
			* The format information is a 15-bit sequence containing 5 data bits,
			* with 10 error correction bits calculated using the (15, 5) BCH code.
			*
			* @param  {Number} errorCorrectionLevel Error correction level
			* @param  {Number} mask                 Mask pattern
			* @return {Number}                      Encoded format information bits
			*/
			exports.getEncodedBits = function getEncodedBits(errorCorrectionLevel, mask) {
				const data = errorCorrectionLevel.bit << 3 | mask;
				let d = data << 10;
				while (Utils.getBCHDigit(d) - G15_BCH >= 0) d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
				return (data << 10 | d) ^ G15_MASK;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/numeric-data.js
		var require_numeric_data = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Mode = require_mode();
			function NumericData(data) {
				this.mode = Mode.NUMERIC;
				this.data = data.toString();
			}
			NumericData.getBitsLength = function getBitsLength(length) {
				return 10 * Math.floor(length / 3) + (length % 3 ? length % 3 * 3 + 1 : 0);
			};
			NumericData.prototype.getLength = function getLength() {
				return this.data.length;
			};
			NumericData.prototype.getBitsLength = function getBitsLength() {
				return NumericData.getBitsLength(this.data.length);
			};
			NumericData.prototype.write = function write(bitBuffer) {
				let i, group, value;
				for (i = 0; i + 3 <= this.data.length; i += 3) {
					group = this.data.substr(i, 3);
					value = parseInt(group, 10);
					bitBuffer.put(value, 10);
				}
				const remainingNum = this.data.length - i;
				if (remainingNum > 0) {
					group = this.data.substr(i);
					value = parseInt(group, 10);
					bitBuffer.put(value, remainingNum * 3 + 1);
				}
			};
			module.exports = NumericData;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/alphanumeric-data.js
		var require_alphanumeric_data = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Mode = require_mode();
			/**
			* Array of characters available in alphanumeric mode
			*
			* As per QR Code specification, to each character
			* is assigned a value from 0 to 44 which in this case coincides
			* with the array index
			*
			* @type {Array}
			*/
			const ALPHA_NUM_CHARS = [
				"0",
				"1",
				"2",
				"3",
				"4",
				"5",
				"6",
				"7",
				"8",
				"9",
				"A",
				"B",
				"C",
				"D",
				"E",
				"F",
				"G",
				"H",
				"I",
				"J",
				"K",
				"L",
				"M",
				"N",
				"O",
				"P",
				"Q",
				"R",
				"S",
				"T",
				"U",
				"V",
				"W",
				"X",
				"Y",
				"Z",
				" ",
				"$",
				"%",
				"*",
				"+",
				"-",
				".",
				"/",
				":"
			];
			function AlphanumericData(data) {
				this.mode = Mode.ALPHANUMERIC;
				this.data = data;
			}
			AlphanumericData.getBitsLength = function getBitsLength(length) {
				return 11 * Math.floor(length / 2) + 6 * (length % 2);
			};
			AlphanumericData.prototype.getLength = function getLength() {
				return this.data.length;
			};
			AlphanumericData.prototype.getBitsLength = function getBitsLength() {
				return AlphanumericData.getBitsLength(this.data.length);
			};
			AlphanumericData.prototype.write = function write(bitBuffer) {
				let i;
				for (i = 0; i + 2 <= this.data.length; i += 2) {
					let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
					value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]);
					bitBuffer.put(value, 11);
				}
				if (this.data.length % 2) bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
			};
			module.exports = AlphanumericData;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/byte-data.js
		var require_byte_data = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Mode = require_mode();
			function ByteData(data) {
				this.mode = Mode.BYTE;
				if (typeof data === "string") this.data = new TextEncoder().encode(data);
				else this.data = new Uint8Array(data);
			}
			ByteData.getBitsLength = function getBitsLength(length) {
				return length * 8;
			};
			ByteData.prototype.getLength = function getLength() {
				return this.data.length;
			};
			ByteData.prototype.getBitsLength = function getBitsLength() {
				return ByteData.getBitsLength(this.data.length);
			};
			ByteData.prototype.write = function(bitBuffer) {
				for (let i = 0, l = this.data.length; i < l; i++) bitBuffer.put(this.data[i], 8);
			};
			module.exports = ByteData;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/kanji-data.js
		var require_kanji_data = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Mode = require_mode();
			const Utils = require_utils$1();
			function KanjiData(data) {
				this.mode = Mode.KANJI;
				this.data = data;
			}
			KanjiData.getBitsLength = function getBitsLength(length) {
				return length * 13;
			};
			KanjiData.prototype.getLength = function getLength() {
				return this.data.length;
			};
			KanjiData.prototype.getBitsLength = function getBitsLength() {
				return KanjiData.getBitsLength(this.data.length);
			};
			KanjiData.prototype.write = function(bitBuffer) {
				let i;
				for (i = 0; i < this.data.length; i++) {
					let value = Utils.toSJIS(this.data[i]);
					if (value >= 33088 && value <= 40956) value -= 33088;
					else if (value >= 57408 && value <= 60351) value -= 49472;
					else throw new Error("Invalid SJIS character: " + this.data[i] + "\nMake sure your charset is UTF-8");
					value = (value >>> 8 & 255) * 192 + (value & 255);
					bitBuffer.put(value, 13);
				}
			};
			module.exports = KanjiData;
		}));
		//#endregion
		//#region node_modules/.pnpm/dijkstrajs@1.0.3/node_modules/dijkstrajs/dijkstra.js
		var require_dijkstra = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			/******************************************************************************
			* Created 2008-08-19.
			*
			* Dijkstra path-finding functions. Adapted from the Dijkstar Python project.
			*
			* Copyright (C) 2008
			*   Wyatt Baldwin <self@wyattbaldwin.com>
			*   All rights reserved
			*
			* Licensed under the MIT license.
			*
			*   http://www.opensource.org/licenses/mit-license.php
			*
			* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
			* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
			* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
			* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
			* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
			* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
			* THE SOFTWARE.
			*****************************************************************************/
			var dijkstra = {
				single_source_shortest_paths: function(graph, s, d) {
					var predecessors = {};
					var costs = {};
					costs[s] = 0;
					var open = dijkstra.PriorityQueue.make();
					open.push(s, 0);
					var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit;
					while (!open.empty()) {
						closest = open.pop();
						u = closest.value;
						cost_of_s_to_u = closest.cost;
						adjacent_nodes = graph[u] || {};
						for (v in adjacent_nodes) if (adjacent_nodes.hasOwnProperty(v)) {
							cost_of_e = adjacent_nodes[v];
							cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;
							cost_of_s_to_v = costs[v];
							first_visit = typeof costs[v] === "undefined";
							if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
								costs[v] = cost_of_s_to_u_plus_cost_of_e;
								open.push(v, cost_of_s_to_u_plus_cost_of_e);
								predecessors[v] = u;
							}
						}
					}
					if (typeof d !== "undefined" && typeof costs[d] === "undefined") {
						var msg = [
							"Could not find a path from ",
							s,
							" to ",
							d,
							"."
						].join("");
						throw new Error(msg);
					}
					return predecessors;
				},
				extract_shortest_path_from_predecessor_list: function(predecessors, d) {
					var nodes = [];
					var u = d;
					while (u) {
						nodes.push(u);
						predecessors[u];
						u = predecessors[u];
					}
					nodes.reverse();
					return nodes;
				},
				find_path: function(graph, s, d) {
					var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
					return dijkstra.extract_shortest_path_from_predecessor_list(predecessors, d);
				},
				/**
				* A very naive priority queue implementation.
				*/
				PriorityQueue: {
					make: function(opts) {
						var T = dijkstra.PriorityQueue, t = {}, key;
						opts = opts || {};
						for (key in T) if (T.hasOwnProperty(key)) t[key] = T[key];
						t.queue = [];
						t.sorter = opts.sorter || T.default_sorter;
						return t;
					},
					default_sorter: function(a, b) {
						return a.cost - b.cost;
					},
					/**
					* Add a new item to the queue and ensure the highest priority element
					* is at the front of the queue.
					*/
					push: function(value, cost) {
						var item = {
							value,
							cost
						};
						this.queue.push(item);
						this.queue.sort(this.sorter);
					},
					/**
					* Return the highest priority element in the queue.
					*/
					pop: function() {
						return this.queue.shift();
					},
					empty: function() {
						return this.queue.length === 0;
					}
				}
			};
			if (typeof module !== "undefined") module.exports = dijkstra;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/segments.js
		var require_segments = /* @__PURE__ */ __commonJSMin(((exports) => {
			const Mode = require_mode();
			const NumericData = require_numeric_data();
			const AlphanumericData = require_alphanumeric_data();
			const ByteData = require_byte_data();
			const KanjiData = require_kanji_data();
			const Regex = require_regex();
			const Utils = require_utils$1();
			const dijkstra = require_dijkstra();
			/**
			* Returns UTF8 byte length
			*
			* @param  {String} str Input string
			* @return {Number}     Number of byte
			*/
			function getStringByteLength(str) {
				return unescape(encodeURIComponent(str)).length;
			}
			/**
			* Get a list of segments of the specified mode
			* from a string
			*
			* @param  {Mode}   mode Segment mode
			* @param  {String} str  String to process
			* @return {Array}       Array of object with segments data
			*/
			function getSegments(regex, mode, str) {
				const segments = [];
				let result;
				while ((result = regex.exec(str)) !== null) segments.push({
					data: result[0],
					index: result.index,
					mode,
					length: result[0].length
				});
				return segments;
			}
			/**
			* Extracts a series of segments with the appropriate
			* modes from a string
			*
			* @param  {String} dataStr Input string
			* @return {Array}          Array of object with segments data
			*/
			function getSegmentsFromString(dataStr) {
				const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
				const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
				let byteSegs;
				let kanjiSegs;
				if (Utils.isKanjiModeEnabled()) {
					byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
					kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
				} else {
					byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
					kanjiSegs = [];
				}
				return numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs).sort(function(s1, s2) {
					return s1.index - s2.index;
				}).map(function(obj) {
					return {
						data: obj.data,
						mode: obj.mode,
						length: obj.length
					};
				});
			}
			/**
			* Returns how many bits are needed to encode a string of
			* specified length with the specified mode
			*
			* @param  {Number} length String length
			* @param  {Mode} mode     Segment mode
			* @return {Number}        Bit length
			*/
			function getSegmentBitsLength(length, mode) {
				switch (mode) {
					case Mode.NUMERIC: return NumericData.getBitsLength(length);
					case Mode.ALPHANUMERIC: return AlphanumericData.getBitsLength(length);
					case Mode.KANJI: return KanjiData.getBitsLength(length);
					case Mode.BYTE: return ByteData.getBitsLength(length);
				}
			}
			/**
			* Merges adjacent segments which have the same mode
			*
			* @param  {Array} segs Array of object with segments data
			* @return {Array}      Array of object with segments data
			*/
			function mergeSegments(segs) {
				return segs.reduce(function(acc, curr) {
					const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
					if (prevSeg && prevSeg.mode === curr.mode) {
						acc[acc.length - 1].data += curr.data;
						return acc;
					}
					acc.push(curr);
					return acc;
				}, []);
			}
			/**
			* Generates a list of all possible nodes combination which
			* will be used to build a segments graph.
			*
			* Nodes are divided by groups. Each group will contain a list of all the modes
			* in which is possible to encode the given text.
			*
			* For example the text '12345' can be encoded as Numeric, Alphanumeric or Byte.
			* The group for '12345' will contain then 3 objects, one for each
			* possible encoding mode.
			*
			* Each node represents a possible segment.
			*
			* @param  {Array} segs Array of object with segments data
			* @return {Array}      Array of object with segments data
			*/
			function buildNodes(segs) {
				const nodes = [];
				for (let i = 0; i < segs.length; i++) {
					const seg = segs[i];
					switch (seg.mode) {
						case Mode.NUMERIC:
							nodes.push([
								seg,
								{
									data: seg.data,
									mode: Mode.ALPHANUMERIC,
									length: seg.length
								},
								{
									data: seg.data,
									mode: Mode.BYTE,
									length: seg.length
								}
							]);
							break;
						case Mode.ALPHANUMERIC:
							nodes.push([seg, {
								data: seg.data,
								mode: Mode.BYTE,
								length: seg.length
							}]);
							break;
						case Mode.KANJI:
							nodes.push([seg, {
								data: seg.data,
								mode: Mode.BYTE,
								length: getStringByteLength(seg.data)
							}]);
							break;
						case Mode.BYTE: nodes.push([{
							data: seg.data,
							mode: Mode.BYTE,
							length: getStringByteLength(seg.data)
						}]);
					}
				}
				return nodes;
			}
			/**
			* Builds a graph from a list of nodes.
			* All segments in each node group will be connected with all the segments of
			* the next group and so on.
			*
			* At each connection will be assigned a weight depending on the
			* segment's byte length.
			*
			* @param  {Array} nodes    Array of object with segments data
			* @param  {Number} version QR Code version
			* @return {Object}         Graph of all possible segments
			*/
			function buildGraph(nodes, version) {
				const table = {};
				const graph = { start: {} };
				let prevNodeIds = ["start"];
				for (let i = 0; i < nodes.length; i++) {
					const nodeGroup = nodes[i];
					const currentNodeIds = [];
					for (let j = 0; j < nodeGroup.length; j++) {
						const node = nodeGroup[j];
						const key = "" + i + j;
						currentNodeIds.push(key);
						table[key] = {
							node,
							lastCount: 0
						};
						graph[key] = {};
						for (let n = 0; n < prevNodeIds.length; n++) {
							const prevNodeId = prevNodeIds[n];
							if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
								graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);
								table[prevNodeId].lastCount += node.length;
							} else {
								if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;
								graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version);
							}
						}
					}
					prevNodeIds = currentNodeIds;
				}
				for (let n = 0; n < prevNodeIds.length; n++) graph[prevNodeIds[n]].end = 0;
				return {
					map: graph,
					table
				};
			}
			/**
			* Builds a segment from a specified data and mode.
			* If a mode is not specified, the more suitable will be used.
			*
			* @param  {String} data             Input data
			* @param  {Mode | String} modesHint Data mode
			* @return {Segment}                 Segment
			*/
			function buildSingleSegment(data, modesHint) {
				let mode;
				const bestMode = Mode.getBestModeForData(data);
				mode = Mode.from(modesHint, bestMode);
				if (mode !== Mode.BYTE && mode.bit < bestMode.bit) throw new Error("\"" + data + "\" cannot be encoded with mode " + Mode.toString(mode) + ".\n Suggested mode is: " + Mode.toString(bestMode));
				if (mode === Mode.KANJI && !Utils.isKanjiModeEnabled()) mode = Mode.BYTE;
				switch (mode) {
					case Mode.NUMERIC: return new NumericData(data);
					case Mode.ALPHANUMERIC: return new AlphanumericData(data);
					case Mode.KANJI: return new KanjiData(data);
					case Mode.BYTE: return new ByteData(data);
				}
			}
			/**
			* Builds a list of segments from an array.
			* Array can contain Strings or Objects with segment's info.
			*
			* For each item which is a string, will be generated a segment with the given
			* string and the more appropriate encoding mode.
			*
			* For each item which is an object, will be generated a segment with the given
			* data and mode.
			* Objects must contain at least the property "data".
			* If property "mode" is not present, the more suitable mode will be used.
			*
			* @param  {Array} array Array of objects with segments data
			* @return {Array}       Array of Segments
			*/
			exports.fromArray = function fromArray(array) {
				return array.reduce(function(acc, seg) {
					if (typeof seg === "string") acc.push(buildSingleSegment(seg, null));
					else if (seg.data) acc.push(buildSingleSegment(seg.data, seg.mode));
					return acc;
				}, []);
			};
			/**
			* Builds an optimized sequence of segments from a string,
			* which will produce the shortest possible bitstream.
			*
			* @param  {String} data    Input string
			* @param  {Number} version QR Code version
			* @return {Array}          Array of segments
			*/
			exports.fromString = function fromString(data, version) {
				const graph = buildGraph(buildNodes(getSegmentsFromString(data, Utils.isKanjiModeEnabled())), version);
				const path = dijkstra.find_path(graph.map, "start", "end");
				const optimizedSegs = [];
				for (let i = 1; i < path.length - 1; i++) optimizedSegs.push(graph.table[path[i]].node);
				return exports.fromArray(mergeSegments(optimizedSegs));
			};
			/**
			* Splits a string in various segments with the modes which
			* best represent their content.
			* The produced segments are far from being optimized.
			* The output of this function is only used to estimate a QR Code version
			* which may contain the data.
			*
			* @param  {string} data Input string
			* @return {Array}       Array of segments
			*/
			exports.rawSplit = function rawSplit(data) {
				return exports.fromArray(getSegmentsFromString(data, Utils.isKanjiModeEnabled()));
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/qrcode.js
		var require_qrcode = /* @__PURE__ */ __commonJSMin(((exports) => {
			const Utils = require_utils$1();
			const ECLevel = require_error_correction_level();
			const BitBuffer = require_bit_buffer();
			const BitMatrix = require_bit_matrix();
			const AlignmentPattern = require_alignment_pattern();
			const FinderPattern = require_finder_pattern();
			const MaskPattern = require_mask_pattern();
			const ECCode = require_error_correction_code();
			const ReedSolomonEncoder = require_reed_solomon_encoder();
			const Version = require_version();
			const FormatInfo = require_format_info();
			const Mode = require_mode();
			const Segments = require_segments();
			/**
			* QRCode for JavaScript
			*
			* modified by Ryan Day for nodejs support
			* Copyright (c) 2011 Ryan Day
			*
			* Licensed under the MIT license:
			*   http://www.opensource.org/licenses/mit-license.php
			*
			//---------------------------------------------------------------------
			// QRCode for JavaScript
			//
			// Copyright (c) 2009 Kazuhiko Arase
			//
			// URL: http://www.d-project.com/
			//
			// Licensed under the MIT license:
			//   http://www.opensource.org/licenses/mit-license.php
			//
			// The word "QR Code" is registered trademark of
			// DENSO WAVE INCORPORATED
			//   http://www.denso-wave.com/qrcode/faqpatent-e.html
			//
			//---------------------------------------------------------------------
			*/
			/**
			* Add finder patterns bits to matrix
			*
			* @param  {BitMatrix} matrix  Modules matrix
			* @param  {Number}    version QR Code version
			*/
			function setupFinderPattern(matrix, version) {
				const size = matrix.size;
				const pos = FinderPattern.getPositions(version);
				for (let i = 0; i < pos.length; i++) {
					const row = pos[i][0];
					const col = pos[i][1];
					for (let r = -1; r <= 7; r++) {
						if (row + r <= -1 || size <= row + r) continue;
						for (let c = -1; c <= 7; c++) {
							if (col + c <= -1 || size <= col + c) continue;
							if (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4) matrix.set(row + r, col + c, true, true);
							else matrix.set(row + r, col + c, false, true);
						}
					}
				}
			}
			/**
			* Add timing pattern bits to matrix
			*
			* Note: this function must be called before {@link setupAlignmentPattern}
			*
			* @param  {BitMatrix} matrix Modules matrix
			*/
			function setupTimingPattern(matrix) {
				const size = matrix.size;
				for (let r = 8; r < size - 8; r++) {
					const value = r % 2 === 0;
					matrix.set(r, 6, value, true);
					matrix.set(6, r, value, true);
				}
			}
			/**
			* Add alignment patterns bits to matrix
			*
			* Note: this function must be called after {@link setupTimingPattern}
			*
			* @param  {BitMatrix} matrix  Modules matrix
			* @param  {Number}    version QR Code version
			*/
			function setupAlignmentPattern(matrix, version) {
				const pos = AlignmentPattern.getPositions(version);
				for (let i = 0; i < pos.length; i++) {
					const row = pos[i][0];
					const col = pos[i][1];
					for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) if (r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0) matrix.set(row + r, col + c, true, true);
					else matrix.set(row + r, col + c, false, true);
				}
			}
			/**
			* Add version info bits to matrix
			*
			* @param  {BitMatrix} matrix  Modules matrix
			* @param  {Number}    version QR Code version
			*/
			function setupVersionInfo(matrix, version) {
				const size = matrix.size;
				const bits = Version.getEncodedBits(version);
				let row, col, mod;
				for (let i = 0; i < 18; i++) {
					row = Math.floor(i / 3);
					col = i % 3 + size - 8 - 3;
					mod = (bits >> i & 1) === 1;
					matrix.set(row, col, mod, true);
					matrix.set(col, row, mod, true);
				}
			}
			/**
			* Add format info bits to matrix
			*
			* @param  {BitMatrix} matrix               Modules matrix
			* @param  {ErrorCorrectionLevel}    errorCorrectionLevel Error correction level
			* @param  {Number}    maskPattern          Mask pattern reference value
			*/
			function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
				const size = matrix.size;
				const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern);
				let i, mod;
				for (i = 0; i < 15; i++) {
					mod = (bits >> i & 1) === 1;
					if (i < 6) matrix.set(i, 8, mod, true);
					else if (i < 8) matrix.set(i + 1, 8, mod, true);
					else matrix.set(size - 15 + i, 8, mod, true);
					if (i < 8) matrix.set(8, size - i - 1, mod, true);
					else if (i < 9) matrix.set(8, 15 - i - 1 + 1, mod, true);
					else matrix.set(8, 15 - i - 1, mod, true);
				}
				matrix.set(size - 8, 8, 1, true);
			}
			/**
			* Add encoded data bits to matrix
			*
			* @param  {BitMatrix}  matrix Modules matrix
			* @param  {Uint8Array} data   Data codewords
			*/
			function setupData(matrix, data) {
				const size = matrix.size;
				let inc = -1;
				let row = size - 1;
				let bitIndex = 7;
				let byteIndex = 0;
				for (let col = size - 1; col > 0; col -= 2) {
					if (col === 6) col--;
					while (true) {
						for (let c = 0; c < 2; c++) if (!matrix.isReserved(row, col - c)) {
							let dark = false;
							if (byteIndex < data.length) dark = (data[byteIndex] >>> bitIndex & 1) === 1;
							matrix.set(row, col - c, dark);
							bitIndex--;
							if (bitIndex === -1) {
								byteIndex++;
								bitIndex = 7;
							}
						}
						row += inc;
						if (row < 0 || size <= row) {
							row -= inc;
							inc = -inc;
							break;
						}
					}
				}
			}
			/**
			* Create encoded codewords from data input
			*
			* @param  {Number}   version              QR Code version
			* @param  {ErrorCorrectionLevel}   errorCorrectionLevel Error correction level
			* @param  {ByteData} data                 Data input
			* @return {Uint8Array}                    Buffer containing encoded codewords
			*/
			function createData(version, errorCorrectionLevel, segments) {
				const buffer = new BitBuffer();
				segments.forEach(function(data) {
					buffer.put(data.mode.bit, 4);
					buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version));
					data.write(buffer);
				});
				const dataTotalCodewordsBits = (Utils.getSymbolTotalCodewords(version) - ECCode.getTotalCodewordsCount(version, errorCorrectionLevel)) * 8;
				if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) buffer.put(0, 4);
				while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(0);
				const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
				for (let i = 0; i < remainingByte; i++) buffer.put(i % 2 ? 17 : 236, 8);
				return createCodewords(buffer, version, errorCorrectionLevel);
			}
			/**
			* Encode input data with Reed-Solomon and return codewords with
			* relative error correction bits
			*
			* @param  {BitBuffer} bitBuffer            Data to encode
			* @param  {Number}    version              QR Code version
			* @param  {ErrorCorrectionLevel} errorCorrectionLevel Error correction level
			* @return {Uint8Array}                     Buffer containing encoded codewords
			*/
			function createCodewords(bitBuffer, version, errorCorrectionLevel) {
				const totalCodewords = Utils.getSymbolTotalCodewords(version);
				const dataTotalCodewords = totalCodewords - ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
				const ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel);
				const blocksInGroup1 = ecTotalBlocks - totalCodewords % ecTotalBlocks;
				const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
				const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
				const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
				const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;
				const rs = new ReedSolomonEncoder(ecCount);
				let offset = 0;
				const dcData = new Array(ecTotalBlocks);
				const ecData = new Array(ecTotalBlocks);
				let maxDataSize = 0;
				const buffer = new Uint8Array(bitBuffer.buffer);
				for (let b = 0; b < ecTotalBlocks; b++) {
					const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
					dcData[b] = buffer.slice(offset, offset + dataSize);
					ecData[b] = rs.encode(dcData[b]);
					offset += dataSize;
					maxDataSize = Math.max(maxDataSize, dataSize);
				}
				const data = new Uint8Array(totalCodewords);
				let index = 0;
				let i, r;
				for (i = 0; i < maxDataSize; i++) for (r = 0; r < ecTotalBlocks; r++) if (i < dcData[r].length) data[index++] = dcData[r][i];
				for (i = 0; i < ecCount; i++) for (r = 0; r < ecTotalBlocks; r++) data[index++] = ecData[r][i];
				return data;
			}
			/**
			* Build QR Code symbol
			*
			* @param  {String} data                 Input string
			* @param  {Number} version              QR Code version
			* @param  {ErrorCorretionLevel} errorCorrectionLevel Error level
			* @param  {MaskPattern} maskPattern     Mask pattern
			* @return {Object}                      Object containing symbol data
			*/
			function createSymbol(data, version, errorCorrectionLevel, maskPattern) {
				let segments;
				if (Array.isArray(data)) segments = Segments.fromArray(data);
				else if (typeof data === "string") {
					let estimatedVersion = version;
					if (!estimatedVersion) {
						const rawSegments = Segments.rawSplit(data);
						estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
					}
					segments = Segments.fromString(data, estimatedVersion || 40);
				} else throw new Error("Invalid data");
				const bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel);
				if (!bestVersion) throw new Error("The amount of data is too big to be stored in a QR Code");
				if (!version) version = bestVersion;
				else if (version < bestVersion) throw new Error("\nThe chosen QR Code version cannot contain this amount of data.\nMinimum version required to store current data is: " + bestVersion + ".\n");
				const dataBits = createData(version, errorCorrectionLevel, segments);
				const moduleCount = Utils.getSymbolSize(version);
				const modules = new BitMatrix(moduleCount);
				setupFinderPattern(modules, version);
				setupTimingPattern(modules);
				setupAlignmentPattern(modules, version);
				setupFormatInfo(modules, errorCorrectionLevel, 0);
				if (version >= 7) setupVersionInfo(modules, version);
				setupData(modules, dataBits);
				if (isNaN(maskPattern)) maskPattern = MaskPattern.getBestMask(modules, setupFormatInfo.bind(null, modules, errorCorrectionLevel));
				MaskPattern.applyMask(maskPattern, modules);
				setupFormatInfo(modules, errorCorrectionLevel, maskPattern);
				return {
					modules,
					version,
					errorCorrectionLevel,
					maskPattern,
					segments
				};
			}
			/**
			* QR Code
			*
			* @param {String | Array} data                 Input data
			* @param {Object} options                      Optional configurations
			* @param {Number} options.version              QR Code version
			* @param {String} options.errorCorrectionLevel Error correction level
			* @param {Function} options.toSJISFunc         Helper func to convert utf8 to sjis
			*/
			exports.create = function create(data, options) {
				if (typeof data === "undefined" || data === "") throw new Error("No input text");
				let errorCorrectionLevel = ECLevel.M;
				let version;
				let mask;
				if (typeof options !== "undefined") {
					errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
					version = Version.from(options.version);
					mask = MaskPattern.from(options.maskPattern);
					if (options.toSJISFunc) Utils.setToSJISFunction(options.toSJISFunc);
				}
				return createSymbol(data, version, errorCorrectionLevel, mask);
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/renderer/utils.js
		var require_utils = /* @__PURE__ */ __commonJSMin(((exports) => {
			function hex2rgba(hex) {
				if (typeof hex === "number") hex = hex.toString();
				if (typeof hex !== "string") throw new Error("Color should be defined as hex string");
				let hexCode = hex.slice().replace("#", "").split("");
				if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) throw new Error("Invalid hex color: " + hex);
				if (hexCode.length === 3 || hexCode.length === 4) hexCode = Array.prototype.concat.apply([], hexCode.map(function(c) {
					return [c, c];
				}));
				if (hexCode.length === 6) hexCode.push("F", "F");
				const hexValue = parseInt(hexCode.join(""), 16);
				return {
					r: hexValue >> 24 & 255,
					g: hexValue >> 16 & 255,
					b: hexValue >> 8 & 255,
					a: hexValue & 255,
					hex: "#" + hexCode.slice(0, 6).join("")
				};
			}
			exports.getOptions = function getOptions(options) {
				if (!options) options = {};
				if (!options.color) options.color = {};
				const margin = typeof options.margin === "undefined" || options.margin === null || options.margin < 0 ? 4 : options.margin;
				const width = options.width && options.width >= 21 ? options.width : void 0;
				const scale = options.scale || 4;
				return {
					width,
					scale: width ? 4 : scale,
					margin,
					color: {
						dark: hex2rgba(options.color.dark || "#000000ff"),
						light: hex2rgba(options.color.light || "#ffffffff")
					},
					type: options.type,
					rendererOpts: options.rendererOpts || {}
				};
			};
			exports.getScale = function getScale(qrSize, opts) {
				return opts.width && opts.width >= qrSize + opts.margin * 2 ? opts.width / (qrSize + opts.margin * 2) : opts.scale;
			};
			exports.getImageWidth = function getImageWidth(qrSize, opts) {
				const scale = exports.getScale(qrSize, opts);
				return Math.floor((qrSize + opts.margin * 2) * scale);
			};
			exports.qrToImageData = function qrToImageData(imgData, qr, opts) {
				const size = qr.modules.size;
				const data = qr.modules.data;
				const scale = exports.getScale(size, opts);
				const symbolSize = Math.floor((size + opts.margin * 2) * scale);
				const scaledMargin = opts.margin * scale;
				const palette = [opts.color.light, opts.color.dark];
				for (let i = 0; i < symbolSize; i++) for (let j = 0; j < symbolSize; j++) {
					let posDst = (i * symbolSize + j) * 4;
					let pxColor = opts.color.light;
					if (i >= scaledMargin && j >= scaledMargin && i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
						const iSrc = Math.floor((i - scaledMargin) / scale);
						const jSrc = Math.floor((j - scaledMargin) / scale);
						pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
					}
					imgData[posDst++] = pxColor.r;
					imgData[posDst++] = pxColor.g;
					imgData[posDst++] = pxColor.b;
					imgData[posDst] = pxColor.a;
				}
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/renderer/canvas.js
		var require_canvas = /* @__PURE__ */ __commonJSMin(((exports) => {
			const Utils = require_utils();
			function clearCanvas(ctx, canvas, size) {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				if (!canvas.style) canvas.style = {};
				canvas.height = size;
				canvas.width = size;
				canvas.style.height = size + "px";
				canvas.style.width = size + "px";
			}
			function getCanvasElement() {
				try {
					return document.createElement("canvas");
				} catch (e) {
					throw new Error("You need to specify a canvas element");
				}
			}
			exports.render = function render(qrData, canvas, options) {
				let opts = options;
				let canvasEl = canvas;
				if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
					opts = canvas;
					canvas = void 0;
				}
				if (!canvas) canvasEl = getCanvasElement();
				opts = Utils.getOptions(opts);
				const size = Utils.getImageWidth(qrData.modules.size, opts);
				const ctx = canvasEl.getContext("2d");
				const image = ctx.createImageData(size, size);
				Utils.qrToImageData(image.data, qrData, opts);
				clearCanvas(ctx, canvasEl, size);
				ctx.putImageData(image, 0, 0);
				return canvasEl;
			};
			exports.renderToDataURL = function renderToDataURL(qrData, canvas, options) {
				let opts = options;
				if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
					opts = canvas;
					canvas = void 0;
				}
				if (!opts) opts = {};
				const canvasEl = exports.render(qrData, canvas, opts);
				const type = opts.type || "image/png";
				const rendererOpts = opts.rendererOpts || {};
				return canvasEl.toDataURL(type, rendererOpts.quality);
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/renderer/svg-tag.js
		var require_svg_tag = /* @__PURE__ */ __commonJSMin(((exports) => {
			const Utils = require_utils();
			function getColorAttrib(color, attrib) {
				const alpha = color.a / 255;
				const str = attrib + "=\"" + color.hex + "\"";
				return alpha < 1 ? str + " " + attrib + "-opacity=\"" + alpha.toFixed(2).slice(1) + "\"" : str;
			}
			function svgCmd(cmd, x, y) {
				let str = cmd + x;
				if (typeof y !== "undefined") str += " " + y;
				return str;
			}
			function qrToPath(data, size, margin) {
				let path = "";
				let moveBy = 0;
				let newRow = false;
				let lineLength = 0;
				for (let i = 0; i < data.length; i++) {
					const col = Math.floor(i % size);
					const row = Math.floor(i / size);
					if (!col && !newRow) newRow = true;
					if (data[i]) {
						lineLength++;
						if (!(i > 0 && col > 0 && data[i - 1])) {
							path += newRow ? svgCmd("M", col + margin, .5 + row + margin) : svgCmd("m", moveBy, 0);
							moveBy = 0;
							newRow = false;
						}
						if (!(col + 1 < size && data[i + 1])) {
							path += svgCmd("h", lineLength);
							lineLength = 0;
						}
					} else moveBy++;
				}
				return path;
			}
			exports.render = function render(qrData, options, cb) {
				const opts = Utils.getOptions(options);
				const size = qrData.modules.size;
				const data = qrData.modules.data;
				const qrcodesize = size + opts.margin * 2;
				const bg = !opts.color.light.a ? "" : "<path " + getColorAttrib(opts.color.light, "fill") + " d=\"M0 0h" + qrcodesize + "v" + qrcodesize + "H0z\"/>";
				const path = "<path " + getColorAttrib(opts.color.dark, "stroke") + " d=\"" + qrToPath(data, size, opts.margin) + "\"/>";
				const viewBox = "viewBox=\"0 0 " + qrcodesize + " " + qrcodesize + "\"";
				const svgTag = "<svg xmlns=\"http://www.w3.org/2000/svg\" " + (!opts.width ? "" : "width=\"" + opts.width + "\" height=\"" + opts.width + "\" ") + viewBox + " shape-rendering=\"crispEdges\">" + bg + path + "</svg>\n";
				if (typeof cb === "function") cb(null, svgTag);
				return svgTag;
			};
		}));
		//#endregion
		//#region src/ua.ts
		var import_browser = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports) => {
			const canPromise = require_can_promise();
			const QRCode = require_qrcode();
			const CanvasRenderer = require_canvas();
			const SvgRenderer = require_svg_tag();
			function renderCanvas(renderFunc, canvas, text, opts, cb) {
				const args = [].slice.call(arguments, 1);
				const argsNum = args.length;
				const isLastArgCb = typeof args[argsNum - 1] === "function";
				if (!isLastArgCb && !canPromise()) throw new Error("Callback required as last argument");
				if (isLastArgCb) {
					if (argsNum < 2) throw new Error("Too few arguments provided");
					if (argsNum === 2) {
						cb = text;
						text = canvas;
						canvas = opts = void 0;
					} else if (argsNum === 3) {
						if (canvas.getContext && typeof cb === "undefined") {
							cb = opts;
							opts = void 0;
						} else {
							cb = opts;
							opts = text;
							text = canvas;
							canvas = void 0;
						}
					}
				} else {
					if (argsNum < 1) throw new Error("Too few arguments provided");
					if (argsNum === 1) {
						text = canvas;
						canvas = opts = void 0;
					} else if (argsNum === 2 && !canvas.getContext) {
						opts = text;
						text = canvas;
						canvas = void 0;
					}
					return new Promise(function(resolve, reject) {
						try {
							resolve(renderFunc(QRCode.create(text, opts), canvas, opts));
						} catch (e) {
							reject(e);
						}
					});
				}
				try {
					const data = QRCode.create(text, opts);
					cb(null, renderFunc(data, canvas, opts));
				} catch (e) {
					cb(e);
				}
			}
			exports.create = QRCode.create;
			exports.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
			exports.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
			exports.toString = renderCanvas.bind(null, function(data, _, opts) {
				return SvgRenderer.render(data, opts);
			});
		})))(), 1);
		function has(ua, needle) {
			return ua.toLowerCase().includes(needle.toLowerCase());
		}
		/** Derive a short human label from a browser User-Agent string. */
		function describeUserAgent(ua) {
			if (ua.length === 0) return { label: "未知设备" };
			let browser = "浏览器";
			if (has(ua, "edg/") || has(ua, "edgios")) browser = "Edge";
			else if (has(ua, "chrome/") && has(ua, "crios")) browser = "Chrome";
			else if (has(ua, "chrome/") && has(ua, "android")) browser = "Chrome";
			else if (has(ua, "chrome/")) browser = "Chrome";
			else if (has(ua, "safari/") && !has(ua, "chrome")) browser = "Safari";
			else if (has(ua, "firefox/")) browser = "Firefox";
			else if (has(ua, "opr/")) browser = "Opera";
			else if (has(ua, "wechat")) browser = "微信浏览器";
			let os;
			let device = "";
			if (has(ua, "iphone")) device = "iPhone";
			else if (has(ua, "ipad")) device = "iPad";
			else if (has(ua, "ipod")) device = "iPod";
			else if (has(ua, "android")) device = "Android";
			else if (has(ua, "windows")) device = "Windows";
			else if (has(ua, "mac os x") || has(ua, "macintosh")) device = "macOS";
			else if (has(ua, "linux")) device = "Linux";
			const iosMatch = /os (\d+[._]\d+)/i.exec(ua);
			const androidMatch = /android (\d+[.\d]*)/i.exec(ua);
			if (iosMatch !== null) os = `iOS ${iosMatch[1].replace("_", ".")}`;
			else if (androidMatch !== null) os = `Android ${androidMatch[1]}`;
			return {
				label: `${device !== "" ? `${device} / ` : ""}${browser}`,
				...os === void 0 ? {} : { os }
			};
		}
		//#endregion
		//#region src/client/RemoteErrorBanner.tsx
		/** Friendly copy for an error code (never empty: unknown/undefined → internal). */
		function friendly(errorCode) {
			if (errorCode === void 0) return REMOTE_ERROR_MESSAGES["internal"].zh;
			return REMOTE_ERROR_MESSAGES[errorCode]?.zh ?? REMOTE_ERROR_MESSAGES["internal"].zh;
		}
		const errorBannerStyle = {
			fontSize: 12,
			lineHeight: 1.5,
			margin: 0,
			color: "var(--dsw-alias-state-error-primary, #dc2626)",
			background: "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))",
			borderLeft: "3px solid var(--dsw-alias-state-error-primary, #dc2626)",
			borderRadius: 8,
			padding: "8px 12px"
		};
		/** Renders the human-readable copy for a stable error code. Never blank. */
		function RemoteErrorBanner({ code }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: errorBannerStyle,
				children: friendly(code)
			});
		}
		//#endregion
		//#region src/client/UpdateCard.tsx
		/**
		* 插件更新 card (R05).
		*
		* - automatic checks are throttled HOST-side (24h default); the card only
		*   calls `updateCheck(false)` on mount and `updateCheck(true)` on the
		*   manual button — it never polls the internet itself;
		* - an available update is shown with plain-text release notes and the
		*   [稍后] [立即更新] choice; background silent install is never performed;
		* - 立即更新 runs the official `dsh plugin --profile <profile> update`
		*   through the host; the host verifies the installed version and only then
		*   reports 更新已安装，需要重启 DSH 后生效. A failure keeps the current
		*   version running;
		* - notes are rendered with React text interpolation (pre-wrap) — never
		*   dangerouslySetInnerHTML, so remote release text cannot XSS.
		*/
		const s$1 = {
			card: {
				background: "var(--dsw-alias-bg-layer-1, #ffffff)",
				border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))",
				borderRadius: 12,
				padding: "16px 20px",
				display: "flex",
				flexDirection: "column",
				gap: 10
			},
			row: {
				display: "flex",
				alignItems: "center",
				gap: 10,
				flexWrap: "wrap"
			},
			actionsRight: {
				display: "flex",
				alignItems: "center",
				justifyContent: "flex-end",
				gap: 10
			},
			title: {
				fontSize: 13,
				fontWeight: 600,
				margin: 0,
				color: "var(--dsw-alias-label-primary, inherit)"
			},
			hint: {
				fontSize: 12,
				lineHeight: 1.5,
				margin: 0,
				color: "var(--dsw-alias-label-secondary, #6b7280)"
			},
			notes: {
				fontSize: 12,
				lineHeight: 1.6,
				margin: 0,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
				color: "var(--dsw-alias-label-secondary, #6b7280)",
				background: "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))",
				borderRadius: 8,
				padding: "8px 12px",
				maxHeight: 160,
				overflowY: "auto"
			},
			error: {
				fontSize: 12,
				lineHeight: 1.5,
				margin: 0,
				color: "var(--dsw-alias-state-error-primary, #dc2626)",
				background: "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))",
				borderLeft: "3px solid var(--dsw-alias-state-error-primary, #dc2626)",
				borderRadius: 8,
				padding: "8px 12px"
			},
			success: {
				fontSize: 12,
				lineHeight: 1.5,
				margin: 0,
				color: "var(--dsw-alias-state-success-primary, #16a34a)",
				background: "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))",
				borderLeft: "3px solid var(--dsw-alias-state-success-primary, #16a34a)",
				borderRadius: 8,
				padding: "8px 12px"
			}
		};
		function formatTime(timestamp) {
			const date = new Date(timestamp);
			const pad = (value) => String(value).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}
		function UpdateCard({ api, t, status }) {
			const [update, setUpdate] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [postponed, setPostponed] = (0, react.useState)(false);
			const check = (0, react.useCallback)(async (force) => {
				setBusy(true);
				setPostponed(false);
				try {
					setUpdate(await api.updateCheck(force));
				} catch {
					setUpdate(null);
				}
				setBusy(false);
			}, [api]);
			(0, react.useEffect)(() => {
				check(false);
			}, [check]);
			const apply = (0, react.useCallback)(async () => {
				setBusy(true);
				try {
					setUpdate(await api.updateApply());
				} catch {
					setUpdate(null);
				}
				setBusy(false);
			}, [api]);
			const currentVersion = status.pluginVersion ?? update?.currentVersion ?? "";
			const phase = update?.phase ?? "idle";
			const latest = update?.latestVersion;
			let body;
			if (phase === "checking" || phase === "idle") body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: s$1.hint,
				children: t("checkingUpdate")
			});
			else if (phase === "unavailable") body = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: s$1.hint,
				children: busy ? t("checkingUpdate") : t("updateUnavailable")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: s$1.actionsRight,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					size: "md",
					onClick: () => {
						check(true);
					},
					disabled: busy,
					children: t("checkUpdate")
				})
			})] });
			else if (phase === "up-to-date") body = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 10
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: s$1.hint,
					children: busy ? t("checkingUpdate") : `${t("upToDate")} · v${currentVersion}`
				}), !busy && update?.lastCheckedAt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					style: s$1.hint,
					children: [
						t("lastCheckAt"),
						" ",
						formatTime(update.lastCheckedAt)
					]
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: s$1.actionsRight,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					size: "md",
					onClick: () => {
						check(true);
					},
					disabled: busy,
					children: t("checkUpdate")
				})
			})] });
			else if (phase === "available") body = postponed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					style: s$1.hint,
					children: [
						t("updatePostponed"),
						" v",
						latest
					]
				}),
				update?.notes !== void 0 && update.notes !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: s$1.notes,
					children: update.notes
				}) : update?.notesUnavailable === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: s$1.hint,
					children: t("updateNotesUnavailable")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: s$1.actionsRight,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						size: "md",
						onClick: () => {
							check(true);
						},
						disabled: busy,
						children: t("checkUpdate")
					})
				})
			] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					style: s$1.hint,
					children: [
						t("updateAvailable"),
						" v",
						latest
					]
				}),
				update?.notes !== void 0 && update.notes !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: s$1.notes,
					children: update.notes
				}) : update?.notesUnavailable === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: s$1.hint,
					children: t("updateNotesUnavailable")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: s$1.actionsRight,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						size: "md",
						onClick: () => {
							setPostponed(true);
						},
						disabled: busy,
						children: t("later")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						size: "md",
						onClick: () => {
							apply();
						},
						disabled: busy,
						children: t("updateNow")
					})]
				})
			] });
			else if (phase === "applying") body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: s$1.hint,
				children: t("updating")
			});
			else if (phase === "installed-restart-required") body = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				style: s$1.success,
				children: [
					t("updateInstalled"),
					" (v",
					latest,
					")"
				]
			});
			else body = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: s$1.hint,
				children: t("checkingUpdate")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: s$1.error,
				children: t("updateFailed")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: s$1.actionsRight,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					size: "md",
					onClick: () => {
						check(true);
					},
					disabled: busy,
					children: t("checkUpdate")
				})
			})] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: s$1.card,
				"data-dsh-remote-update": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: s$1.row,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: s$1.title,
						children: t("updateTitle")
					}), currentVersion !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: s$1.hint,
						children: [
							t("currentVersion"),
							" v",
							currentVersion
						]
					})]
				}), body]
			});
		}
		//#endregion
		//#region src/client/RemoteAccessSection.tsx
		/**
		* 远程控制 settings section.
		*
		* The section is a state machine over the loopback management RPC:
		*   - polls `dsh-remote.status` + `dsh-remote.pairingStatus` every 3s
		*     (both READ-ONLY — silent on transient failure)
		*   - the HOST is the pairing-ticket state authority (R06C4B): the tunnel's
		*     first-enable flow mints exactly one initial ticket, and the ONLY other
		*     creation path is the user's explicit "生成新的配对码" button; a settings
		*     remount / tab switch / browser reload / status poll can never create a
		*     ticket (the old auto-rotate-on-mount effect was the R06C4B root cause)
		*   - renders one of four host-authoritative states:
		*       active    → QR (`https://<origin>/pair#<secret>`) + manual 8-char
		*                   code + server-authoritative countdown (expiresAt − now)
		*       consumed  → "设备已成功配对" + [生成新的配对码] (no QR/code/countdown)
		*       expired   → "配对码已过期" + [生成新的配对码] (no stale credentials)
		*       none      → neutral hint + [生成新的配对码] (defensive; first enable
		*                   normally auto-creates)
		*   - every user action maps failures to friendly copy via REMOTE_ERROR_MESSAGES
		*   - technical detail (the stable error code / binary source) is available
		*     only behind a collapsed <details> — never the raw exception text
		*
		* Look & feel: official DSH design tokens (--dsw-alias-*) and the official
		* Button primitive (md 36px capsule), the same pattern the shipped settings
		* sections use.
		*
		* The pairing secret never leaves this page: it arrives over the loopback
		* RPC, lives only in React state, is never written to localStorage or any
		* log, and only appears inside the QR fragment (never the query string).
		* Consumed/expired views receive NO secret from the host at all.
		*/
		const POLL_MS = 3e3;
		const TICK_MS = 1e3;
		function formatRemaining(ms) {
			const total = Math.max(0, Math.ceil(ms / 1e3));
			const minutes = Math.floor(total / 60);
			const seconds = total % 60;
			return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
		}
		function formatLastSeen(timestamp) {
			const date = new Date(timestamp);
			const pad = (value) => String(value).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}
		function formatElapsed(startedAt, now) {
			if (startedAt === void 0) return "";
			const seconds = Math.max(0, Math.floor((now - startedAt) / 1e3));
			const minutes = Math.floor(seconds / 60);
			return minutes > 0 ? `${String(minutes)}分${String(seconds % 60).padStart(2, "0")}秒` : `${String(seconds)}秒`;
		}
		function formatBytes(bytes) {
			const mb = bytes / 1048576;
			return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
		}
		function formatSpeed(bytesPerSecond) {
			if (bytesPerSecond === void 0 || bytesPerSecond <= 0) return "";
			const mbps = bytesPerSecond / 1048576;
			return mbps >= 1 ? `${mbps.toFixed(1)} MB/s` : `${Math.max(.1, Math.round(mbps * 10) / 10)} MB/s`;
		}
		/**
		* Human status line while the tunnel is starting (phase-specific copy; the
		* "正在准备安全连接" umbrella is only a fallback). Download progress shows real
		* received bytes — never a fabricated percentage when the total is unknown —
		* plus the CURRENT network route (proxy label) and SOURCE (官方源 / 备用镜像)
		* so a mirror is never silently presented as the official source.
		*/
		function startingStatusLine(status, t, now) {
			const elapsed = status.startedAt !== void 0 ? ` · ${t("waiting")} ${formatElapsed(status.startedAt, now)}` : "";
			if (status.phase === "downloading") {
				if (status.downloadSourceChanging === true) return `${t("sourceSwitching")}${elapsed}`;
				const speed = formatSpeed(status.downloadSpeedBytesPerSecond);
				const base = status.downloadReceivedBytes !== void 0 ? `${t("downloading")}：${t("downloadedSoFar")} ${formatBytes(status.downloadReceivedBytes)}` : t("downloading");
				const total = status.downloadPercent !== void 0 && status.downloadTotalBytes !== void 0 ? ` ${t("of")} ${formatBytes(status.downloadTotalBytes)} · ${String(status.downloadPercent)}%` : "";
				const route = [status.downloadProxySource !== void 0 ? proxyRouteLabel(status.downloadProxySource, t) : "", status.downloadSource === "official" ? t("sourceOfficialLabel") : status.downloadSource === "mirror" ? t("sourceMirrorLabel") : ""].filter((part) => part !== "").join(" · ");
				return `${base}${total}${speed !== "" ? ` · ${speed}` : ""}${route !== "" ? ` · ${route}` : ""}${elapsed}`;
			}
			if (status.phase === "verifying") return `${t("verifying")}${elapsed}`;
			if (status.phase === "starting") return `${t("startingConn")}${elapsed}`;
			if (status.phase === "connecting") return `${t("connectingTunnel")}${elapsed}`;
			if (status.phase === "resolving") return `${t("waitingAddr")}${elapsed}`;
			return `${t("preparing")}${elapsed}`;
		}
		function proxyRouteLabel(source, t) {
			switch (source) {
				case "custom": return t("viaCustomProxy");
				case "environment": return t("viaEnvProxy");
				case "system": return t("viaSystemProxy");
				case "direct": return t("viaDirect");
			}
		}
		/** Official token-styled cards/typography (same pattern as shipped sections). */
		const s = {
			root: {
				display: "flex",
				flexDirection: "column",
				gap: 12
			},
			card: {
				background: "var(--dsw-alias-bg-layer-1, #ffffff)",
				border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))",
				borderRadius: 12,
				padding: "16px 20px",
				display: "flex",
				flexDirection: "column",
				gap: 10
			},
			row: {
				display: "flex",
				alignItems: "center",
				gap: 10
			},
			actionsRight: {
				display: "flex",
				alignItems: "center",
				justifyContent: "flex-end",
				gap: 10
			},
			title: {
				fontSize: 13,
				fontWeight: 600,
				margin: 0,
				color: "var(--dsw-alias-label-primary, inherit)"
			},
			hint: {
				fontSize: 12,
				lineHeight: 1.5,
				margin: 0,
				color: "var(--dsw-alias-label-secondary, #6b7280)"
			},
			muted: {
				fontSize: 12,
				lineHeight: 1.5,
				color: "var(--dsw-alias-label-tertiary, #8b93a1)"
			},
			code: {
				fontSize: 24,
				fontWeight: 700,
				letterSpacing: 6,
				textAlign: "center",
				fontVariantNumeric: "tabular-nums",
				padding: "8px 12px",
				borderRadius: 8,
				color: "var(--dsw-alias-label-primary, inherit)",
				background: "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))"
			},
			qrBox: {
				alignSelf: "center",
				padding: 10,
				border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))",
				borderRadius: 10,
				background: "#ffffff"
			},
			url: {
				fontSize: 12,
				wordBreak: "break-all",
				margin: 0,
				color: "var(--dsw-alias-label-secondary, #6b7280)"
			},
			device: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 10,
				padding: "8px 0",
				borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))"
			},
			warn: {
				fontSize: 12,
				lineHeight: 1.5,
				margin: 0,
				color: "var(--dsw-alias-state-warn-primary, #b45309)",
				background: "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))",
				borderLeft: "3px solid var(--dsw-alias-state-warn-primary, #b45309)",
				borderRadius: 8,
				padding: "8px 12px"
			},
			error: {
				fontSize: 12,
				lineHeight: 1.5,
				margin: 0,
				color: "var(--dsw-alias-state-error-primary, #dc2626)",
				background: "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))",
				borderLeft: "3px solid var(--dsw-alias-state-error-primary, #dc2626)",
				borderRadius: 8,
				padding: "8px 12px"
			},
			statusDot: {
				width: 8,
				height: 8,
				borderRadius: "50%",
				background: "currentColor",
				flex: "none"
			},
			details: {
				fontSize: 11,
				color: "var(--dsw-alias-label-tertiary, #8b93a1)"
			},
			fieldLabel: {
				fontSize: 12,
				fontWeight: 600,
				margin: 0,
				color: "var(--dsw-alias-label-secondary, #6b7280)"
			},
			radioRow: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				fontSize: 13,
				color: "var(--dsw-alias-label-primary, inherit)"
			},
			input: {
				fontSize: 12,
				padding: "6px 10px",
				borderRadius: 8,
				border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))",
				background: "var(--dsw-alias-bg-layer-1, #ffffff)",
				color: "var(--dsw-alias-label-primary, inherit)"
			}
		};
		/**
		* R06C4 advanced card: download network (auto/direct/custom) + download source
		* (auto/official/mirror) + custom proxy URL. Defaults need NO configuration —
		* the card is for advanced users; a change persists host-side and applies to
		* the next download. Custom proxy URLs containing credentials are rejected
		* with user copy (never persisted — no secret-at-rest).
		*/
		function DownloadSettingsCard({ api, t }) {
			const [settings, setSettings] = (0, react.useState)(null);
			const [customUrl, setCustomUrl] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)(null);
			const [saved, setSaved] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let alive = true;
				api.networkConfigGet().then((value) => {
					if (!alive) return;
					setSettings(value);
					setCustomUrl(value.customProxyUrl ?? "");
				});
				return () => {
					alive = false;
				};
			}, [api]);
			const save = (0, react.useCallback)(async () => {
				if (settings === null) return;
				const trimmed = customUrl.trim();
				if (settings.network === "custom" && trimmed === "") {
					setMessage(t("customProxyRequired"));
					return;
				}
				if (trimmed !== "") {
					let parsed;
					try {
						parsed = new URL(trimmed);
					} catch {
						setMessage(t("customProxyInvalid"));
						return;
					}
					if (parsed.username !== "" || parsed.password !== "") {
						setMessage(t("customProxyCredentials"));
						return;
					}
				}
				setSaving(true);
				setMessage(null);
				try {
					const result = await api.networkConfigSet({
						network: settings.network,
						source: settings.source,
						...trimmed === "" ? {} : { customProxyUrl: trimmed }
					});
					if (result.ok) {
						setSaved(true);
						setTimeout(() => {
							setSaved(false);
						}, 1500);
					} else setMessage(friendly(result.errorCode));
				} catch {
					setMessage(friendly("internal"));
				} finally {
					setSaving(false);
				}
			}, [
				api,
				settings,
				customUrl,
				t
			]);
			if (settings === null) return null;
			const networkOption = (value, label) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				style: s.radioRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "radio",
					name: "dsh-remote-download-network",
					checked: settings.network === value,
					onChange: () => {
						setSettings({
							...settings,
							network: value
						});
						setMessage(null);
					}
				}), label]
			});
			const sourceOption = (value, label) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				style: s.radioRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "radio",
					name: "dsh-remote-download-source",
					checked: settings.source === value,
					onChange: () => {
						setSettings({
							...settings,
							source: value
						});
						setMessage(null);
					}
				}), label]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: s.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: s.title,
						children: t("downloadSettings")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: s.fieldLabel,
						children: t("downloadNetwork")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [
							networkOption("auto", t("networkAuto")),
							networkOption("direct", t("networkDirect")),
							networkOption("custom", t("networkCustom"))
						]
					}),
					settings.network === "custom" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							style: s.fieldLabel,
							htmlFor: "dsh-remote-custom-proxy",
							children: t("customProxyUrl")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "dsh-remote-custom-proxy",
							style: s.input,
							value: customUrl,
							placeholder: t("customProxyPlaceholder"),
							onChange: (event) => {
								setCustomUrl(event.target.value);
								setMessage(null);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: s.fieldLabel,
						children: t("downloadSource")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [
							sourceOption("auto", t("sourceAuto")),
							sourceOption("official", t("sourceOfficial")),
							sourceOption("mirror", t("sourceMirror"))
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: s.hint,
						children: t("sourceNote")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "flex-end",
							gap: 10
						},
						children: [
							saving && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: s.hint,
								children: t("settingsSaving")
							}),
							saved && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									...s.hint,
									color: "var(--dsw-alias-state-success-primary, #16a34a)"
								},
								children: t("settingsSaved")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								size: "md",
								onClick: () => {
									save();
								},
								disabled: saving,
								children: t("saveSettings")
							})
						]
					}),
					message !== null && message !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: s.error,
						children: message
					})
				]
			});
		}
		/** The 远程控制 settings page. */
		function RemoteAccessSection({ api, t }) {
			const [status, setStatus] = (0, react.useState)(null);
			const [pairing, setPairing] = (0, react.useState)(null);
			const [now, setNow] = (0, react.useState)(() => Date.now());
			const [busy, setBusy] = (0, react.useState)(false);
			const [actionError, setActionError] = (0, react.useState)(null);
			const [copied, setCopied] = (0, react.useState)(false);
			const [qrData, setQrData] = (0, react.useState)(null);
			const [longPairing, setLongPairing] = (0, react.useState)(null);
			const [longTab, setLongTab] = (0, react.useState)("one-time");
			const [qrLongData, setQrLongData] = (0, react.useState)(null);
			const [customOpen, setCustomOpen] = (0, react.useState)(false);
			const [customCode, setCustomCode] = (0, react.useState)("");
			const [customError, setCustomError] = (0, react.useState)(null);
			const qrContentRef = (0, react.useRef)(null);
			const qrLongContentRef = (0, react.useRef)(null);
			const longMintingRef = (0, react.useRef)(false);
			const refresh = (0, react.useCallback)(async () => {
				const [next, pairingView, longView] = await Promise.all([
					api.status(),
					api.pairingStatus(),
					api.pairingLongStatus()
				]);
				setStatus(next);
				setPairing(pairingView);
				setLongPairing(longView);
				setActionError(null);
				return next;
			}, [api]);
			(0, react.useEffect)(() => {
				let alive = true;
				const tick = async () => {
					const [next, pairingView, longView] = await Promise.all([
						api.status(),
						api.pairingStatus(),
						api.pairingLongStatus()
					]);
					if (!alive) return;
					setStatus(next);
					setPairing(pairingView);
					setLongPairing(longView);
				};
				tick();
				const poll = setInterval(() => {
					tick();
				}, POLL_MS);
				const clock = setInterval(() => {
					setNow(Date.now());
				}, TICK_MS);
				return () => {
					alive = false;
					clearInterval(poll);
					clearInterval(clock);
				};
			}, [api]);
			(0, react.useEffect)(() => {
				const content = pairing !== null && pairing.state === "active" && status !== null && status.publicUrl !== void 0 ? pairingQrContent(status.publicUrl, pairing.secret) : null;
				if (content === qrContentRef.current) return;
				qrContentRef.current = content;
				if (content === null) {
					setQrData(null);
					return;
				}
				import_browser.toDataURL(content, {
					width: 220,
					margin: 1,
					errorCorrectionLevel: "M"
				}).then(setQrData).catch(() => {
					setQrData(null);
				});
			}, [pairing, status]);
			(0, react.useEffect)(() => {
				const content = longPairing !== null && longPairing.state === "active" && status !== null && status.publicUrl !== void 0 ? pairingQrContent(status.publicUrl, longPairing.secret) : null;
				if (content === qrLongContentRef.current) return;
				qrLongContentRef.current = content;
				if (content === null) {
					setQrLongData(null);
					return;
				}
				import_browser.toDataURL(content, {
					width: 220,
					margin: 1,
					errorCorrectionLevel: "M"
				}).then(setQrLongData).catch(() => {
					setQrLongData(null);
				});
			}, [longPairing, status]);
			const enable = (0, react.useCallback)(async () => {
				setBusy(true);
				setActionError(null);
				try {
					const result = await api.tunnelStart();
					const next = await refresh();
					if (result.ok) return;
					if (next !== null && next.phase !== "error" && !(next.phase === "idle" && !next.enabled)) setActionError(friendly(result.errorCode));
				} catch {
					setActionError(friendly("internal"));
				} finally {
					setBusy(false);
				}
			}, [api, refresh]);
			const disable = (0, react.useCallback)(async () => {
				setBusy(true);
				setActionError(null);
				try {
					await api.tunnelStop();
					setPairing({ state: "none" });
					await refresh();
				} catch {
					setActionError(friendly("internal"));
				} finally {
					setBusy(false);
				}
			}, [api, refresh]);
			const regenerate = (0, react.useCallback)(async () => {
				setActionError(null);
				try {
					const result = await api.pairingRotate();
					if (typeof result === "string") {
						setActionError(friendly(result));
						return;
					}
					setPairing(await api.pairingStatus());
				} catch {
					setActionError(friendly("internal"));
				}
			}, [api]);
			const copyUrl = (0, react.useCallback)(async (url) => {
				try {
					await navigator.clipboard.writeText(url);
					setCopied(true);
					setTimeout(() => {
						setCopied(false);
					}, 1500);
				} catch {}
			}, []);
			const rotateLong = (0, react.useCallback)(async (customCode) => {
				setActionError(null);
				try {
					const result = await api.pairingLongRotate(customCode);
					if (typeof result === "string") {
						setActionError(friendly(result));
						return;
					}
					setLongPairing({
						state: "active",
						createdAt: result.createdAt,
						code: result.code,
						secret: result.secret
					});
				} catch {
					setActionError(friendly("internal"));
				}
			}, [api]);
			const toggleCustom = (0, react.useCallback)(() => {
				setCustomOpen((open) => !open);
				setCustomError(null);
			}, []);
			const applyCustom = (0, react.useCallback)(async () => {
				const value = customCode.trim();
				if (!isPairingLongCodeShape(value)) {
					setCustomError(t("longCustomInvalid"));
					return;
				}
				setCustomError(null);
				await rotateLong(value.toUpperCase());
				setCustomOpen(false);
				setCustomCode("");
			}, [
				customCode,
				rotateLong,
				t
			]);
			const copyLongCode = (0, react.useCallback)(async (code) => {
				try {
					await navigator.clipboard.writeText(code);
					setCopied(true);
					setTimeout(() => {
						setCopied(false);
					}, 1500);
				} catch {}
			}, []);
			const openLongTab = (0, react.useCallback)(() => {
				setLongTab("long");
				if (longPairing === null || longPairing.state !== "none") return;
				if (longMintingRef.current) return;
				longMintingRef.current = true;
				rotateLong().finally(() => {
					longMintingRef.current = false;
				});
			}, [longPairing, rotateLong]);
			(0, react.useEffect)(() => {
				if (longTab !== "long") return;
				if (status === null || !status.enabled || status.publicUrl === void 0) return;
				if (longPairing === null || longPairing.state !== "none") return;
				if (longMintingRef.current) return;
				longMintingRef.current = true;
				rotateLong().finally(() => {
					longMintingRef.current = false;
				});
			}, [
				longTab,
				status,
				longPairing,
				rotateLong
			]);
			const revoke = (0, react.useCallback)(async (deviceId) => {
				setBusy(true);
				const result = await api.deviceRevoke(deviceId);
				setBusy(false);
				if (result.ok && result.revoked) await refresh();
				else setActionError(t("revokeFailed"));
			}, [
				api,
				refresh,
				t
			]);
			const revokeAll = (0, react.useCallback)(async () => {
				if (!window.confirm(t("revokeAllConfirm"))) return;
				setBusy(true);
				const result = await api.deviceRevokeAll();
				setBusy(false);
				if (result.ok) await refresh();
				else setActionError(t("revokeFailed"));
			}, [
				api,
				refresh,
				t
			]);
			if (!api.isLoopback) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-dsh-remote-section": true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: s.error,
					children: t("remoteOnly")
				})
			});
			if (status === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-dsh-remote-section": true,
				style: s.root,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: s.hint,
					children: t("preparing")
				})
			});
			const startupFailed = status.errorCode === "startup-failed" || !status.available;
			const tunnelError = status.errorCode !== void 0 && !startupFailed;
			const starting = status.phase === "resolving" || status.phase === "verifying" || status.phase === "downloading" || status.phase === "starting" || status.phase === "connecting";
			const generateButton = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: s.actionsRight,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					size: "md",
					onClick: () => {
						regenerate();
					},
					disabled: busy,
					"data-generate-new": true,
					children: t("generateNew")
				})
			});
			const renderPairingCard = () => {
				if (pairing === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: s.hint,
					children: t("preparing")
				});
				switch (pairing.state) {
					case "active":
						if (pairing.expiresAt <= now) return expiredCard();
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							qrData !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: s.qrBox,
								"data-pairing-qr": true,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
									src: qrData,
									alt: "pairing QR",
									width: 220,
									height: 220
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...s.hint,
									textAlign: "center"
								},
								children: t("scanHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...s.hint,
									textAlign: "center"
								},
								children: t("orManual")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: s.code,
								"data-pairing-code": true,
								children: [
									pairing.code.slice(0, 4),
									" ",
									pairing.code.slice(4)
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								style: {
									...s.hint,
									textAlign: "center"
								},
								"data-pairing-countdown": true,
								children: [
									t("expiresIn"),
									" ",
									formatRemaining(pairing.expiresAt - now)
								]
							})
						] });
					case "consumed": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						"data-pairing-state": "consumed",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...s.row,
									color: "var(--dsw-alias-state-success-primary, #16a34a)"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: s.statusDot }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: {
										...s.title,
										margin: 0
									},
									children: t("pairedSuccess")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: s.hint,
								children: t("credentialUsed")
							}),
							generateButton
						]
					});
					case "expired": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						"data-pairing-state": "expired",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...s.title,
									color: "var(--dsw-alias-state-warn-primary, #b45309)"
								},
								children: t("expired")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: s.hint,
								children: t("expiredNote")
							}),
							generateButton
						]
					});
					case "none": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						"data-pairing-state": "none",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: s.hint,
							children: t("noTicket")
						}), generateButton]
					});
				}
			};
			function expiredCard() {
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 8
					},
					"data-pairing-state": "expired",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: {
								...s.title,
								color: "var(--dsw-alias-state-warn-primary, #b45309)"
							},
							children: t("expired")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: s.hint,
							children: t("expiredNote")
						}),
						generateButton
					]
				});
			}
			const tabPill = (active) => ({
				fontSize: 13,
				fontWeight: 600,
				padding: "6px 14px",
				borderRadius: 999,
				cursor: "pointer",
				border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))",
				background: active ? "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.06))" : "transparent",
				color: "var(--dsw-alias-label-primary, inherit)"
			});
			const renderLongCard = () => {
				if (longPairing === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: s.hint,
					children: t("preparing")
				});
				const customPanel = customOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 6
					},
					"data-long-custom-panel": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							style: s.fieldLabel,
							htmlFor: "dsh-remote-long-custom",
							children: t("longCustomTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "dsh-remote-long-custom",
							style: s.input,
							value: customCode,
							maxLength: 12,
							autoComplete: "off",
							placeholder: t("longCustomPlaceholder"),
							onChange: (event) => {
								setCustomCode(event.target.value);
								setCustomError(null);
							},
							"data-long-custom-input": true
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: s.hint,
							children: t("longCustomHint")
						}),
						customError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: s.error,
							"data-long-custom-error": true,
							children: customError
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: s.actionsRight,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								size: "md",
								onClick: () => {
									applyCustom();
								},
								disabled: busy,
								"data-long-custom-apply": true,
								children: t("longCustomUse")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "md",
								onClick: toggleCustom,
								children: t("pickerCancel")
							})]
						})
					]
				}) : null;
				switch (longPairing.state) {
					case "none": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						"data-pairing-long-state": "none",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: s.hint,
								children: t("longNoneHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: s.actionsRight,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									size: "md",
									onClick: () => {
										rotateLong();
									},
									disabled: busy,
									"data-long-generate": true,
									children: t("generateLong")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									size: "md",
									onClick: toggleCustom,
									"data-long-custom-toggle": true,
									children: t("longCustomTitle")
								})]
							}),
							customPanel
						]
					});
					case "active": {
						const code = longPairing.code;
						const grouped = code.replace(/(.{3})/g, "$1 ").trim();
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							"data-pairing-long-state": "active",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										...s.row,
										justifyContent: "center",
										gap: 8
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											...s.title,
											margin: 0,
											color: "var(--dsw-alias-state-success-primary, #16a34a)"
										},
										"data-long-badge": true,
										children: t("longTermBadge")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: {
											...s.hint,
											margin: 0
										},
										children: t("longActiveHint")
									})]
								}),
								qrLongData !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: s.qrBox,
									"data-pairing-long-qr": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
										src: qrLongData,
										alt: "long-term pairing QR",
										width: 220,
										height: 220
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: {
										...s.hint,
										textAlign: "center"
									},
									children: t("scanHint")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: {
										...s.hint,
										textAlign: "center"
									},
									children: t("orManual")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: s.code,
									"data-pairing-long-code": true,
									children: grouped
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: s.actionsRight,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "outline",
											size: "md",
											onClick: () => {
												copyLongCode(code);
											},
											"data-long-copy": true,
											children: copied ? t("copied") : t("copyCode")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "outline",
											size: "md",
											onClick: () => {
												rotateLong();
											},
											disabled: busy,
											"data-long-rotate": true,
											children: t("longRotate")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "outline",
											size: "md",
											onClick: toggleCustom,
											"data-long-custom-toggle": true,
											children: t("longCustomTitle")
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: s.hint,
									"data-long-rotate-note": true,
									children: t("longRotateNote")
								}),
								customPanel,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: s.warn,
									"data-long-warning": true,
									children: t("longWarning")
								})
							]
						});
					}
					case "persisted": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						"data-pairing-long-state": "persisted",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: s.hint,
								children: t("longHiddenHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: s.actionsRight,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									size: "md",
									onClick: () => {
										rotateLong();
									},
									disabled: busy,
									"data-long-rotate": true,
									children: t("longRotate")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									size: "md",
									onClick: toggleCustom,
									"data-long-custom-toggle": true,
									children: t("longCustomTitle")
								})]
							}),
							customPanel
						]
					});
				}
			};
			let main;
			if (startupFailed) main = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: s.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						...s.row,
						color: "var(--dsw-alias-state-error-primary, #dc2626)"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: s.statusDot }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: s.title,
						children: t("offTitle")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RemoteErrorBanner, { code: status.errorCode ?? "startup-failed" })]
			});
			else if (status.enabled && status.publicUrl !== void 0) main = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: s.card,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								...s.row,
								color: "var(--dsw-alias-state-success-primary, #16a34a)"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: s.statusDot }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
								style: s.title,
								children: [
									t("onTitle"),
									" · ",
									t("statusOn")
								]
							})]
						}),
						status.edgeState === "degraded" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: s.warn,
							"data-edge-degraded": true,
							children: t("linkDegraded")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: s.row,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								style: {
									...s.url,
									flex: 1
								},
								children: [
									t("publicUrl"),
									": ",
									status.publicUrl
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "md",
								onClick: () => {
									copyUrl(status.publicUrl);
								},
								children: copied ? t("copied") : t("copyUrl")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: s.actionsRight,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "md",
								onClick: () => {
									disable();
								},
								disabled: busy,
								children: t("disable")
							})
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: s.card,
					"data-pairing-tabs": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							style: s.title,
							children: t("connectPhoneTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-pairing-tab": "one-time",
								style: tabPill(longTab === "one-time"),
								onClick: () => {
									setLongTab("one-time");
								},
								children: t("pairingTabOneTime")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-pairing-tab": "long",
								style: tabPill(longTab === "long"),
								onClick: () => {
									openLongTab();
								},
								children: t("pairingTabLong")
							})]
						}),
						longTab === "one-time" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [renderPairingCard(), pairing !== null && pairing.state === "active" && pairing.expiresAt > now && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: s.warn,
							children: t("credentialWarning")
						})] }) : renderLongCard()
					]
				}),
				status.devices.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: s.card,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
							style: s.title,
							children: [
								t("devices"),
								"（",
								status.devices.length,
								"）"
							]
						}),
						status.devices.map((device) => {
							const described = describeUserAgent(device.ua ?? "");
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: s.device,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										fontSize: 13,
										color: "var(--dsw-alias-label-primary, inherit)"
									},
									children: described.label
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: s.muted,
									children: [described.os ?? t("unknownDevice"), device.lastSeen !== void 0 ? ` · ${formatLastSeen(device.lastSeen)}` : ""]
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									size: "sm",
									onClick: () => {
										revoke(device.id);
									},
									disabled: busy,
									children: t("revoke")
								})]
							}, device.id);
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "md",
							onClick: () => {
								revokeAll();
							},
							disabled: busy,
							children: t("revokeAll")
						}) })
					]
				})
			] });
			else if (tunnelError) main = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: s.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...s.row,
							color: "var(--dsw-alias-state-error-primary, #dc2626)"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: s.statusDot }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							style: s.title,
							children: t("offTitle")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RemoteErrorBanner, { code: status.errorCode }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						style: s.details,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("diagnostics") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								style: s.muted,
								children: [
									"code: ",
									status.errorCode,
									status.binarySource !== void 0 ? ` · binary: ${status.binarySource}` : ""
								]
							}),
							status.edgeEvents !== void 0 && status.edgeEvents.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: s.muted,
								"data-edge-events": true,
								children: status.edgeEvents.map((event) => {
									const duration = event.degradedMs !== void 0 ? `(${Math.round(event.degradedMs / 1e3)}s)` : "";
									return `${event.kind}@${formatLastSeen(event.at)}${duration}`;
								}).join(" → ")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: s.actionsRight,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "md",
							onClick: () => {
								enable();
							},
							disabled: busy,
							children: t("enable")
						})
					})
				]
			});
			else main = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: s.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: s.row,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
							...s.statusDot,
							color: "var(--dsw-alias-label-tertiary, #8b93a1)"
						} }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
							style: s.title,
							children: [
								t("offTitle"),
								" · ",
								t("statusOff")
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: s.hint,
						children: t("offHint")
					}),
					starting ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: s.hint,
							children: startingStatusLine(status, t, now)
						}), status.phase === "connecting" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: s.actionsRight,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "md",
								onClick: () => {
									disable();
								},
								"data-connecting-cancel": true,
								children: t("stop")
							})
						})]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: s.actionsRight,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "md",
							onClick: () => {
								enable();
							},
							disabled: busy,
							children: t("enable")
						})
					}),
					actionError !== null && actionError !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: s.error,
						children: actionError
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-dsh-remote-section": true,
				style: s.root,
				children: [
					main,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UpdateCard, {
						api,
						t,
						status
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadSettingsCard, {
						api,
						t
					})
				]
			});
		}
		const RE_IPHONE = /\biPhone\b|\biPod\b/i;
		const RE_ANDROID = /\bAndroid\b/i;
		const RE_MOBILE = /\bMobile\b/i;
		const RE_IPAD = /\biPad\b/i;
		/**
		* Classify a device as phone / tablet / unknown.
		*
		* Explicit tablet requires STRONG evidence only:
		*   - a real iPad / iPadOS marker in the UA
		*   - iPadOS 13+ Safari (which reports a Macintosh UA): `platform ===
		*     'MacIntel'` AND a multi-touch screen — the standard reliable iPad
		*     signal. A real Mac has `maxTouchPoints` 0, so it is never mistaken for
		*     an iPad.
		*
		* `userAgentData.mobile === false` is deliberately NOT tablet evidence (it is
		* equally a desktop), and an Android UA without the `Mobile` token is NOT
		* force-locked as a tablet — both fall through to `unknown`.
		*
		* Explicit phone:
		*   - navigator.userAgentData.mobile === true
		*   - iPhone / iPod in the UA
		*   - Android AND Mobile BOTH in the UA (Android alone is never enough)
		*/
		function detectDeviceType(input) {
			if (RE_IPAD.test(input.ua)) return "tablet";
			if (input.platform === "MacIntel" && (input.maxTouchPoints ?? 0) > 1) return "tablet";
			if (input.userAgentDataMobile === true) return "phone";
			if (RE_IPHONE.test(input.ua)) return "phone";
			if (RE_ANDROID.test(input.ua) && RE_MOBILE.test(input.ua)) return "phone";
			return "unknown";
		}
		/**
		* The final rule. Returns the ONLY two outcomes the product needs:
		* `true` → Phone Enhancements, `false` → native DSH UI.
		*
		* Synchronous and deterministic: the same inputs always produce the same
		* boolean on the first call — no promise, no later flip.
		*/
		function detectPhone(input) {
			const shortSide = input.screenShortSide;
			switch (detectDeviceType(input)) {
				case "tablet": return false;
				case "phone": return shortSide < 600;
				case "unknown": return shortSide < 560 && input.pointerCoarse;
			}
		}
		/**
		* R14.2 — tablet picker eligibility (synchronous, pure, same inputs → same
		* boolean; never flips within a session).
		*
		* `true` → the device should register the mobile workspace picker (browse
		* rendering) WITHOUT the phone UI layer. Two routes:
		*   - explicit tablet (iPad / iPadOS Safari) → tablet, regardless of size;
		*   - unknown + coarse pointer + short side in [600, 1024) → touch tablet
		*     (Android tablets report an `Android` UA without the `Mobile` token and
		*     land in `unknown`).
		*
		* A desktop (fine pointer) never matches; a touch laptop at short side
		* >= 1024 is excluded by the upper gate. `phone` devices never match (their
		* picker eligibility is `detectPhone`).
		*/
		function detectTablet(input) {
			switch (detectDeviceType(input)) {
				case "tablet": return true;
				case "phone": return false;
				case "unknown": return input.pointerCoarse && input.screenShortSide >= 600 && input.screenShortSide < 1024;
			}
		}
		//#endregion
		//#region src/client/mobile/detect-browser.ts
		/**
		* R06C4C1 — browser adapter for the phone classifier (100% synchronous).
		*
		* Gathers the real browser signals and computes the final `isPhone` boolean
		* ONCE, synchronously, on first access. There is no asynchronous path, no
		* high-entropy UA-CH hint request (removed in R06C4C1), no promise, and no
		* later flip: the decision for the page session is immutable.
		*
		* Device classification NEVER changes with the viewport: not with a narrowed
		* window, a popped-up keyboard, the settings drawer, the address bar, or
		* innerHeight — only `screen` short side + device evidence decide.
		* `Math.min(screen.width, screen.height)` is also orientation-invariant (the
		* two values swap on rotation, the minimum stays the same).
		*
		* Consumers read the shared lazy singleton, so the settings section and the
		* overlay always use the SAME decision.
		*/
		function createPhoneDetection() {
			const input = readBrowserInput();
			return {
				isPhone: detectPhone(input),
				isTablet: detectTablet(input)
			};
		}
		function readBrowserInput() {
			const nav = navigator;
			return {
				ua: navigator.userAgent,
				userAgentDataMobile: nav.userAgentData?.mobile,
				platform: navigator.platform,
				maxTouchPoints: navigator.maxTouchPoints,
				screenShortSide: Math.min(screen.width, screen.height),
				pointerCoarse: window.matchMedia("(pointer: coarse)").matches
			};
		}
		let instance;
		/** The shared, lazily-created detection (one synchronous decision per page load). */
		function getPhoneDetection() {
			instance ??= createPhoneDetection();
			return instance;
		}
		//#endregion
		//#region src/client/settings-nav-icon.ts
		/**
		* Settings-nav glyph override (read-only-shell workaround, option A).
		*
		* DSH's settings shell picks each nav glyph by section id in `SettingsRoot.tsx`
		* `navIcon()`; an id the shell does not know — our `remote-access` — falls back
		* to the settings gear, the SAME glyph as the General section. The
		* `settings.section` registration carries no icon field, so on a stock DSH this
		* plugin cannot supply a distinct nav glyph through the slot contract. This
		* module injects it directly: a body-level MutationObserver finds the settings
		* panel's nav cell whose label matches the remote-control label and swaps the
		* leading gear <svg> for a display/window glyph (16px, currentColor) vendored
		* from the native icon set — a single device, so it stays clean and matches the
		* shell nav glyphs' size and镂空 style exactly.
		*
		* It targets only `[role="dialog"] nav button` and never touches shell CSS or
		* semantics. It is idempotent AND self-healing: a shell re-render (e.g. a
		* locale re-registration bumping the ledger) may re-insert the original gear,
		* whereupon the observer re-applies the glyph. A shell owner who adds
		* `remote-access` to `navIcon()` can delete this module.
		*/
		/** Remote-control nav label in every shipped locale (the shell exposes no DOM id). */
		const REMOTE_LABELS = ["远程控制", "Remote Control"];
		/**
		* 16px native system glyph (vendored verbatim from DSH's
		* `IconBrowseOutline16` — a hollow window/display frame). Single device so
		* it stays clean at 16px, and being an actual system icon it matches the
		* shell nav glyphs' size + 镂空 style exactly.
		*/
		const ICON_SVG = [
			"<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">",
			"<path fill=\"currentColor\" d=\"M11.2426 4.80473V6.10551H4.75819V4.80473H11.2426Z\"/>",
			"<path fill=\"currentColor\" d=\"M9.40858 7.84478V9.14557H4.75819V7.84478H9.40858Z\"/>",
			"<path fill=\"currentColor\" d=\"M9.23438 0.546389C10.1941 0.546389 10.9683 0.544914 11.5859 0.611819C12.2161 0.680096 12.7634 0.825745 13.2393 1.17139C13.5172 1.3733 13.7619 1.61812 13.9639 1.896C14.3096 2.37183 14.4551 2.91922 14.5234 3.54932C14.5903 4.16686 14.5889 4.94133 14.5889 5.90088V10.0981C14.5889 11.0576 14.5903 11.8321 14.5234 12.4497C14.4552 13.0798 14.3094 13.6272 13.9639 14.103C13.7619 14.381 13.5172 14.6257 13.2393 14.8276C12.7633 15.1734 12.2163 15.3189 11.5859 15.3872C10.9683 15.4541 10.1942 15.4536 9.23438 15.4536H6.76563C5.80591 15.4536 5.03168 15.4541 4.41407 15.3872C3.78385 15.3189 3.23665 15.1734 2.76074 14.8276C2.48291 14.6257 2.23802 14.3809 2.03614 14.103C1.69066 13.6272 1.54483 13.0798 1.47657 12.4497C1.40973 11.8321 1.41114 11.0576 1.41114 10.0981V5.90088C1.41113 4.94132 1.40966 4.16686 1.47657 3.54932C1.54488 2.91921 1.69042 2.37184 2.03614 1.896C2.2381 1.61807 2.4828 1.37333 2.76074 1.17139C3.23665 0.825682 3.78386 0.680109 4.41407 0.611819C5.03168 0.544905 5.80591 0.546389 6.76563 0.546389H9.23438ZM6.76563 1.896C5.77586 1.896 5.0876 1.89738 4.55957 1.95459C4.0443 2.01043 3.76214 2.11349 3.55469 2.26416C3.39135 2.38284 3.24761 2.52662 3.12891 2.68994C2.97821 2.89736 2.8752 3.17967 2.81934 3.69483C2.76214 4.22279 2.76075 4.91131 2.76074 5.90088V10.0981C2.76074 11.0876 2.76221 11.7762 2.81934 12.3042C2.87516 12.8194 2.97829 13.1026 3.12891 13.3101C3.24754 13.4733 3.39147 13.6172 3.55469 13.7358C3.76213 13.8865 4.04438 13.9896 4.55957 14.0454C5.0876 14.1026 5.77586 14.103 6.76563 14.103H9.23438C10.2242 14.103 10.9124 14.1026 11.4404 14.0454C11.9556 13.9896 12.2379 13.8865 12.4453 13.7358C12.6086 13.6172 12.7525 13.4733 12.8711 13.3101C13.0217 13.1026 13.1248 12.8195 13.1807 12.3042C13.2378 11.7762 13.2393 11.0876 13.2393 10.0981V5.90088C13.2393 4.91131 13.2379 4.22279 13.1807 3.69483C13.1248 3.17969 13.0218 2.89736 12.8711 2.68994C12.7524 2.52667 12.6086 2.38281 12.4453 2.26416C12.2379 2.11355 11.9556 2.01041 11.4404 1.95459C10.9124 1.8974 10.2241 1.896 9.23438 1.896H6.76563Z\"/>",
			"</svg>"
		].join("");
		/** The marker attribute stamped on OUR glyph so re-runs skip it (and re-apply after a shell re-render). */
		const MARKER = "data-dsh-remote-icon";
		/**
		* Install the observer that swaps the remote-control section's nav glyph.
		* @returns a cleanup that disconnects the observer (used as an effect callback).
		*/
		function installSettingsNavIcon() {
			const applyOnce = () => {
				document.querySelectorAll("[role=\"dialog\"] nav button").forEach((button) => {
					const label = button.lastElementChild?.textContent?.trim() ?? "";
					if (!REMOTE_LABELS.includes(label)) return;
					const icon = button.firstElementChild;
					if (icon?.hasAttribute(MARKER) === true) return;
					if (!(icon instanceof SVGElement)) return;
					const glyph = new DOMParser().parseFromString(ICON_SVG, "image/svg+xml").documentElement;
					glyph.setAttribute(MARKER, "");
					icon.replaceWith(glyph);
				});
			};
			const observer = new MutationObserver(applyOnce);
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			applyOnce();
			return () => observer.disconnect();
		}
		//#endregion
		//#region src/client/mobile/mobile.css.ts
		/**
		* Phone layer stylesheet (R06C4C: injected ONLY when the device classifier
		* says phone — tablets/desktops/narrow desktop windows never receive it and
		* keep the DSH native UI byte-for-byte untouched).
		*
		* R14.2: the workspace-picker sheet is now a SEPARATE stylesheet
		* (`PICKER_CSS`, below) injected for `isPhone || isTablet` — a tablet gets
		* the browse picker WITHOUT the phone UI layer (drawer / fab / backdrop /
		* phone chrome stay phone-only). The picker rules therefore live OUTSIDE the
		* `max-width: 1023px` block and have no `>= 1024px` desktop guard, so an iPad
		* in landscape (short side 1024) still renders the sheet. Phone-only rules
		* keep the desktop guard unchanged.
		*
		* Portions adapted from the MIT-licensed dsh-web-mobile project
		* (https://github.com/dsh-web-mobile, © its authors), specifically
		* `src/client/styles/layout.css.ts`. The MIT license text is preserved in
		* `NOTICE` inside this repository and the adapted fragments are listed in the
		* R04 report (section "License attribution"). Adaptations:
		*   - the marker attribute is `data-dsh-remote-mobile` (this plugin's own)
		*   - only the rules this plugin needs are kept (no aionui / git graph /
		*     stats / usage plugins), so future DSH DOM upgrades have a small
		*     maintenance surface
		*   - structural anchors only: DSH's own attributes (`data-side`,
		*     `data-phase`, `aria-modal`) and class-suffix selectors; nothing depends
		*     on third-party plugin DOM.
		*
		* Once installed (phone devices only), the phone layout rules key off the
		* < 1024px viewport: every real phone viewport is below it. The
		* 768–1023px block below originally accommodated TABLETS; under the final
		* R06C4C rule tablets never receive the phone stylesheet, so that block now
		* only affects wide / landscape PHONES (centered sheets instead of
		* edge-to-edge).
		*/
		const MOBILE_CSS = `/* ---------- dsh-remote-web-gateway: mobile-only layer (< 1024px) ---------- */

@media (max-width: 1023px) {
  /* Phone chrome: keep pan/pinch zoom, kill double-tap zoom and the 300ms
     tap delay. Safe-area pushes content below the status bar / notch. */
  html,
  body {
    touch-action: manipulation !important;
  }

  /* --- Sidebar becomes a left drawer ---
     The frame is found by the overlay effect ([data-dsh-remote-mobile]);
     the first grid child is DSH's sidebar column. Closed: fully off-screen
     (translateX(-110%)). Open (frame WITHOUT data-sidebar-collapsed):
     transform:none so fixed-position descendants stay viewport-anchored. */
  [data-dsh-remote-mobile="frame"] {
    position: relative !important;
    grid-template-columns: minmax(0, 1fr) 0 0 !important;
    padding-top: env(safe-area-inset-top, 0px) !important;
  }

  [data-dsh-remote-mobile="frame"] > :first-child {
    position: absolute !important;
    inset: 0 auto 0 0 !important;
    width: max-content !important;
    max-width: 92vw !important;
    z-index: 40 !important;
    transform: translateX(-110%);
    transition: transform .28s var(--ds-ease-in-out, ease-in-out);
    background: var(--dsw-alias-bg-layer-1, #ffffff);
    padding-top: env(safe-area-inset-top, 0px) !important;
    border-right: none !important;
    overflow-y: auto !important;
  }

  [data-dsh-remote-mobile="frame"]:not([data-sidebar-collapsed]) > :first-child {
    transform: none !important;
  }

  /* Drag handles are useless on touch and would float over the drawer. */
  [data-side="sidebar"],
  [data-side="details"] {
    display: none !important;
  }

  /* --- Floating open button + backdrop (rendered by the overlay) --- */
  [data-dsh-remote-mobile="fab"] {
    position: fixed !important;
    right: 16px !important;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 16px) !important;
    z-index: 45 !important;
    width: 48px !important;
    height: 48px !important;
    min-height: 48px !important;
    border-radius: 50% !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border: none !important;
    background: var(--dsw-alias-button-floating-fill, #ffffff) !important;
    color: var(--dsw-alias-label-primary, inherit) !important;
    box-shadow: 0 2px 12px rgba(0, 0, 0, .25) !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  [data-dsh-remote-mobile="backdrop"] {
    position: fixed !important;
    inset: 0 !important;
    z-index: 39 !important;
    background: rgba(0, 0, 0, .35) !important;
    border: none !important;
    animation: dsh-remote-mobile-fade .18s var(--ds-ease-out, ease-in-out);
  }

  /* --- R13: always-visible sidebar entry (upstream MobileNavToggle idea) ---
     The opener renders whenever the drawer is closed, in EVERY phase (the
     overlay no longer phase-gates it), so an active conversation always has a
     Workspace/Session entry point. Placement is pure CSS:
     - hero / blank (frame without [data-phase="active"]): the floating
       bottom-right button above (existing rules).
     - active conversation: a compact top-left hamburger over the session
       header, with the header yielding left padding so the crumbs never
       slide under it.
     - any open modal ([aria-modal="true"]): hidden, matching the Escape
       yield in MobileOverlay.
     Requires :has() (Chromium 105+, Safari 15.4+) — already used by the
     settings-sheet rules in this file. */
  [data-dsh-remote-mobile="frame"]:has([data-phase="active"]) [data-dsh-remote-mobile="fab"] {
    right: auto !important;
    left: calc(env(safe-area-inset-left, 0px) + 8px) !important;
    top: calc(env(safe-area-inset-top, 0px) + 8px) !important;
    bottom: auto !important;
    width: 36px !important;
    height: 36px !important;
    min-height: 36px !important;
  }
  [data-dsh-remote-mobile="frame"]:has([data-phase="active"]) [data-phase] header {
    padding-left: 52px !important;
  }
  [data-dsh-remote-mobile="frame"]:has([aria-modal="true"]) [data-dsh-remote-mobile="fab"],
  [data-dsh-remote-mobile="frame"]:has([aria-modal="true"]) [data-dsh-remote-mobile="backdrop"] {
    display: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-dsh-remote-mobile="backdrop"] {
      animation: none !important;
    }
    [data-dsh-remote-mobile="frame"] > :first-child {
      transition: none !important;
    }
  }

  /* --- Conversation text on mobile ---
     Trim the side gutters, shrink the type a notch, remove desktop
     scrollbar-gutter (touch scrolling), keep actions inside the message. */
  [data-phase] [class$="_scrollBody"] {
    scrollbar-gutter: auto !important;
    scrollbar-width: none !important;
  }
  [data-phase] [class$="_scrollBody"]::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }
  [data-phase] [class$="_actions"] {
    overflow: hidden !important;
  }
  [data-phase] [class$="_actions"] [class$="_timeEnd"] {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  [data-phase] [class$="_scroll"]:has(p) {
    padding-left: 20px !important;
    padding-right: 20px !important;
    font-size: 15px !important;
  }
  [data-phase] [class$="_scroll"]:has(p) p,
  [data-phase] [class$="_scroll"]:has(p) li,
  [data-phase] [class$="_scroll"]:has(p) [class*="_text_"] {
    font-size: 15px !important;
  }

  /* Markdown tables fill the message column; a truly wide cell scrolls
     inside the wrapper instead of overflowing the viewport. */
  [data-phase] table {
    width: 100% !important;
    max-width: 100% !important;
  }
  [data-phase] th,
  [data-phase] td {
    max-width: none !important;
    min-width: 0 !important;
  }

  /* User bubbles fill the message column on phones. */
  [data-phase] [class$="_userStack"],
  [data-phase] [class$="_userStack"] [class$="_bubble"] {
    box-sizing: border-box !important;
    width: fit-content !important;
    max-width: 100% !important;
  }

  /* --- Composer bottom row ---
     The permission pill keeps its natural width; the model pill absorbs the
     spare space and ellipsizes the full model id instead of squeezing the
     permission control. Structural anchors only (the card is the element
     containing the textarea). */
  [data-phase] [class*="_card"]:has(textarea) [class$="_row"]:has([class$="_trailing"]) {
    gap: 8px !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_row"]:has([class$="_trailing"]) > :first-child {
    gap: 8px !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_row"]:has([class$="_trailing"]) > :first-child > :nth-child(2) {
    flex: 0 0 auto !important;
    gap: 8px !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_trailing"] {
    flex: 1 1 auto !important;
    gap: 8px !important;
    min-width: 0 !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_root"]:has(> [class$="_trigger"][aria-haspopup="menu"]) {
    flex: 1 1 auto !important;
    min-width: 0 !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_root"]:has(> [class$="_trigger"][aria-haspopup="menu"]) > [class$="_trigger"] {
    width: 100% !important;
    max-width: 100% !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_root"]:has(> [class$="_trigger"][aria-haspopup="menu"]) > [class$="_trigger"] > [class$="_triggerLabel"] {
    flex: 1 1 auto !important;
    min-width: 0 !important;
  }
  /* Center the model menu on the trigger so it never overflows the left edge. */
  [data-phase] [class*="_card"]:has(textarea) [class$="_root"]:has(> [class$="_trigger"]) > [class$="_menu"] {
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
  }

  /* --- Session header ---
     Cap the crumb width so the mode label and helper cluster stay readable;
     keep the actions right-aligned. */
  [data-phase] header [class$="_crumbs"] {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    max-width: 24vw !important;
  }
  [data-phase] header [class$="_headerActions"] {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    margin-left: auto !important;
    justify-content: flex-end !important;
  }

  /* --- Settings dialog on mobile ---
     Near-full-width bottom sheet: nav tabs wrap into rows on top, options
     scroll below. Gated on the settings nav tab list (:has(> :first-child >
     :last-child > button)) so the transient export dialog keeps its official
     centered card. Requires :has() (Chromium 105+). */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) {
    position: absolute !important;
    left: 8px !important;
    top: calc(env(safe-area-inset-top, 0px) + 12px) !important;
    width: calc(100vw - 16px) !important;
    max-width: calc(100vw - 16px) !important;
    height: auto !important;
    max-height: min(800px, calc(100dvh - 24px - env(safe-area-inset-top, 0px))) !important;
    flex-direction: column !important;
    border-radius: 14px !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) > :first-child {
    width: 100% !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 10px 12px 8px !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) > :first-child > :first-child {
    display: none !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) > :first-child [class$="_navList"] {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    flex-direction: row !important;
    flex-wrap: wrap !important;
    gap: 6px !important;
    overflow: visible !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) > :last-child {
    flex: 1 1 auto !important;
    min-height: 0 !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) > :last-child > :last-child {
    padding: 0 12px 24px !important;
  }
  /* The transient export dialog must never overflow the viewport. */
  [aria-modal="true"]:not(:has(> :first-child > :last-child > button)) {
    max-width: calc(100vw - 32px) !important;
  }

  /* --- Touch targets ---
     Anything tappable in the drawer / settings sheet gets a comfortable
     minimum height. */
  [data-dsh-remote-mobile="frame"] button,
  [aria-modal="true"] button {
    min-height: 36px !important;
  }

  @keyframes dsh-remote-mobile-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}

/* --- Wide / landscape phones (768-1023px): sheets stay centered, never
     edge-to-edge. (Adapted from dsh-web-mobile misc.css.ts; under the final
     R06C4C rule tablets never receive this stylesheet, so this block only
     fires on phones whose viewport happens to exceed 768px.) */
@media (min-width: 768px) and (max-width: 1023px) {
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])),
  [aria-modal="true"]:not(:has(> :first-child > :last-child > button)) {
    left: 0 !important;
    right: 0 !important;
    margin-left: auto !important;
    margin-right: auto !important;
    width: min(calc(100vw - 32px), 720px) !important;
    max-width: min(calc(100vw - 32px), 720px) !important;
  }
  [aria-modal="true"] [class$="_section"] {
    width: 100% !important;
    max-width: none !important;
  }
}

/* --- Desktop guard (>= 1024px): the mobile controls never appear even if
     the overlay effect left them mounted. The DSH official layout is
     untouched — every other rule lives inside the max-width: 1023px block.
     (The workspace picker sheet is NOT guarded here: it lives in PICKER_CSS
     and is gated by device detection, so a tablet in landscape keeps it.) */
@media (min-width: 1024px) {
  [data-dsh-remote-mobile="fab"],
  [data-dsh-remote-mobile="backdrop"] {
    display: none !important;
  }
}
`;
		/**
		* R14.2 — mobile workspace directory picker bottom-sheet stylesheet.
		*
		* Injected for `isPhone || isTablet` (NOT the phone UI layer). Lives OUTSIDE
		* the `max-width: 1023px` media block with NO `>= 1024px` guard, so an iPad in
		* landscape (short side 1024) still renders the sheet. A tablet therefore
		* gets the browse picker without the drawer / fab / backdrop / phone chrome.
		*/
		const PICKER_CSS = `/* ---------- dsh-remote-web-gateway: mobile workspace picker (device-gated) ---------- */

  [data-dsh-remote-workspace-picker] {
    position: fixed !important;
    inset: 0 !important;
    z-index: 46 !important;
    display: flex !important;
    align-items: flex-end !important;
    justify-content: center !important;
    background: rgba(0, 0, 0, .35) !important;
    animation: dsh-remote-mobile-fade .18s var(--ds-ease-out, ease-in-out);
  }
  [data-dsh-remote-workspace-picker] [data-wsb="sheet"] {
    box-sizing: border-box !important;
    width: 100% !important;
    max-width: 720px !important;
    height: min(88dvh, 900px, calc(100dvh - 16px)) !important;
    max-height: calc(100dvh - 16px) !important;
    display: flex !important;
    flex-direction: column !important;
    background: var(--dsw-alias-bg-layer-1, #ffffff) !important;
    border-radius: 14px 14px 0 0 !important;
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
    overflow: hidden !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="header"] {
    display: grid !important;
    grid-template-columns: minmax(72px, auto) minmax(0, 1fr) 28px !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    padding: 12px 14px 8px !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="title"] {
    margin: 0 !important;
    font-size: 16px !important;
    line-height: 22px !important;
    color: var(--dsw-alias-label-primary, inherit) !important;
    overflow: hidden !important;
    text-align: center !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="back"] {
    min-height: 32px !important;
    padding: 4px 6px !important;
    border: none !important;
    border-radius: 8px !important;
    background: transparent !important;
    color: var(--dsw-alias-state-business-primary, #4f6ef7) !important;
    font-size: 14px !important;
    line-height: 20px !important;
    text-align: left !important;
    cursor: pointer !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="back"]:disabled {
    visibility: hidden !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="close"] {
    width: 28px !important;
    height: 28px !important;
    min-height: 28px !important;
    flex: none !important;
    border: none !important;
    border-radius: 50% !important;
    background: transparent !important;
    color: var(--dsw-alias-label-secondary, inherit) !important;
    font-size: 14px !important;
    line-height: 1 !important;
    cursor: pointer !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="crumbs"] {
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 4px !important;
    padding: 4px 14px 8px !important;
    border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .08)) !important;
    overflow-x: auto !important;
    scrollbar-width: none !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="crumb-seat"] {
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    min-width: 0 !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="crumb-sep"] {
    color: var(--dsw-alias-label-dimmed, rgba(0, 0, 0, .35)) !important;
    font-size: 14px !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="crumb"] {
    border: none !important;
    background: transparent !important;
    color: var(--dsw-alias-label-secondary, inherit) !important;
    font-size: 13px !important;
    line-height: 20px !important;
    padding: 4px 6px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    min-height: 28px !important;
    max-width: 34vw !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="content"] {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    overflow-y: auto !important;
    padding: 4px 8px 8px !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="list"] {
    list-style: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="row"] {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 8px !important;
    width: 100% !important;
    min-height: 40px !important;
    border: none !important;
    border-radius: 10px !important;
    background: transparent !important;
    color: var(--dsw-alias-label-primary, inherit) !important;
    font-size: 15px !important;
    line-height: 22px !important;
    padding: 8px 10px !important;
    cursor: pointer !important;
    text-align: left !important;
    -webkit-tap-highlight-color: transparent !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="row"]:active {
    background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06)) !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="row-name"] {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="row-icon"] {
    flex: none !important;
    width: 22px !important;
    font-size: 16px !important;
    line-height: 22px !important;
    text-align: center !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="row-chevron"] {
    flex: none !important;
    margin-left: auto !important;
    color: var(--dsw-alias-label-dimmed, rgba(0, 0, 0, .35)) !important;
    font-size: 16px !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="loading"],
  [data-dsh-remote-workspace-picker] [data-wsb="truncated"] {
    padding: 10px 12px !important;
    font-size: 13px !important;
    line-height: 20px !important;
    color: var(--dsw-alias-label-secondary, inherit) !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="error"] {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    margin: 8px 6px 0 !important;
    padding: 10px 12px !important;
    border-radius: 10px !important;
    background: var(--dsw-alias-state-error-secondary, rgba(240, 68, 56, .1)) !important;
    color: var(--dsw-alias-state-error-primary, #e5484d) !important;
    font-size: 13px !important;
    line-height: 20px !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="retry"] {
    flex: none !important;
    min-height: 30px !important;
    border: none !important;
    border-radius: 8px !important;
    background: transparent !important;
    color: var(--dsw-alias-state-business-primary, #4f6ef7) !important;
    font-size: 13px !important;
    cursor: pointer !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="footer"] {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 8px !important;
    padding: 10px 14px calc(env(safe-area-inset-bottom, 0px) + 10px) !important;
    border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .08)) !important;
    flex: 0 0 auto !important;
    background: var(--dsw-alias-bg-layer-1, #ffffff) !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="cancel"],
  [data-dsh-remote-workspace-picker] [data-wsb="select"] {
    min-height: 38px !important;
    padding: 0 16px !important;
    border-radius: 10px !important;
    font-size: 14px !important;
    line-height: 20px !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: transparent !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="cancel"] {
    border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .12)) !important;
    background: transparent !important;
    color: var(--dsw-alias-label-primary, inherit) !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="select"] {
    border: none !important;
    background: var(--dsw-alias-button-floating-fill, #ffffff) !important;
    color: var(--dsw-alias-state-business-primary, #4f6ef7) !important;
    font-weight: 600 !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="select"]:disabled,
  [data-dsh-remote-workspace-picker] [data-wsb="cancel"]:disabled {
    opacity: .45 !important;
    cursor: default !important;
  }

  @media (min-width: 768px) {
    [data-dsh-remote-workspace-picker] {
      align-items: center !important;
      padding: 24px !important;
      box-sizing: border-box !important;
    }
    [data-dsh-remote-workspace-picker] [data-wsb="sheet"] {
      height: min(82dvh, 900px, calc(100dvh - 48px)) !important;
      max-height: calc(100dvh - 48px) !important;
      border-radius: 14px !important;
      padding-bottom: 0 !important;
    }
  }

  @keyframes dsh-remote-mobile-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;
		//#endregion
		//#region src/client/mobile/index.ts
		/**
		* Phone layer: CSS injection + phone chrome (viewport-fit, theme-color).
		*
		* R06C4C: the CALLERS only install these when the device classifier says
		* phone (`client/index.ts`). On tablets / desktops / narrow desktop windows
		* nothing here is ever installed — the DSH native UI is used as-is.
		*
		* The phone-chrome effect is adapted from the MIT-licensed dsh-web-mobile
		* project (`src/client/effects/phone-chrome.ts`); see the R04 report for
		* attribution. Once installed (a phone), the internal rules stay gated on
		* the < 1024px viewport breakpoint: a phone's viewport is always below it,
		* and the phone chrome (viewport-fit) only applies while narrow.
		*/
		/** Inject the mobile stylesheet; returns the cleanup. */
		function installMobileCss(pluginId) {
			const tag = document.createElement("style");
			tag.dataset.plugin = pluginId;
			tag.dataset.pluginCss = `${pluginId}/mobile.css`;
			tag.textContent = MOBILE_CSS;
			document.head.appendChild(tag);
			return () => {
				tag.remove();
			};
		}
		/**
		* R14.2 — inject the workspace-picker bottom-sheet stylesheet for
		* `isPhone || isTablet` (a tablet gets the browse picker WITHOUT the phone UI
		* layer). Returns the cleanup.
		*/
		function installPickerCss(pluginId) {
			const tag = document.createElement("style");
			tag.dataset.plugin = pluginId;
			tag.dataset.pluginCss = `${pluginId}/picker.css`;
			tag.textContent = PICKER_CSS;
			document.head.appendChild(tag);
			return () => {
				tag.remove();
			};
		}
		/**
		* Phone chrome: viewport-fit=cover (so env(safe-area-inset-top) is the real
		* status-bar height), a theme-color meta tracking the shell background, and
		* the legacy-iOS gesturestart fallback for double-tap zoom. Inert at >=
		* 1024px; restores everything on cleanup.
		*/
		function installPhoneChrome() {
			const narrow = window.matchMedia("(max-width: 1023px)");
			const viewport = document.querySelector("meta[name=\"viewport\"]");
			const originalViewport = viewport?.content ?? "";
			const themeMeta = document.createElement("meta");
			themeMeta.name = "theme-color";
			const bodyBg = () => getComputedStyle(document.body).backgroundColor;
			const sync = () => {
				if (viewport !== null) viewport.content = "width=device-width, initial-scale=1, viewport-fit=cover";
				themeMeta.content = bodyBg();
				if (themeMeta.parentElement === null) document.head.appendChild(themeMeta);
			};
			const restore = () => {
				if (viewport !== null) viewport.content = originalViewport;
				themeMeta.remove();
			};
			const onGestureStart = (event) => event.preventDefault();
			if (narrow.matches) sync();
			const onChange = (event) => event.matches ? sync() : restore();
			narrow.addEventListener("change", onChange);
			const observer = new MutationObserver(() => {
				if (narrow.matches) themeMeta.content = bodyBg();
			});
			observer.observe(document.body, {
				attributes: true,
				attributeFilter: ["data-ds-dark-theme"]
			});
			document.addEventListener("gesturestart", onGestureStart);
			return () => {
				narrow.removeEventListener("change", onChange);
				observer.disconnect();
				document.removeEventListener("gesturestart", onGestureStart);
				restore();
			};
		}
		//#endregion
		//#region src/client/mobile/MobileOverlay.tsx
		/**
		* Mobile shell overlay: owns the `data-dsh-remote-mobile` marker on the
		* AppFrame element (the CSS restructure keys off it), mirrors the frame's
		* collapsed state, and renders the dimmed backdrop plus a single sidebar
		* opener.
		*
		* R13 (v0.2.1): the opener is the ALWAYS-VISIBLE sidebar entry — it renders
		* whenever the drawer is closed, in EVERY phase (hero/blank AND active
		* conversations), so an active conversation always has a Workspace/Session
		* entry point. Placement is pure CSS in mobile.css.ts (`:has([data-phase=
		* "active"])` moves it to the top-left over the session header; hero keeps
		* the floating bottom-right position). This absorbs the upstream
		* dsh-web-mobile v1.5.0 MobileNavToggle design idea (always-available
		* entry + `ctx.layout.toggleSidebar()`) while keeping this plugin's own
		* device-classifier gating.
		*
		* Adapted from the MIT-licensed dsh-web-mobile project
		* (`src/client/MobileNavOverlay.tsx`; upstream v1.5.0 moved the overlay
		* interactions into `effects/phone-chrome.ts`); see the R04 report and
		* NOTICE for attribution.
		*/
		/** The AppFrame element: direct parent of the shell overlay layer. */
		function findFrame() {
			return document.querySelector("[data-shell-overlay]")?.parentElement ?? null;
		}
		function MobileOverlay({ toggleSidebar, t }) {
			const mobile = getPhoneDetection().isPhone;
			const [open, setOpen] = (0, react.useState)(false);
			(0, react.useLayoutEffect)(() => {
				if (!mobile) {
					setOpen(false);
					return;
				}
				const frame = findFrame();
				if (frame === null) return;
				frame.setAttribute("data-dsh-remote-mobile", "frame");
				const sync = () => setOpen(!frame.hasAttribute("data-sidebar-collapsed"));
				sync();
				const observer = new MutationObserver(sync);
				observer.observe(frame, {
					attributes: true,
					attributeFilter: ["data-sidebar-collapsed"]
				});
				return () => {
					observer.disconnect();
					frame.removeAttribute("data-dsh-remote-mobile");
				};
			}, [mobile]);
			(0, react.useEffect)(() => {
				if (!mobile || !open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape" && document.querySelector("[aria-modal=\"true\"]") === null) toggleSidebar();
				};
				document.addEventListener("keydown", onKeyDown, true);
				return () => document.removeEventListener("keydown", onKeyDown, true);
			}, [
				mobile,
				open,
				toggleSidebar
			]);
			(0, react.useEffect)(() => {
				if (!mobile || !open) return;
				const onDrawerClick = (event) => {
					if (document.querySelector("[aria-modal=\"true\"]") !== null) return;
					const target = event.target;
					if (target === null) return;
					const drawer = document.querySelector("[data-dsh-remote-mobile=\"frame\"] > :first-child");
					if (drawer === null || !drawer.contains(target)) return;
					if (target.closest("[class*=\"sessionRow\"] button") !== null) return;
					if (target.closest("[class*=\"newSession\"], [class*=\"sessionRow\"], [class*=\"searchResultRow\"], [class*=\"searchResultWorkspace\"]") !== null) toggleSidebar();
				};
				document.addEventListener("click", onDrawerClick, true);
				return () => document.removeEventListener("click", onDrawerClick, true);
			}, [
				mobile,
				open,
				toggleSidebar
			]);
			if (!mobile) return null;
			const openLabel = t("drawerOpen");
			const closeLabel = t("drawerClose");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-dsh-remote-mobile": "backdrop",
				role: "button",
				"aria-label": closeLabel,
				onClick: () => toggleSidebar()
			}), !open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				"data-dsh-remote-mobile": "fab",
				"aria-label": openLabel,
				title: openLabel,
				onClick: () => toggleSidebar(),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
					viewBox: "0 0 16 16",
					width: "18",
					height: "18",
					fill: "none",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2 4h12M2 8h12M2 12h12",
						stroke: "currentColor",
						strokeWidth: "1.6",
						strokeLinecap: "round"
					})
				})
			})] });
		}
		//#endregion
		//#region src/client/workspace-browse/browse-client.ts
		/** Typed failure of the browse surface; `code` is the stable wire code. */
		var WorkspaceBrowseError = class extends Error {
			code;
			constructor(code) {
				super(code);
				this.code = code;
				this.name = "WorkspaceBrowseError";
			}
		};
		/** Extract the stable browse error code from a failed RpcResult. */
		function codeOf(result) {
			return result.error.message === "directory-unreadable" ? "directory-unreadable" : "internal";
		}
		function createWorkspaceBrowseClient(connection) {
			const call = connection.rpc.call.bind(connection.rpc);
			return { async listDirectory(path, signal) {
				const result = await call(WORKSPACE_BROWSE_CHANNEL, "list", path === void 0 ? {} : { path }, signal);
				if (result.ok) return result.value;
				throw new WorkspaceBrowseError(codeOf(result));
			} };
		}
		//#endregion
		//#region src/client/workspace-browse/MobileDirectoryFlow.tsx
		/**
		* R14 — mobile workspace directory picker (occupant of the two
		* directory-flow holes, phone only).
		*
		* A remote rendering of the computer's workspace picker:
		*   - opening starts at a virtual computer root (`listDirectory()` with no
		*     path), showing every discovered filesystem root / Windows drive;
		*   - breadcrumbs always start at localized "This computer", followed by
		*     the complete drive/filesystem ancestry;
		*   - the selection result is the current level, handed to the SAME owner
		*     adoption path as the desktop picker (`onPicked(path)` →
		*     `createWorkspace({ path })`);
		*   - listing rows are the same host data (bounded window, hidden flags,
		*     symlink enterability) — only the interaction is a minimal mobile
		*     rendition: browse into a directory, step back via crumbs, select the
		*     current directory. No file upload / delete / modify.
		*
		* Registered ONLY when the device classifier says phone (`isPhone`), so the
		* desktop picker (native or browse) is completely untouched.
		*/
		/** Stable id for the sheet title, referenced by `aria-labelledby`. */
		const TITLE_ID = "dsh-remote-workspace-picker-title";
		/** Full, clickable ancestry rooted at the virtual computer level. */
		function displayCrumbs(listing, computerLabel) {
			const computer = {
				name: computerLabel,
				path: void 0
			};
			if (listing.kind === "computer") return [computer];
			return [computer, ...listing.crumbs.map((crumb) => ({
				name: /^[A-Za-z]:[\\/]$/.test(crumb.name) ? crumb.name.slice(0, 2) : crumb.name,
				path: crumb.path
			}))];
		}
		/** Localized failure copy for a browse error. */
		function failureCopy(error, t) {
			if (error instanceof WorkspaceBrowseError) return error.code === "directory-unreadable" ? t("pickerUnreadable") : t("pickerInternal");
			return t("pickerInternal");
		}
		/**
		* Render the mobile workspace-directory picker as a bottom sheet. Renders
		* nothing while closed; every open starts fresh at the Host home directory.
		* @param props - owner conversation plus the injected browse face.
		* @returns the picker element, or null while closed.
		*/
		function MobileDirectoryFlow(props) {
			const { open, busy, onPicked, onCancel, listDirectory, t } = props;
			const [listing, setListing] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const controllerRef = (0, react.useRef)(null);
			const requestSeq = (0, react.useRef)(0);
			const contentRef = (0, react.useRef)(null);
			const restoreFocusRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => () => {
				requestSeq.current += 1;
				controllerRef.current?.abort();
			}, []);
			/** Navigate to one level (absent = the computer root); errors surface inline. */
			const navigate = (path) => {
				controllerRef.current?.abort();
				const controller = new AbortController();
				controllerRef.current = controller;
				const seq = ++requestSeq.current;
				setLoading(true);
				setError(null);
				listDirectory(path, controller.signal).then((next) => {
					if (seq !== requestSeq.current) return;
					setListing(next);
					setLoading(false);
				}, (reason) => {
					if (seq !== requestSeq.current) return;
					setLoading(false);
					setError(failureCopy(reason, t));
				});
			};
			(0, react.useEffect)(() => {
				requestSeq.current += 1;
				if (open) {
					setListing(null);
					setError(null);
					restoreFocusRef.current = document.activeElement;
					navigate(void 0);
					document.querySelector("[data-dsh-remote-workspace-picker] [data-wsb=\"close\"]")?.focus();
					return;
				}
				controllerRef.current?.abort();
				setLoading(false);
				setError(null);
				const restore = restoreFocusRef.current;
				restoreFocusRef.current = null;
				if (restore !== null && typeof restore.focus === "function") restore.focus();
			}, [
				open,
				listDirectory,
				t
			]);
			(0, react.useEffect)(() => {
				if (listing !== null && contentRef.current !== null) contentRef.current.scrollTop = 0;
			}, [listing]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape" && !busy) onCancel();
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [
				open,
				busy,
				onCancel
			]);
			if (!open) return null;
			const crumbs = listing === null ? [] : displayCrumbs(listing, t("pickerComputer"));
			const targetPath = listing?.path ?? null;
			const backPath = listing?.kind === "directory" ? listing.crumbs.length > 1 ? listing.crumbs.at(-2)?.path : void 0 : null;
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-dsh-remote-workspace-picker": true,
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": TITLE_ID,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-wsb": "sheet",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							"data-wsb": "header",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"data-wsb": "back",
									disabled: backPath === null || busy || loading,
									onClick: () => {
										if (backPath !== null) navigate(backPath);
									},
									children: ["‹ ", t("pickerBack")]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									"data-wsb": "title",
									id: TITLE_ID,
									children: t("pickerTitle")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-wsb": "close",
									"aria-label": t("pickerCancel"),
									disabled: busy,
									onClick: onCancel,
									children: "✕"
								})
							]
						}),
						listing !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
							"data-wsb": "crumbs",
							role: "navigation",
							"aria-label": t("pickerTitle"),
							children: crumbs.map((crumb, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								"data-wsb": "crumb-seat",
								children: [index > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"data-wsb": "crumb-sep",
									children: "›"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-wsb": "crumb",
									disabled: busy || loading,
									onClick: () => {
										navigate(crumb.path);
									},
									children: crumb.name
								})]
							}, crumb.path))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							"data-wsb": "content",
							ref: contentRef,
							children: [
								listing === null && loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									"data-wsb": "loading",
									role: "status",
									children: t("pickerLoading")
								}),
								listing !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									"data-wsb": "list",
									role: "list",
									children: listing.entries.filter((entry) => !entry.hidden).map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
										role: "listitem",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											"data-wsb": "row",
											disabled: busy || loading,
											onClick: () => {
												navigate(entry.path);
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													"data-wsb": "row-icon",
													"aria-hidden": "true",
													children: listing.kind === "computer" ? "💾" : "📁"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													"data-wsb": "row-name",
													children: entry.name
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													"data-wsb": "row-chevron",
													children: "›"
												})
											]
										})
									}, entry.path))
								}),
								listing !== null && listing.truncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									"data-wsb": "truncated",
									role: "status",
									children: t("pickerTruncated")
								}),
								error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-wsb": "error",
									role: "alert",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: error }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										"data-wsb": "retry",
										onClick: () => {
											navigate(listing?.path ?? void 0);
										},
										children: t("pickerRetry")
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
							"data-wsb": "footer",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-wsb": "cancel",
								disabled: busy,
								onClick: onCancel,
								children: t("pickerCancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-wsb": "select",
								disabled: targetPath === null || busy || loading,
								onClick: () => {
									if (targetPath !== null) onPicked(targetPath);
								},
								children: t("pickerSelectCurrent")
							})]
						})
					]
				})
			}), document.body);
		}
		//#endregion
		//#region src/client/index.ts
		/** Stable plugin id (package name) — used for the style-tag ownership mark. */
		const PLUGIN_ID = "dsh-remote-web-gateway";
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"layout"
		];
		/**
		* Mount every browser surface.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-remote-web-gateway: dictionaries");
			const detection = getPhoneDetection();
			const pickerDevice = detection.isPhone || detection.isTablet;
			ctx.effect(() => detection.isPhone ? installMobileCss(PLUGIN_ID) : () => {}, "dsh-remote-web-gateway: mobile styles");
			ctx.effect(() => detection.isPhone ? installPhoneChrome() : () => {}, "dsh-remote-web-gateway: phone chrome");
			ctx.effect(() => pickerDevice ? installPickerCss(PLUGIN_ID) : () => {}, "dsh-remote-web-gateway: picker styles");
			ctx.effect(() => installSettingsNavIcon(), "dsh-remote-web-gateway: settings-nav icon");
			const remote = createRemoteClient(ctx.get("connection"));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-remote-mobile-overlay",
				order: 30,
				locale: NS,
				inject: () => ({ toggleSidebar: () => {
					ctx.layout.toggleSidebar();
				} })
			}, MobileOverlay));
			if (pickerDevice) ctx.slots.inject("conversation.hero.workspace.directoryFlow", () => ctx.slots.inject("sidebar.workspaces.directoryFlow", function* () {
				const browse = createWorkspaceBrowseClient(ctx.get("connection"));
				const injected = () => ({
					listDirectory: (path, signal) => browse.listDirectory(path, signal),
					t: ctx.locale.bind(NS)
				});
				yield ctx.slots.register({
					name: "conversation.hero.workspace.directoryFlow",
					priority: -10,
					inject: injected
				}, MobileDirectoryFlow);
				yield ctx.slots.register({
					name: "sidebar.workspaces.directoryFlow",
					priority: -10,
					inject: injected
				}, MobileDirectoryFlow);
			}));
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "remote-access",
				order: 1,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({ api: remote })
			}, RemoteAccessSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

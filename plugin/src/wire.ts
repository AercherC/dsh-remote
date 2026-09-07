/**
 * Wire types shared by the host RPC surface and the browser client.
 * This module is PURE (no node imports) so the client bundle can import it
 * freely; every host-side value here is type-only or a static table.
 */

import type {
  BinarySource,
  DownloadSourceKind,
  ProxySource,
  QuickTunnelEdgeEvent,
  QuickTunnelEdgeState,
  QuickTunnelPhase,
  TunnelErrorCode,
} from '../vendor/dsh-remote-web-gateway/dist/quick-tunnel.js'
import type { DeviceSummary } from '../vendor/dsh-remote-web-gateway/dist/device-session.js'

export type { QuickTunnelEdgeEvent, QuickTunnelEdgeState, TunnelErrorCode }

/** Plugin-level error codes the client maps to user copy. */
export type RemoteErrorCode =
  | TunnelErrorCode
  | 'startup-failed'
  | 'tunnel-not-ready'
  | 'persist-failed'
  | 'bad-request'
  | 'update-unavailable'
  | 'update-failed'
  | 'update-version-mismatch'
  | 'update-in-progress'
  | 'cli-not-found'

export type DeviceSummaryView = DeviceSummary

export interface RemoteStatusView {
  /** Whether the runtime started cleanly (state loaded, gateway bound). */
  readonly available: boolean
  /** Whether a validated tunnel URL is live right now. */
  readonly enabled: boolean
  readonly phase: QuickTunnelPhase | 'error'
  readonly publicUrl?: string
  readonly binarySource?: BinarySource
  readonly errorCode?: RemoteErrorCode
  readonly startedAt?: number
  /** E1-A: live edge-link health of a ready tunnel (diagnostics + UI copy). */
  readonly edgeState?: QuickTunnelEdgeState
  /** When edgeState is 'degraded': epoch ms when the current loss was detected. */
  readonly edgeDegradedSinceMs?: number
  /** Bounded recent edge events of the current run (chronological). Diagnostics only. */
  readonly edgeEvents?: readonly QuickTunnelEdgeEvent[]
  /** Installed plugin version (read from the installed package.json). */
  readonly pluginVersion?: string
  readonly devices: readonly DeviceSummaryView[]
  /** Download progress while phase === 'downloading' (absent otherwise). */
  readonly downloadReceivedBytes?: number
  readonly downloadTotalBytes?: number
  readonly downloadPercent?: number
  readonly downloadElapsedMs?: number
  readonly downloadSpeedBytesPerSecond?: number
  /** Network route of the CURRENT download attempt (absent otherwise). */
  readonly downloadProxySource?: ProxySource
  /** Redacted host:port of the proxy in use — never credentials. */
  readonly downloadProxyDisplay?: string
  /** Whether the CURRENT attempt fetches the official source or a mirror. */
  readonly downloadSource?: DownloadSourceKind
  /** True while the AUTO slow-source gate switches official → mirror. */
  readonly downloadSourceChanging?: boolean
}

/** UI-owned download network/source settings (R06C4). */
export interface DownloadSettingsView {
  readonly network: 'auto' | 'direct' | 'custom'
  readonly source: 'auto' | 'official' | 'mirror'
  /** Custom proxy URL (http/https, NO credentials — rejected at input). */
  readonly customProxyUrl?: string
}

export interface PairingIssueView {
  readonly secret: string
  readonly code: string
  readonly expiresAt: number
}

/**
 * D2 durable long-term pairing code.
 *
 * `PairingLongIssueView` is what the explicit "生成长配对码 / 换一组新码 /
 * 设置自定义码" mutation returns: the fresh plaintext, for display.
 *
 * `PairingLongStatusView` is the READ-ONLY status of the durable long code:
 *   - `none`      no long code was ever generated (default — never auto-minted)
 *   - `active`    a long code exists and its plaintext is available (persisted
 *                 version-2 file, D2.1), so the UI may display the code/QR
 *   - `persisted` legacy only: a version-1 digest file was loaded — the code
 *                 still authenticates but the plaintext is gone and cannot be
 *                 shown; the next rotate / custom-code write upgrades to v2
 */
export interface PairingLongIssueView {
  readonly secret: string
  readonly code: string
  readonly createdAt: number
}

export type PairingLongStatusView =
  | { readonly state: 'none' }
  | { readonly state: 'active'; readonly createdAt: number; readonly secret: string; readonly code: string }
  | { readonly state: 'persisted'; readonly createdAt: number }

/**
 * D2.1 custom long-code bounds, mirrored from the root pairing-long module so
 * the client can pre-validate before calling the mutation RPC (the host still
 * re-validates authoritatively). `wire.test` asserts these stay in sync with
 * the vendored root constants.
 */
export const PAIRING_LONG_CODE_MIN = 6
export const PAIRING_LONG_CODE_MAX = 12
export const PAIRING_LONG_CODE_ALPHABET_SOURCE = 'A-Z0-9'

/** Client-side shape check for a custom long code (6–12 chars, A–Z + 0–9). */
export function isPairingLongCodeShape(value: string): boolean {
  const code = value.trim().toUpperCase()
  if (code.length < PAIRING_LONG_CODE_MIN || code.length > PAIRING_LONG_CODE_MAX) return false
  return /^[A-Z0-9]+$/.test(code)
}

/**
 * Host-authoritative pairing ticket state (R06C4B) — returned ONLY by the
 * READ-ONLY `pairingStatus` RPC. Reading it never creates a ticket.
 *
 * The secret and manual code exist in exactly one branch: `active`. The
 * `consumed` / `expired` branches carry only non-sensitive metadata (ticket
 * id + a timestamp) and MUST never expose the old credential pair.
 */
export type PairingStatusView =
  | { readonly state: 'none' }
  | { readonly state: 'active'; readonly id: string; readonly secret: string; readonly code: string; readonly expiresAt: number }
  | { readonly state: 'consumed'; readonly id: string; readonly consumedAt: number }
  | { readonly state: 'expired'; readonly id: string; readonly expiresAt: number }

export type CommandResult =
  | { readonly ok: true; readonly url?: string }
  | { readonly ok: false; readonly errorCode: RemoteErrorCode }

export type DeviceRevokeResult =
  | { readonly ok: true; readonly revoked: boolean }
  | { readonly ok: false; readonly errorCode: RemoteErrorCode }

export type DeviceRevokeAllResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errorCode: RemoteErrorCode }

/** Mirrors the updater's UpdateStatusView (kept in sync by tests). */
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'applying'
  | 'installed-restart-required'
  | 'failed'
  | 'unavailable'

export interface UpdateStatusView {
  readonly currentVersion: string
  readonly phase: UpdatePhase
  readonly latestVersion?: string
  /** Plain-text release notes (already sanitized host-side). */
  readonly notes?: string
  readonly notesUnavailable?: boolean
  readonly lastCheckedAt?: number
  readonly lastSeenVersion?: string
  readonly error?: string
}

/**
 * The QR payload for one pairing ticket: `https://<origin>/pair#<secret>`.
 *
 * The secret travels ONLY in the URL fragment — never in the query string,
 * the HTML source, logs, or localStorage. The fragment is stripped from the
 * address bar by the /pair page before it posts the claim.
 */
export function pairingQrContent(publicUrl: string, secret: string): string {
  return `${publicUrl}/pair#${secret}`
}

/** Every stable error code the plugin can emit (host + client use this set). */
export const REMOTE_ERROR_CODE_SET: ReadonlySet<string> = new Set([
  'unsupported-platform', 'config-conflict', 'download-failed', 'proxy-invalid', 'proxy-connect-failed',
  'source-too-slow',
  'checksum-mismatch', 'size-mismatch',
  'binary-rejected', 'version-mismatch', 'start-timeout', 'spawn-failed', 'exit-before-ready',
  'connection-lost', 'internal', 'startup-failed', 'tunnel-not-ready', 'persist-failed', 'bad-request',
  'update-unavailable', 'update-failed', 'update-version-mismatch', 'update-in-progress', 'cli-not-found',
])

/** User copy for every error code (zh + en). NEVER an empty string. */
export const REMOTE_ERROR_MESSAGES: Readonly<Record<RemoteErrorCode, { zh: string; en: string }>> = {
  'unsupported-platform': { zh: '当前平台暂未支持 Cloudflare Tunnel 组件', en: 'Cloudflare Tunnel is not supported on this platform yet' },
  'config-conflict': {
    zh: '检测到现有 Cloudflare 配置。为避免修改你的配置，本次未启动远程访问。',
    en: 'An existing Cloudflare configuration was detected. Remote access was not started to avoid modifying your configuration.',
  },
  'download-failed': {
    zh: '无法下载 Cloudflare Tunnel。已尝试当前可用的网络路径，请检查网络或下载网络设置后重试。',
    en: 'Could not download Cloudflare Tunnel. The available network paths were tried; check the network or the download network setting and try again.',
  },
  'proxy-invalid': { zh: '代理配置无效，请检查下载网络设置。', en: 'The proxy configuration is invalid; check the download network setting.' },
  'proxy-connect-failed': {
    zh: '无法通过代理下载 Cloudflare Tunnel。请检查代理地址或网络后重试。',
    en: 'Could not download Cloudflare Tunnel through the proxy. Check the proxy address or the network and try again.',
  },
  // Internal fallback REASON, not a final user error (the route loop converts
  // an exhausted all-too-slow run into download-failed); the copy is a safe
  // defense if it ever reaches the surface.
  'source-too-slow': {
    zh: '下载源速度过慢，已尝试切换备用下载镜像。',
    en: 'The download source was too slow; a backup mirror was tried instead.',
  },
  'checksum-mismatch': { zh: 'Cloudflare Tunnel 组件下载校验失败，已停止启动。', en: 'The downloaded Cloudflare Tunnel component failed verification; startup was stopped.' },
  'size-mismatch': { zh: 'Cloudflare Tunnel 组件下载校验失败，已停止启动。', en: 'The downloaded Cloudflare Tunnel component failed verification; startup was stopped.' },
  'binary-rejected': { zh: 'Cloudflare Tunnel 组件校验失败，已停止启动。', en: 'The Cloudflare Tunnel component failed verification; startup was stopped.' },
  'version-mismatch': { zh: 'Cloudflare Tunnel 组件版本校验失败，已停止启动。', en: 'The Cloudflare Tunnel component version failed verification; startup was stopped.' },
  'start-timeout': { zh: 'Cloudflare Tunnel 在规定时间内未就绪，请检查网络后重试。', en: 'Cloudflare Tunnel did not become ready in time; check the network and try again.' },
  'spawn-failed': { zh: 'Cloudflare Tunnel 组件启动失败，请重试。', en: 'Failed to start the Cloudflare Tunnel component; try again.' },
  'exit-before-ready': { zh: 'Cloudflare Tunnel 连接建立失败，请重试。', en: 'The Cloudflare Tunnel connection failed to establish; try again.' },
  'connection-lost': { zh: '远程连接已断开。', en: 'The remote connection was lost.' },
  'internal': { zh: '发生未预期的内部错误。请查看诊断信息后重试。', en: 'An unexpected internal error occurred. Check the diagnostics and try again.' },
  'startup-failed': { zh: '远程访问组件启动失败，请查看本地日志', en: 'The remote-access component failed to start; see local logs' },
  'tunnel-not-ready': { zh: '请先开启远程控制', en: 'Enable remote control first' },
  'persist-failed': { zh: '操作失败，请重试', en: 'The operation failed; try again' },
  'bad-request': { zh: '请求无效', en: 'Invalid request' },
  'update-unavailable': { zh: '暂时无法检查更新，请稍后再试', en: 'Update check is unavailable right now; try again later' },
  'update-failed': { zh: '更新失败，当前版本继续运行，请重试', en: 'Update failed — the current version keeps running; try again' },
  'update-version-mismatch': { zh: '更新后版本校验失败，当前版本继续运行', en: 'Version verification failed after the update; the current version keeps running' },
  'update-in-progress': { zh: '正在更新中，请稍候', en: 'An update is already in progress' },
  'cli-not-found': { zh: '未找到 DSH 命令行工具，无法更新', en: 'The DSH CLI was not found; cannot update' },
}

/* ---------- R14: mobile workspace directory browse ---------- */

/**
 * Logical connection-RPC channel for the mobile workspace directory browse.
 * Deliberately NOT under the `/dsh-remote` prefix: the gateway denies public
 * requests by `path.startsWith('/dsh-remote')` (defense in depth for the
 * management plane), and this channel must stay reachable from paired phones
 * through the gateway — still behind the device-session / pairing
 * authentication the gateway applies to every public request.
 */
export const WORKSPACE_BROWSE_CHANNEL = '/dsh-workspace-browse'

/** Closed error codes of the workspace browse surface (mirrored as the RpcError message). */
export type WorkspaceBrowseErrorCode = 'directory-unreadable' | 'internal'

/** One directory row: a listing child or a breadcrumb ancestor. */
export interface DirectoryEntryView {
  /** Base name shown in a browser row (a root crumb carries its full path). */
  readonly name: string
  /** Absolute host path — clients never join path segments themselves. */
  readonly path: string
  /** Hidden by the host platform's convention (dot-prefixed on POSIX); the client owns whether to show it. */
  readonly hidden: boolean
}

/** One directory level plus its ancestry, as the browse surface reports it. */
export interface DirectoryListingView {
  /** `computer` is the virtual filesystem root; `directory` is one real level. */
  readonly kind: 'computer' | 'directory'
  /** Absolute path of a real directory; null at the virtual computer root. */
  readonly path: string | null
  /** The host account's home directory (host fact retained for compatibility). */
  readonly home: string
  /** Ancestor chain from the drive/filesystem root to a real directory; empty at the virtual computer root. */
  readonly crumbs: readonly DirectoryEntryView[]
  /** Computer roots or direct child directories, name-sorted. */
  readonly entries: readonly DirectoryEntryView[]
  /** True when the level was cut at the complete-result bound (more children exist). */
  readonly truncated: boolean
}

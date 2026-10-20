/**
 * Wire types shared by the host RPC surface and the browser client.
 * This module is PURE (no node imports) so the client bundle can import it
 * freely; every host-side value here is type-only or a static table.
 */
import type { BinarySource, DownloadSourceKind, ProxySource, QuickTunnelEdgeEvent, QuickTunnelEdgeState, QuickTunnelPhase, TunnelErrorCode } from '../vendor/dsh-remote-web-gateway/dist/quick-tunnel.js';
import type { DeviceSummary } from '../vendor/dsh-remote-web-gateway/dist/device-session.js';
export type { QuickTunnelEdgeEvent, QuickTunnelEdgeState, TunnelErrorCode };
/** Plugin-level error codes the client maps to user copy. */
export type RemoteErrorCode = TunnelErrorCode | 'startup-failed' | 'tunnel-not-ready' | 'persist-failed' | 'bad-request' | 'update-unavailable' | 'update-failed' | 'update-version-mismatch' | 'update-in-progress' | 'cli-not-found';
export type DeviceSummaryView = DeviceSummary;
export interface RemoteStatusView {
    /** Whether the runtime started cleanly (state loaded, gateway bound). */
    readonly available: boolean;
    /** Whether a validated tunnel URL is live right now. */
    readonly enabled: boolean;
    readonly phase: QuickTunnelPhase | 'error';
    readonly publicUrl?: string;
    readonly binarySource?: BinarySource;
    readonly errorCode?: RemoteErrorCode;
    readonly startedAt?: number;
    /** E1-A: live edge-link health of a ready tunnel (diagnostics + UI copy). */
    readonly edgeState?: QuickTunnelEdgeState;
    /** When edgeState is 'degraded': epoch ms when the current loss was detected. */
    readonly edgeDegradedSinceMs?: number;
    /** Bounded recent edge events of the current run (chronological). Diagnostics only. */
    readonly edgeEvents?: readonly QuickTunnelEdgeEvent[];
    /** Installed plugin version (read from the installed package.json). */
    readonly pluginVersion?: string;
    readonly devices: readonly DeviceSummaryView[];
    /** Download progress while phase === 'downloading' (absent otherwise). */
    readonly downloadReceivedBytes?: number;
    readonly downloadTotalBytes?: number;
    readonly downloadPercent?: number;
    readonly downloadElapsedMs?: number;
    readonly downloadSpeedBytesPerSecond?: number;
    /** Network route of the CURRENT download attempt (absent otherwise). */
    readonly downloadProxySource?: ProxySource;
    /** Redacted host:port of the proxy in use — never credentials. */
    readonly downloadProxyDisplay?: string;
    /** Whether the CURRENT attempt fetches the official source or a mirror. */
    readonly downloadSource?: DownloadSourceKind;
    /** True while the AUTO slow-source gate switches official → mirror. */
    readonly downloadSourceChanging?: boolean;
}
/** UI-owned download network/source settings (R06C4). */
export interface DownloadSettingsView {
    readonly network: 'auto' | 'direct' | 'custom';
    readonly source: 'auto' | 'official' | 'mirror';
    /** Custom proxy URL (http/https, NO credentials — rejected at input). */
    readonly customProxyUrl?: string;
}
export interface PairingIssueView {
    readonly secret: string;
    readonly code: string;
    readonly expiresAt: number;
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
    readonly secret: string;
    readonly code: string;
    readonly createdAt: number;
}
export type PairingLongStatusView = {
    readonly state: 'none';
} | {
    readonly state: 'active';
    readonly createdAt: number;
    readonly secret: string;
    readonly code: string;
} | {
    readonly state: 'persisted';
    readonly createdAt: number;
};
/**
 * D2.1 custom long-code bounds, mirrored from the root pairing-long module so
 * the client can pre-validate before calling the mutation RPC (the host still
 * re-validates authoritatively). `wire.test` asserts these stay in sync with
 * the vendored root constants.
 */
export declare const PAIRING_LONG_CODE_MIN = 6;
export declare const PAIRING_LONG_CODE_MAX = 12;
export declare const PAIRING_LONG_CODE_ALPHABET_SOURCE = "A-Z0-9";
/** Client-side shape check for a custom long code (6–12 chars, A–Z + 0–9). */
export declare function isPairingLongCodeShape(value: string): boolean;
/**
 * Host-authoritative pairing ticket state (R06C4B) — returned ONLY by the
 * READ-ONLY `pairingStatus` RPC. Reading it never creates a ticket.
 *
 * The secret and manual code exist in exactly one branch: `active`. The
 * `consumed` / `expired` branches carry only non-sensitive metadata (ticket
 * id + a timestamp) and MUST never expose the old credential pair.
 */
export type PairingStatusView = {
    readonly state: 'none';
} | {
    readonly state: 'active';
    readonly id: string;
    readonly secret: string;
    readonly code: string;
    readonly expiresAt: number;
} | {
    readonly state: 'consumed';
    readonly id: string;
    readonly consumedAt: number;
} | {
    readonly state: 'expired';
    readonly id: string;
    readonly expiresAt: number;
};
export type CommandResult = {
    readonly ok: true;
    readonly url?: string;
} | {
    readonly ok: false;
    readonly errorCode: RemoteErrorCode;
};
export type DeviceRevokeResult = {
    readonly ok: true;
    readonly revoked: boolean;
} | {
    readonly ok: false;
    readonly errorCode: RemoteErrorCode;
};
export type DeviceRevokeAllResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly errorCode: RemoteErrorCode;
};
/** Mirrors the updater's UpdateStatusView (kept in sync by tests). */
export type UpdatePhase = 'idle' | 'checking' | 'up-to-date' | 'available' | 'applying' | 'installed-restart-required' | 'failed' | 'unavailable';
export interface UpdateStatusView {
    readonly currentVersion: string;
    readonly phase: UpdatePhase;
    readonly latestVersion?: string;
    /** Plain-text release notes (already sanitized host-side). */
    readonly notes?: string;
    readonly notesUnavailable?: boolean;
    readonly lastCheckedAt?: number;
    readonly lastSeenVersion?: string;
    readonly error?: string;
}
/**
 * The QR payload for one pairing ticket: `https://<origin>/pair#<secret>`.
 *
 * The secret travels ONLY in the URL fragment — never in the query string,
 * the HTML source, logs, or localStorage. The fragment is stripped from the
 * address bar by the /pair page before it posts the claim.
 */
export declare function pairingQrContent(publicUrl: string, secret: string): string;
/** Every stable error code the plugin can emit (host + client use this set). */
export declare const REMOTE_ERROR_CODE_SET: ReadonlySet<string>;
/** User copy for every error code (zh + en). NEVER an empty string. */
export declare const REMOTE_ERROR_MESSAGES: Readonly<Record<RemoteErrorCode, {
    zh: string;
    en: string;
}>>;
/**
 * Logical connection-RPC channel for the mobile workspace directory browse.
 * Deliberately NOT under the `/dsh-remote` prefix: the gateway denies public
 * requests by `path.startsWith('/dsh-remote')` (defense in depth for the
 * management plane), and this channel must stay reachable from paired phones
 * through the gateway — still behind the device-session / pairing
 * authentication the gateway applies to every public request.
 */
export declare const WORKSPACE_BROWSE_CHANNEL = "/dsh-workspace-browse";
/** Closed error codes of the workspace browse surface (mirrored as the RpcError message). */
export type WorkspaceBrowseErrorCode = 'directory-unreadable' | 'internal';
/** One directory row: a listing child or a breadcrumb ancestor. */
export interface DirectoryEntryView {
    /** Base name shown in a browser row (a root crumb carries its full path). */
    readonly name: string;
    /** Absolute host path — clients never join path segments themselves. */
    readonly path: string;
    /** Hidden by the host platform's convention (dot-prefixed on POSIX); the client owns whether to show it. */
    readonly hidden: boolean;
}
/** One directory level plus its ancestry, as the browse surface reports it. */
export interface DirectoryListingView {
    /** `computer` is the virtual filesystem root; `directory` is one real level. */
    readonly kind: 'computer' | 'directory';
    /** Absolute path of a real directory; null at the virtual computer root. */
    readonly path: string | null;
    /** The host account's home directory (host fact retained for compatibility). */
    readonly home: string;
    /** Ancestor chain from the drive/filesystem root to a real directory; empty at the virtual computer root. */
    readonly crumbs: readonly DirectoryEntryView[];
    /** Computer roots or direct child directories, name-sorted. */
    readonly entries: readonly DirectoryEntryView[];
    /** True when the level was cut at the complete-result bound (more children exist). */
    readonly truncated: boolean;
}

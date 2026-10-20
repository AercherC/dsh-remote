import { type CloudflaredAsset } from './cloudflared-assets.js';
import { type DownloadSource, type DownloadSourceKind } from './download-sources.js';
import { type DownloadSourceMode, type NetworkConfig, type ProxyCandidate, type ProxySource, type SystemProxyRead } from './proxy-resolver.js';
export type { DownloadSourceKind } from './download-sources.js';
export type { ProxySource } from './proxy-resolver.js';
/**
 * Cloudflare Quick Tunnel transport (R03, hardened R04).
 *
 * Responsibilities are deliberately limited to transport:
 *   - cloudflared binary discovery (PATH → managed cache → on-demand
 *     download), with the SOURCE recorded for the status surface. A PATH
 *     candidate is never executed just because a file with that name exists:
 *     it must pass an explicit trust check first (Windows: Authenticode
 *     Valid + Cloudflare signer + a sane `--version`; POSIX: a sane
 *     `--version`). An untrusted PATH candidate is IGNORED and the managed
 *     pinned binary is used instead. Full filesystem paths are never
 *     exposed on the status surface.
 *   - a reproducible supply chain: pinned version + pinned official SHA-256,
 *     verified on EVERY start for any managed binary (cache or fresh
 *     download), plus a `--version` run against the pinned version and (when
 *     present) an Authenticode check — the hash/version chain is the gate
 *   - a non-destructive preflight for an existing user Cloudflare config that
 *     could affect Quick Tunnel behavior (nothing is renamed, deleted, or
 *     edited)
 *   - spawn `cloudflared tunnel --url http://127.0.0.1:<gatewayPort>`
 *     with `--protocol http2 --no-autoupdate`
 *   - strict `https://*.trycloudflare.com` URL discovery from the process
 *     output (never trusts arbitrary log text)
 *   - TWO-PHASE readiness (R06C4D): the URL banner only means the hostname
 *     was allocated — the Cloudflare Edge may still be registering the
 *     connector, so a first request in that window returns Cloudflare Error
 *     1033. phase becomes `connecting` at hostname-acquired and only
 *     `ready` after cloudflared's own "Registered tunnel connection" log
 *     line (verified against the pinned 2026.8.2 binary). The caller's
 *     onReady + the initial pairing ticket therefore fire only at real
 *     readiness.
 *   - single-flight start / idempotent stop / crash handling
 *   - E1-A post-ready edge-link watch: the process output keeps being observed
 *     after READY and transient edge losses (`Lost connection with the edge`
 *     etc.) are recorded as diagnostics (`edgeState`/`edgeDegradedSinceMs`/
 *     `edgeEvents`) — never as a fail-closed — because cloudflared reconnects
 *     in-process to the SAME URL; only a process exit or an explicit stop
 *     clears the public origin (fail-closed semantics unchanged).
 *
 * The tunnel target is ALWAYS the loopback Gateway, never DSH directly, so
 * pairing/device-session authentication cannot be bypassed. The service
 * never sees pairing secrets, device tokens, or cookies — transport and auth
 * stay separate. It also binds nothing: cloudflared connects outbound only.
 *
 * Lifecycle safety: an unexpected cloudflared exit clears the public origin
 * immediately (onClosed → gateway CLOSED); a normal stop clears it BEFORE
 * killing the process. No stale public origin may survive a dead tunnel.
 *
 * Status hygiene: `status()` exposes only the phase, the validated public
 * URL, a stable error CODE, the binary source, and a start timestamp. Full
 * filesystem paths and raw process output never leave this service.
 */
export type QuickTunnelPhase = 'idle' | 'resolving' | 'verifying' | 'downloading' | 'starting' | 'connecting' | 'ready' | 'stopping' | 'error';
/**
 * E1-A: post-ready edge-link health of a READY tunnel. `degraded` means the
 * cloudflared process logged a transient loss of its edge connection; it is a
 * DIAGNOSTIC state only — the origin stays open while the process is alive,
 * because the process reconnects in-process to the SAME URL (measured on the
 * pinned 2026.8.2 binary: `Lost connection with the edge` → `Retrying
 * connection` → `Registered tunnel connection` with an unchanged hostname).
 */
export type QuickTunnelEdgeState = 'ok' | 'degraded';
/** One edge-link transition recorded after READY (diagnostics, never fail-closed). */
export interface QuickTunnelEdgeEvent {
    readonly kind: 'degraded' | 'regained';
    /** Epoch ms from the injected now() when the transition was recorded. */
    readonly at: number;
    /** Only on `regained`: how long the degraded window lasted. */
    readonly degradedMs?: number;
}
/** Stable machine-readable failure codes; the UI maps them to user copy. */
export type TunnelErrorCode = 'unsupported-platform' | 'config-conflict' | 'download-failed' | 'proxy-invalid' | 'proxy-connect-failed' | 'source-too-slow' | 'checksum-mismatch' | 'size-mismatch' | 'binary-rejected' | 'version-mismatch' | 'start-timeout' | 'spawn-failed' | 'exit-before-ready' | 'connection-lost' | 'internal';
/** Where the cloudflared executable came from; full paths are never exposed. */
export type BinarySource = 'PATH' | 'managed-cache' | 'downloaded';
/**
 * Live progress of an in-flight cloudflared binary download. `totalBytes` is
 * only present when the response advertises Content-Length; `percent` is only
 * derived from a known total — the UI must never fake a percentage. The
 * route used for the CURRENT attempt is reported as `proxySource` /
 * `proxyDisplay` (redacted host:port, never credentials) and the SOURCE is
 * reported as `downloadSource` (官方源 / 备用镜像) so the UI never pretends a
 * mirror is the official source.
 */
export interface DownloadProgress {
    readonly receivedBytes: number;
    readonly totalBytes?: number;
    readonly percent?: number;
    readonly elapsedMs: number;
    readonly speedBytesPerSecond?: number;
    readonly proxySource?: ProxySource;
    readonly proxyDisplay?: string;
    readonly downloadSource?: DownloadSourceKind;
    /**
     * True while the AUTO slow-source gate is abandoning the current source and
     * the next verified mirror is about to be attempted (the UI shows the
     * switching copy; bytes shown are stale/zero during this gap).
     */
    readonly sourceChanging?: boolean;
}
export interface QuickTunnelStatus {
    readonly phase: QuickTunnelPhase;
    readonly publicUrl?: string;
    readonly lastErrorCode?: TunnelErrorCode;
    readonly binarySource?: BinarySource;
    readonly startedAt?: number;
    /** E1-A link health while phase === 'ready' (absent otherwise). */
    readonly edgeState?: QuickTunnelEdgeState;
    /** When edgeState is 'degraded': epoch ms when the current loss was detected. */
    readonly edgeDegradedSinceMs?: number;
    /** Bounded recent edge events of the current run (chronological). Diagnostics only. */
    readonly edgeEvents?: readonly QuickTunnelEdgeEvent[];
    /** Download progress while phase === 'downloading' (undefined otherwise). */
    readonly downloadReceivedBytes?: number;
    readonly downloadTotalBytes?: number;
    readonly downloadPercent?: number;
    readonly downloadElapsedMs?: number;
    readonly downloadSpeedBytesPerSecond?: number;
    readonly downloadProxySource?: ProxySource;
    readonly downloadProxyDisplay?: string;
    readonly downloadSource?: DownloadSourceKind;
    readonly downloadSourceChanging?: boolean;
}
/** Minimal process handle; real ChildProcess satisfies it structurally. */
export interface ProcessLike {
    stdout?: {
        on(event: 'data', callback: (chunk: string | Buffer) => void): unknown;
        off(event: 'data', callback: (chunk: string | Buffer) => void): unknown;
    };
    stderr?: {
        on(event: 'data', callback: (chunk: string | Buffer) => void): unknown;
        off(event: 'data', callback: (chunk: string | Buffer) => void): unknown;
    };
    on(event: 'exit', callback: (code: number | null, signal: string | null) => void): unknown;
    on(event: 'error', callback: (error: Error) => void): unknown;
    once(event: 'exit', callback: (code: number | null, signal: string | null) => void): unknown;
    once(event: 'error', callback: (error: Error) => void): unknown;
    once(event: 'close', callback: () => void): unknown;
    kill(signal?: string): boolean;
    readonly killed?: boolean;
}
export interface QuickTunnelOptions {
    /** Absolute directory for the cached binary. Injected; never hard-coded. */
    readonly cacheDir: string;
    /** The loopback gateway port the tunnel forwards to (127.0.0.1:<port>). */
    readonly gatewayPort: number;
    readonly startTimeoutMs?: number;
    /**
     * R06C4D: how long the tunnel may sit in `connecting` (hostname acquired
     * but the Cloudflare Edge has not yet confirmed the connector route)
     * before the start attempt fails closed. Default 60s: on a healthy network
     * the registration follows the hostname within seconds; the observed worst
     * case on a flaky-DNS box was ~23s (see R06C4D report), so 60s gives
     * headroom while staying finite. Only startup, never a background poll.
     */
    readonly readyTimeoutMs?: number;
    /** Test injection points. */
    readonly spawn?: (bin: string, args: string[]) => ProcessLike;
    readonly verifyBinary?: (binaryPath: string) => Promise<void>;
    readonly downloadBinary?: (cacheDir: string, dest: string, onProgress?: (progress: DownloadProgress) => void) => Promise<void>;
    readonly configPreflight?: () => Promise<void>;
    /** Test injection: resolve the PATH candidate (default: where/which). */
    readonly pathProbe?: () => Promise<string | undefined>;
    /** Test injection: trust-check a PATH candidate (default: signature+version). */
    readonly verifyPathCandidate?: (binaryPath: string) => Promise<boolean>;
    readonly now?: () => number;
    /** Transport events wired to the public-origin controller by the caller. */
    readonly onReady?: (url: URL) => void;
    readonly onClosed?: () => void;
    /**
     * R06C4: download network (AUTO/DIRECT/CUSTOM) and source (AUTO/OFFICIAL/
     * MIRROR) selection. A static snapshot is fine; a dynamic resolver lets the
     * caller re-read a persisted UI setting for EVERY download.
     */
    readonly network?: NetworkConfig;
    readonly source?: DownloadSourceMode;
    readonly resolveNetwork?: () => Promise<{
        network: NetworkConfig;
        source: DownloadSourceMode;
    }>;
    /** Local-log diagnostics from the downloader (never user-facing). */
    readonly onDiagnostic?: (diagnostic: string) => void;
}
export interface QuickTunnelService {
    /** Single-flight; resolves with the validated tunnel URL. */
    start(): Promise<URL>;
    /** Idempotent; clears the public origin BEFORE terminating the process. */
    stop(): Promise<void>;
    status(): QuickTunnelStatus;
}
/** Error carrying a stable machine code; the start() catch records it. */
export declare class TunnelStartError extends Error {
    readonly code: TunnelErrorCode;
    /** Optional transport facts (e.g. receivedBytes at failure) for route switching. */
    readonly details: {
        readonly receivedBytes?: number;
    } | undefined;
    constructor(code: TunnelErrorCode, message: string, details?: {
        readonly receivedBytes?: number;
    });
}
export declare const QUICK_TUNNEL_URL_RE: RegExp;
/**
 * Strictly validate a discovered URL. Only plain `https://*.trycloudflare.com`
 * origins pass: no userinfo, no path, no query, no hash, default HTTPS port.
 * A candidate immediately followed by `: / ? #` means the log line carried a
 * port/path/query/hash — that candidate is rejected rather than truncated.
 */
export declare function parseTunnelUrl(text: string): URL | undefined;
export declare function hasTunnelReadySignal(text: string): boolean;
export declare function classifyEdgeLogSignal(text: string): 'lost' | 'regained' | undefined;
/** Standard locations where a user Cloudflare config could affect a Quick Tunnel. */
export declare function cloudflaredConfigCandidates(): string[];
/**
 * Default preflight: refuse to start a Quick Tunnel while a user Cloudflare
 * config exists that could affect it. NON-DESTRUCTIVE by design — nothing is
 * renamed, deleted, or edited; the user gets a clear status error instead.
 */
export declare function defaultCloudflaredConfigPreflight(): Promise<void>;
/**
 * Whether `cloudflared --version` output looks like a real cloudflared
 * version line (pure; unit-tested). Used by the PATH trust gate.
 */
export declare function pathCandidateVersionOk(output: string): boolean;
/**
 * The PATH trust gate: a PATH candidate is executed ONLY when it passes an
 * explicit check. PATH candidates are NOT required to match the pinned hash
 * (the user may have installed another official version), so the check is:
 *
 *   1. `cloudflared --version` runs and reports a cloudflared version — the
 *      binary actually executes as cloudflared,
 *   2. on Windows, the Authenticode signature must be STRICTLY Valid AND
 *      issued to Cloudflare. Unlike the managed chain, NotSigned does NOT
 *      pass for a PATH candidate: an unsigned file on PATH is unknown code
 *      and must never be auto-executed.
 *
 * Any failure rejects the candidate; the caller falls back to the managed
 * pinned binary instead of executing unknown code.
 */
export declare function verifyPathCloudflaredCandidate(binaryPath: string): Promise<boolean>;
/**
 * The reproducible verification chain for EVERY managed binary (fresh
 * download or cached), run before any execution:
 *
 *   1. byte size equals the pinned official size,
 *   2. SHA-256 equals the pinned official hash,
 *   3. `<binary> --version` runs and prints the pinned version,
 *   4. Windows Authenticode (when the signature is present): a Valid
 *      Cloudflare signature passes; an Invalid/tampered signature fails. A
 *      NotSigned binary still passes — the pinned hash + version are the
 *      primary gates, Authenticode is never the only one.
 *
 * For a `.tgz` (darwin) asset the file examined is the previously EXTRACTED
 * binary, whose byte size and hash are NOT the pinned values (those belong to
 * the container archive). Only the `--version` gate can apply, and it reuses
 * the identical pinned-version check.
 *
 * Any failure throws a {@link TunnelStartError} with a stable code.
 */
export declare function defaultVerifyBinary(binaryPath: string, asset?: CloudflaredAsset): Promise<void>;
/**
 * Verify the RAW downloaded artifact (before any extraction/rename) against
 * the pinned trust anchor. This is the download-time gate:
 *
 *   - `tgz` (darwin): the file is the container archive — verify its size and
 *     SHA-256 only (a gzip archive cannot run `--version`); the extracted
 *     binary is gated separately by {@link defaultVerifyBinary};
 *   - `exe`/`bin`: the full runnable chain (delegates to
 *     {@link defaultVerifyBinary}).
 */
export declare function defaultVerifyDownloadedAsset(path: string, asset?: CloudflaredAsset): Promise<void>;
/**
 * Download timeout model (R06C2, refined R06C4).
 *
 * A fixed wall-clock cap is the WRONG model for a 55 MB binary on a slow but
 * healthy link. Measured first-run reality on this project's acceptance
 * machine ranged from 0.37 MB/s down to 15 KB/s on a degraded day — the full
 * binary can legitimately need over an hour. The model is:
 *
 *   - FIRST-BYTE (10 s): the response arrived (200 + Content-Length) but the
 *     first body chunk never comes — the R06C3 direct case delivered 0 B in
 *     240 s. Waiting out the idle window would waste a minute per route, so
 *     the first read gets its own short deadline and the route is switched.
 *   - IDLE (60 s): if no new bytes arrive for a sustained window after the
 *     first chunk, the link is stalled — abort. Every received chunk resets
 *     the idle timer, so a slow but progressing download is NEVER cut off.
 *   - OVERALL safety cap (10 min) with a PROGRESS FLOOR (1 MiB): a pure
 *     wall-clock cap would abort a healthy 15 KB/s download at 64% (the R06C2
 *     real E2E reproduced exactly that under a fixed cap). The cap therefore
 *     only fires when the connection has ALSO delivered under 1 MiB — i.e. a
 *     pathological trickle. Anything that has genuinely transferred more than
 *     1 MiB runs to completion; later stalls are caught by the idle timeout.
 *     (R06C4 removed the previous unconditional abort-style cap that killed a
 *     healthy download the moment it crossed the wall clock, floor or not.)
 */
export declare const DOWNLOAD_IDLE_TIMEOUT_MS = 60000;
export declare const DOWNLOAD_OVERALL_TIMEOUT_MS = 600000;
export declare const DOWNLOAD_OVERALL_MIN_BYTES = 1048576;
export declare const DOWNLOAD_FIRST_BYTE_TIMEOUT_MS = 10000;
/**
 * Slow-source gate (R06C4A). The FIRST-BYTE and IDLE timeouts cannot see the
 * real product problem: a source that delivers bytes but only at ~0.1 MB/s
 * (R06C4 real E2E B: official direct took ~8.3 min for 52.4 MB and never
 * fell back). In AUTO mode, when the CURRENT source is `official`, we sample
 * the real download speed over a window starting at the FIRST body chunk
 * (DNS/TLS/redirect/TTFB are excluded — the pre-first-byte phase stays with
 * the first-byte timeout), and if the window elapsed with the effective
 * average below the threshold, the route is abandoned (request aborted,
 * .part removed) and the next verified mirror is tried.
 *
 * These values are an IMPLEMENTATION policy, not a user-facing SLA: they are
 * tuned so the gate fires only when the official source is so slow that it
 * clearly hurts the one-click experience, never "switch because a mirror
 * might be faster". Mirrors are never slow-gated (no mirror→mirror churn).
 */
export declare const DOWNLOAD_SLOW_WINDOW_MS = 15000;
/** Minimum meaningful sample; if the window elapses without it, that IS slow. */
export declare const DOWNLOAD_SLOW_MIN_BYTES: number;
export declare const DOWNLOAD_SLOW_THRESHOLD_BYTES_PER_SEC: number;
/** Options for the R06C4 proxy/source-aware downloader. */
export interface DownloadRouteOptions {
    readonly cacheDir: string;
    readonly dest: string;
    readonly verify: (path: string) => Promise<void>;
    readonly onProgress?: (progress: DownloadProgress) => void;
    readonly timeouts?: {
        idleMs?: number;
        overallMs?: number;
        overallMinBytes?: number;
        firstByteMs?: number;
        slowWindowMs?: number;
        slowMinBytes?: number;
        slowThresholdBytesPerSecond?: number;
    };
    /** Download network mode + custom proxy (default: auto). */
    readonly network?: NetworkConfig;
    /** Download source mode (default: auto). */
    readonly source?: DownloadSourceMode;
    /** Test injection: environment mapping (default: process.env). */
    readonly env?: Record<string, string | undefined>;
    /** Test injection: Windows system-proxy reader (default: reg query). */
    readonly readSystemProxy?: () => Promise<SystemProxyRead>;
    /** Test injection: source list (default: resolveDownloadSources(mode)). */
    readonly sources?: readonly DownloadSource[];
    /** Local-log diagnostics; never user-facing, never contain credentials. */
    readonly onDiagnostic?: (diagnostic: string) => void;
    /**
     * Fired right before the route loop abandons the current route for the next
     * one (e.g. the AUTO slow-source gate switching official → mirror). Lets the
     * status surface show a sourceChanging transition instead of stale bytes.
     */
    readonly onSourceSwitch?: (next: {
        readonly source: DownloadSource;
        readonly path: ProxyCandidate;
    }) => void;
}
/**
 * R06C4: download cloudflared through ordered (network path × source) routes.
 *
 * SOURCE (which server) and NETWORK PATH (which route) are orthogonal:
 *   - paths are resolved from the network mode (auto: custom → env → system →
 *     direct; direct: direct only; custom: the configured proxy only);
 *   - sources are resolved from the source mode (auto: official → verified
 *     mirrors; official: official only; mirror: verified mirrors only).
 * Routes are tried SERIALLY — no parallel racing, no double bandwidth — and
 * every (path, source) combination at most once. A trust-chain failure
 * (checksum/size/version/signature) always skips to the next source: a mirror
 * is transport, never a trust root, and every source runs the identical
 * verification. A network failure after real progress (>= the progress floor)
 * is NOT retried — no full re-download for late jitter.
 *
 * The proxy is REQUEST-SCOPED: an undici ProxyAgent is created per attempt and
 * closed when the attempt ends. Nothing here mutates the undici global
 * dispatcher, process.env, or the Windows system proxy — DSH's own network
 * traffic (OAuth, models, updater, other plugins) is untouched.
 */
export declare function downloadWithNetworkRoutes(options: DownloadRouteOptions): Promise<void>;
/**
 * Default download (backward-compatible entry): DIRECT network path, OFFICIAL
 * source only — exactly the pre-R06C4 behavior. The proxy/source-aware entry
 * point is {@link downloadWithNetworkRoutes}.
 */
export declare function defaultDownloadBinary(cacheDir: string, dest: string, verify?: (path: string) => Promise<void>, onProgress?: (progress: DownloadProgress) => void, timeouts?: {
    idleMs?: number;
    overallMs?: number;
    overallMinBytes?: number;
}): Promise<void>;
export declare function createQuickTunnelService(options: QuickTunnelOptions): QuickTunnelService;

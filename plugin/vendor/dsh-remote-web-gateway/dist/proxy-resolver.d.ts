/**
 * R06C4 — request-scoped download network routing.
 *
 * The cloudflared downloader must be able to reuse the user's EXISTING local
 * proxy configuration (R06C3 proved the default Node fetch goes direct while
 * PowerShell/.NET goes through the WinINET system proxy — a 0 B/240 s stall
 * versus 9.34 MB/s). The proxy is applied ONLY to the downloader's own
 * requests: nothing here mutates the process env, the undici global
 * dispatcher, the Windows system proxy, or any DSH network behavior.
 *
 * Modes:
 *   - auto   : custom (only when explicitly configured) → env (HTTPS_PROXY /
 *              HTTP_PROXY, read-only) → Windows current-user static system
 *              proxy (HKCU Internet Settings, read-only) → direct
 *   - direct : direct only — never reads system/env proxy
 *   - custom : the configured proxy URL only — never silently falls back
 *
 * Proxy URLs are sensitive. A candidate's full URL (which may carry
 * credentials from the environment) is kept IN MEMORY ONLY for the
 * request-scoped agent; everything that can leave this module is a redacted
 * `host:port` display. Custom proxy URLs containing credentials are rejected.
 */
/** Where a download route came from; shown in the UI as 通过…/直接连接. */
export type ProxySource = 'custom' | 'environment' | 'system' | 'direct';
/** Download network mode (UI: 下载网络). */
export type DownloadNetworkMode = 'auto' | 'direct' | 'custom';
/** Download source mode (UI: 下载源). */
export type DownloadSourceMode = 'auto' | 'official' | 'mirror';
export interface NetworkConfig {
    readonly network: DownloadNetworkMode;
    /** Custom proxy URL (http/https, NO credentials). Optional. */
    readonly customProxyUrl?: string;
}
/** One ordered network path the downloader may use. */
export interface ProxyCandidate {
    readonly source: ProxySource;
    /**
     * Full proxy URL handed to the undici ProxyAgent — IN MEMORY ONLY. May carry
     * credentials read from the environment; never logged, never serialized,
     * never sent to the client. Absent for `direct`.
     */
    readonly url?: string;
    /** Redacted `host:port` display — NEVER contains credentials. */
    readonly display?: string;
}
export interface ProxyResolution {
    readonly candidates: readonly ProxyCandidate[];
    /** Non-fatal notes for the local log (e.g. system-proxy-unsupported). */
    readonly diagnostics: readonly string[];
}
/** Parsed proxy URL with a credential-free display form. */
export interface ParsedProxy {
    /** Normalized proxy URL (scheme://host[:port]); credentials never included. */
    readonly url: string;
    readonly display: string;
    readonly hasCredentials: boolean;
}
/** Result of reading the Windows current-user static proxy (read-only). */
export type SystemProxyRead = {
    readonly url: string;
    readonly display: string;
} | {
    readonly unsupported: true;
} | undefined;
export type RegQuery = (command: string, args: readonly string[]) => Promise<string>;
/**
 * Parse a proxy URL for the downloader. Accepts http/https with no path/query/
 * fragment. Credentials are detected (env proxies may carry them) but are
 * never part of the display; custom proxies with credentials are rejected by
 * the caller.
 * @param raw - the raw proxy URL string.
 * @returns the parsed form, or undefined when it is not a supported proxy URL.
 */
export declare function parseProxyUrl(raw: string): ParsedProxy | undefined;
/** First non-empty HTTPS_PROXY/HTTP_PROXY value that parses (or undefined). */
export declare function readEnvProxy(env: Record<string, string | undefined>): ProxyCandidate | undefined;
/** Whether any proxy env variable is set at all (even if malformed). */
export declare function hasEnvProxySet(env: Record<string, string | undefined>): boolean;
/**
 * Parse the common static ProxyServer formats:
 *   `127.0.0.1:7890` and `http=host:port;https=host:port` (optionally with
 *   more scheme entries). For HTTPS downloads prefer the https entry, else a
 *   unified address. Anything else (credentials, non-http schemes, garbage)
 *   returns undefined — the caller ignores the candidate and keeps DIRECT.
 */
export declare function parseProxyServer(raw: string): SystemProxyRead | undefined;
/** Default registry reader: `reg.exe query`, bounded, never writes anything. */
export declare function defaultRegQuery(command: string, args: readonly string[]): Promise<string>;
/**
 * Read the Windows CURRENT-USER static system proxy (HKCU Internet Settings),
 * read-only. PAC/WPAD/WinHTTP/native WinINET bindings are deliberately NOT
 * implemented; unsupported formats are reported via `{ unsupported: true }`
 * and the caller continues to DIRECT without failing.
 */
export declare function readWinInetStaticProxy(query?: RegQuery): Promise<SystemProxyRead>;
/**
 * Resolve the ordered network-path candidates for the configured mode.
 * Read-only with respect to every external state: env vars are read but never
 * written; the Windows registry is queried but never modified.
 * @param config - the download network configuration.
 * @param env - environment mapping (defaults to process.env; injectable).
 * @param readSystem - Windows system-proxy reader (injectable).
 */
export declare function resolveNetworkPaths(config: NetworkConfig, env?: Record<string, string | undefined>, readSystem?: () => Promise<SystemProxyRead>): Promise<ProxyResolution>;

/**
 * Plugin configuration: defaults + strict validation.
 *
 * The cordis Loader passes the patch row's `config` through unvalidated (this
 * plugin deliberately does not export a schemastery Config), so every value is
 * checked here, fail-closed, before any socket binds or state is written.
 */
import type { DownloadNetworkMode, DownloadSourceMode } from '../vendor/dsh-remote-web-gateway/dist/proxy-resolver.js';
export interface PluginConfig {
    /** Gateway listen port; 0 = OS-assigned loopback port. */
    readonly gatewayPort: number;
    /** Health listen port; 0 = OS-assigned loopback port. */
    readonly healthPort: number;
    readonly deviceMax: number;
    readonly sessionTtlMs: number;
    readonly ticketTtlMs: number;
    readonly ticketMax: number;
    readonly claimRateLimit: number;
    readonly claimRateWindowMs: number;
    readonly tunnelStartTimeoutMs: number;
    /** Minimum time between AUTOMATIC update checks (manual checks bypass it). */
    readonly updateIntervalMs: number;
    /** `dsh plugin --profile <cliProfile> ...` — the profile this DSH runs as. */
    readonly cliProfile: string;
    /** R06C4 download network mode: auto (recommended) / direct / custom. */
    readonly downloadNetwork: DownloadNetworkMode;
    /** R06C4 download source mode: auto (recommended) / official / mirror. */
    readonly downloadSource: DownloadSourceMode;
    /** R06C4 custom proxy URL (http/https, NO credentials — rejected here). */
    readonly customProxyUrl?: string;
}
/**
 * Validate the raw patch config into a fully-defaulted PluginConfig.
 * @param raw - the loader-provided config value (undefined when absent).
 */
export declare function resolvePluginConfig(raw: unknown): PluginConfig;
/** The management RPC channel the gateway must deny from the public entry. */
export declare const MANAGEMENT_RPC_CHANNEL = "/dsh-remote";

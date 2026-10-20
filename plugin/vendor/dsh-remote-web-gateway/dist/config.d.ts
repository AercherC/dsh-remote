/** Strict startup configuration for the loopback-only gateway. */
export interface CloudflareAccessAuthConfig {
    readonly mode: 'cloudflare-access';
    readonly issuer: URL;
    readonly audience: string;
    readonly allowedEmails: ReadonlySet<string>;
}
export interface TrustedRelayAuthConfig {
    readonly mode: 'trusted-relay';
    readonly token: string;
}
export interface PairingAuthConfig {
    readonly mode: 'pairing';
    /** Absolute state-file path; required so the gateway never writes into the checkout. */
    readonly deviceSessionFile: string;
    readonly deviceMax: number;
    readonly sessionTtlMs: number;
    readonly ticketTtlMs: number;
    readonly ticketMax: number;
    readonly claimRateLimit: number;
    readonly claimRateWindowMs: number;
}
export interface QuickTunnelConfig {
    /** Absolute cache directory for the cloudflared binary (injected, never hard-coded). */
    readonly cacheDir: string;
    readonly startTimeoutMs: number;
}
export type GatewayAuthConfig = CloudflareAccessAuthConfig | TrustedRelayAuthConfig | PairingAuthConfig;
export interface GatewayConfig {
    readonly listenHost: '127.0.0.1';
    readonly port: number;
    readonly healthPort: number;
    readonly upstream: URL;
    readonly publicOrigin: URL;
    readonly auth: GatewayAuthConfig;
    /**
     * Path prefixes the PUBLIC entry may never reach, even with a valid device
     * session. The gateway answers 404 before authentication so the endpoints
     * are indistinguishable from missing. The DSH plugin registers its
     * management RPC under `/api/dsh-remote` and lists that prefix here: the
     * management plane is loopback-only even though the proxy rewrites Host to
     * the loopback upstream. V1 modes leave this unset.
     */
    readonly deniedPublicPaths?: readonly string[];
}
export declare function relayToken(raw: string): string;
/** Quick Mode tunnel configuration (standalone; V1 modes never touch it). */
export declare function loadQuickTunnelConfig(env?: NodeJS.ProcessEnv): QuickTunnelConfig;
/** Parse all deployment inputs and reject unsafe topology before any socket binds. */
export declare function loadConfig(env?: NodeJS.ProcessEnv): GatewayConfig;

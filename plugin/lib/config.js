/**
 * Plugin configuration: defaults + strict validation.
 *
 * The cordis Loader passes the patch row's `config` through unvalidated (this
 * plugin deliberately does not export a schemastery Config), so every value is
 * checked here, fail-closed, before any socket binds or state is written.
 */
const DEFAULTS = {
    gatewayPort: 0,
    healthPort: 0,
    deviceMax: 20,
    sessionTtlMs: 30 * 24 * 60 * 60_000,
    ticketTtlMs: 5 * 60_000,
    ticketMax: 100,
    claimRateLimit: 60,
    claimRateWindowMs: 60_000,
    tunnelStartTimeoutMs: 30_000,
    updateIntervalMs: 24 * 60 * 60_000,
    cliProfile: 'web',
    downloadNetwork: 'auto',
    downloadSource: 'auto',
};
function integer(raw, name, fallback, minimum, maximum) {
    if (raw === undefined)
        return fallback;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < minimum || raw > maximum) {
        throw new Error(`dsh-remote-web-gateway: config ${name} must be an integer between ${String(minimum)} and ${String(maximum)}`);
    }
    return raw;
}
/**
 * Validate the raw patch config into a fully-defaulted PluginConfig.
 * @param raw - the loader-provided config value (undefined when absent).
 */
export function resolvePluginConfig(raw) {
    const value = (raw === null || raw === undefined) ? {} : raw;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('dsh-remote-web-gateway: config must be an object');
    }
    const config = value;
    const customProxyUrl = customProxy(config.customProxyUrl);
    return {
        gatewayPort: integer(config.gatewayPort, 'gatewayPort', DEFAULTS.gatewayPort, 0, 65535),
        healthPort: integer(config.healthPort, 'healthPort', DEFAULTS.healthPort, 0, 65535),
        deviceMax: integer(config.deviceMax, 'deviceMax', DEFAULTS.deviceMax, 1, 1000),
        sessionTtlMs: integer(config.sessionTtlMs, 'sessionTtlMs', DEFAULTS.sessionTtlMs, 24 * 60 * 60_000, 365 * 24 * 60 * 60_000),
        ticketTtlMs: integer(config.ticketTtlMs, 'ticketTtlMs', DEFAULTS.ticketTtlMs, 30_000, 3_600_000),
        ticketMax: integer(config.ticketMax, 'ticketMax', DEFAULTS.ticketMax, 10, 10_000),
        claimRateLimit: integer(config.claimRateLimit, 'claimRateLimit', DEFAULTS.claimRateLimit, 1, 1000),
        claimRateWindowMs: integer(config.claimRateWindowMs, 'claimRateWindowMs', DEFAULTS.claimRateWindowMs, 1_000, 3_600_000),
        tunnelStartTimeoutMs: integer(config.tunnelStartTimeoutMs, 'tunnelStartTimeoutMs', DEFAULTS.tunnelStartTimeoutMs, 5_000, 120_000),
        updateIntervalMs: integer(config.updateIntervalMs, 'updateIntervalMs', DEFAULTS.updateIntervalMs, 60_000, 7 * 24 * 60 * 60_000),
        cliProfile: profileName(config.cliProfile, DEFAULTS.cliProfile),
        downloadNetwork: downloadNetworkMode(config.downloadNetwork, DEFAULTS.downloadNetwork),
        downloadSource: downloadSourceMode(config.downloadSource, DEFAULTS.downloadSource),
        ...(customProxyUrl === undefined ? {} : { customProxyUrl }),
    };
}
function profileName(raw, fallback) {
    if (raw === undefined)
        return fallback;
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw)) {
        throw new Error('dsh-remote-web-gateway: config cliProfile must match ^[A-Za-z0-9_-]{1,64}$');
    }
    return raw;
}
function downloadNetworkMode(raw, fallback) {
    if (raw === undefined)
        return fallback;
    if (raw !== 'auto' && raw !== 'direct' && raw !== 'custom') {
        throw new Error('dsh-remote-web-gateway: config downloadNetwork must be "auto", "direct", or "custom"');
    }
    return raw;
}
function downloadSourceMode(raw, fallback) {
    if (raw === undefined)
        return fallback;
    if (raw !== 'auto' && raw !== 'official' && raw !== 'mirror') {
        throw new Error('dsh-remote-web-gateway: config downloadSource must be "auto", "official", or "mirror"');
    }
    return raw;
}
/**
 * Custom proxy URL: http/https, NO credentials (the UI rejects them with
 * user copy; the host fails closed here so a credential never reaches the
 * request-scoped agent config or any persisted state). Rejecting credentials
 * at the boundary means no secret-at-rest problem in network-config.json.
 */
function customProxy(raw) {
    if (raw === undefined)
        return undefined;
    if (typeof raw !== 'string' || raw.trim() === '') {
        throw new Error('dsh-remote-web-gateway: config customProxyUrl must be a non-empty http(s) URL');
    }
    const value = raw.trim();
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error('dsh-remote-web-gateway: config customProxyUrl must be a valid http(s) URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('dsh-remote-web-gateway: config customProxyUrl must use http: or https: (SOCKS/PAC are not supported)');
    }
    if (url.username !== '' || url.password !== '') {
        throw new Error('dsh-remote-web-gateway: config customProxyUrl must not contain credentials; use the HTTPS_PROXY environment variable instead');
    }
    return value;
}
/** The management RPC channel the gateway must deny from the public entry. */
export const MANAGEMENT_RPC_CHANNEL = '/dsh-remote';

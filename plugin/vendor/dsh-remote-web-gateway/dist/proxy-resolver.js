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
import { execFile } from 'node:child_process';
const WINDOWS_INTERNET_SETTINGS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const PROXY_ENV_NAMES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];
/**
 * Parse a proxy URL for the downloader. Accepts http/https with no path/query/
 * fragment. Credentials are detected (env proxies may carry them) but are
 * never part of the display; custom proxies with credentials are rejected by
 * the caller.
 * @param raw - the raw proxy URL string.
 * @returns the parsed form, or undefined when it is not a supported proxy URL.
 */
export function parseProxyUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        return undefined;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return undefined;
    if (url.pathname !== '' && url.pathname !== '/')
        return undefined;
    if (url.search !== '' || url.hash !== '')
        return undefined;
    if (url.hostname === '')
        return undefined;
    const port = url.port === '' ? (url.protocol === 'http:' ? 80 : 443) : Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        return undefined;
    const normalized = `${url.protocol}//${url.hostname}${url.port === '' ? '' : `:${url.port}`}`;
    return {
        url: normalized,
        display: `${url.hostname}:${String(port)}`,
        hasCredentials: url.username !== '' || url.password !== '',
    };
}
/** First non-empty HTTPS_PROXY/HTTP_PROXY value that parses (or undefined). */
export function readEnvProxy(env) {
    for (const name of PROXY_ENV_NAMES) {
        const raw = env[name];
        if (raw === undefined || raw.trim() === '')
            continue;
        const parsed = parseProxyUrl(raw.trim());
        if (parsed === undefined)
            return undefined; // set but malformed — caller records a diagnostic
        return { source: 'environment', url: parsed.url, display: parsed.display };
    }
    return undefined;
}
/** Whether any proxy env variable is set at all (even if malformed). */
export function hasEnvProxySet(env) {
    return PROXY_ENV_NAMES.some(name => {
        const raw = env[name];
        return raw !== undefined && raw.trim() !== '';
    });
}
/**
 * Parse the common static ProxyServer formats:
 *   `127.0.0.1:7890` and `http=host:port;https=host:port` (optionally with
 *   more scheme entries). For HTTPS downloads prefer the https entry, else a
 *   unified address. Anything else (credentials, non-http schemes, garbage)
 *   returns undefined — the caller ignores the candidate and keeps DIRECT.
 */
export function parseProxyServer(raw) {
    const value = raw.trim();
    if (value === '')
        return undefined;
    if (!value.includes('=')) {
        return proxyFromHostPort(value);
    }
    const entries = new Map();
    for (const part of value.split(';')) {
        const match = /^\s*([a-z][a-z0-9]*)\s*=\s*(\S+)\s*$/i.exec(part);
        if (match !== null && match[1] !== undefined && match[2] !== undefined) {
            entries.set(match[1].toLowerCase(), match[2]);
        }
    }
    if (entries.size === 0)
        return undefined;
    const pick = entries.get('https') ?? entries.get('http');
    if (pick === undefined)
        return undefined;
    return proxyFromHostPort(pick);
}
function proxyFromHostPort(raw) {
    const value = raw.trim();
    if (value === '')
        return undefined;
    // Credentials / paths / non-host garbage never parse into a safe proxy URL.
    if (value.includes('@') || value.includes('/') || value.includes('?') || value.includes('#'))
        return undefined;
    const schemeMatch = /^[a-z][a-z0-9+.-]*:\/\//i.exec(value);
    const body = schemeMatch !== null ? value.slice(schemeMatch[0].length) : value;
    let host;
    let port;
    const portSplit = body.lastIndexOf(':');
    if (portSplit === -1)
        return undefined;
    host = body.slice(0, portSplit);
    port = Number(body.slice(portSplit + 1));
    if (host === '' || !Number.isInteger(port) || port < 1 || port > 65535)
        return undefined;
    return { url: `http://${host}:${String(port)}`, display: `${host}:${String(port)}` };
}
/** Default registry reader: `reg.exe query`, bounded, never writes anything. */
export function defaultRegQuery(command, args) {
    return new Promise((resolve, reject) => {
        execFile(command, [...args], { encoding: 'utf8', timeout: 5_000, windowsHide: true }, (error, stdout) => {
            if (error !== null && error !== undefined)
                reject(error);
            else
                resolve(String(stdout));
        });
    });
}
function regValue(output, name) {
    for (const line of output.split(/\r?\n/)) {
        const match = new RegExp(`\\s+${name}\\s+\\S+\\s+(.+)$`).exec(line);
        if (match !== null && match[1] !== undefined)
            return match[1].trim();
    }
    return undefined;
}
/**
 * Read the Windows CURRENT-USER static system proxy (HKCU Internet Settings),
 * read-only. PAC/WPAD/WinHTTP/native WinINET bindings are deliberately NOT
 * implemented; unsupported formats are reported via `{ unsupported: true }`
 * and the caller continues to DIRECT without failing.
 */
export async function readWinInetStaticProxy(query = defaultRegQuery) {
    if (process.platform !== 'win32')
        return undefined;
    let enabledOut;
    try {
        enabledOut = await query('reg', ['query', WINDOWS_INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable']);
    }
    catch {
        return undefined; // key/value absent or reg unavailable — treat as no proxy
    }
    const enabled = regValue(enabledOut, 'ProxyEnable');
    if (enabled === undefined || parseInt(enabled, 16) !== 1)
        return undefined;
    let serverOut;
    try {
        serverOut = await query('reg', ['query', WINDOWS_INTERNET_SETTINGS_KEY, '/v', 'ProxyServer']);
    }
    catch {
        return { unsupported: true }; // enabled but unreadable — do not invent a proxy
    }
    const server = regValue(serverOut, 'ProxyServer');
    if (server === undefined)
        return { unsupported: true };
    const parsed = parseProxyServer(server);
    if (parsed === undefined)
        return { unsupported: true }; // enabled but unparseable — fail-safe, keep DIRECT
    return parsed;
}
function candidateOf(source, url, display) {
    return { source, url, display };
}
function directCandidate() {
    return { source: 'direct' };
}
function dedup(candidates) {
    const seen = new Set();
    const out = [];
    for (const candidate of candidates) {
        const key = candidate.source === 'direct' ? 'direct' : `url:${candidate.url ?? ''}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(candidate);
    }
    return out;
}
/**
 * Resolve the ordered network-path candidates for the configured mode.
 * Read-only with respect to every external state: env vars are read but never
 * written; the Windows registry is queried but never modified.
 * @param config - the download network configuration.
 * @param env - environment mapping (defaults to process.env; injectable).
 * @param readSystem - Windows system-proxy reader (injectable).
 */
export async function resolveNetworkPaths(config, env = process.env, readSystem = () => readWinInetStaticProxy()) {
    const diagnostics = [];
    if (config.network === 'direct') {
        return { candidates: [directCandidate()], diagnostics };
    }
    if (config.network === 'custom') {
        const raw = config.customProxyUrl;
        if (raw === undefined || raw.trim() === '') {
            diagnostics.push('custom-proxy-missing');
            return { candidates: [], diagnostics };
        }
        const parsed = parseProxyUrl(raw.trim());
        if (parsed === undefined || parsed.hasCredentials) {
            diagnostics.push(parsed?.hasCredentials === true ? 'custom-proxy-credentials' : 'custom-proxy-invalid');
            return { candidates: [], diagnostics };
        }
        return { candidates: [candidateOf('custom', parsed.url, parsed.display)], diagnostics };
    }
    // auto: custom → env → system → direct (each source at most once)
    const candidates = [];
    if (config.customProxyUrl !== undefined && config.customProxyUrl.trim() !== '') {
        const parsed = parseProxyUrl(config.customProxyUrl.trim());
        if (parsed === undefined || parsed.hasCredentials) {
            diagnostics.push(parsed?.hasCredentials === true ? 'custom-proxy-credentials' : 'custom-proxy-invalid');
        }
        else {
            candidates.push(candidateOf('custom', parsed.url, parsed.display));
        }
    }
    const envProxy = readEnvProxy(env);
    if (envProxy !== undefined) {
        candidates.push(envProxy);
    }
    else if (hasEnvProxySet(env)) {
        diagnostics.push('env-proxy-invalid');
    }
    const system = await readSystem();
    if (system !== undefined && !('unsupported' in system)) {
        candidates.push(candidateOf('system', system.url, system.display));
    }
    else if (system !== undefined && 'unsupported' in system) {
        diagnostics.push('system-proxy-unsupported');
    }
    candidates.push(directCandidate());
    return { candidates: dedup(candidates), diagnostics };
}
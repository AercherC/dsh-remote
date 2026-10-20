/**
 * dsh-remote-phone — host half.
 *
 * Wires DSH services into the gateway runtime:
 *   - resolves the harness home and the plugin's own state/cache dirs
 *   - starts the loopback gateway targeting THIS DSH web server
 *   - mounts the loopback-only management RPC on a dedicated channel as a web
 *     server prefix route (see mountChannel for why the Connection channel
 *     registration cannot be used)
 *
 * Plugin load NEVER opens the public network: the tunnel starts OFF and only
 * a user gesture (the settings "开启远程访问" button) starts it.
 *
 * Disposal order (guaranteed): tunnel stop → origin CLOSED → gateway close →
 * unused pairing tickets cleared. No cloudflared orphan survives disposal.
 */
import { resolvePluginConfig } from './config.js';
import { resolveDshHome } from './home.js';
import { createRpcHandler, REMOTE_RPC_CHANNEL } from './rpc.js';
import { createRemoteRuntime } from './runtime.js';
import { createWorkspaceBrowseHandler } from './workspace-browse.js';
import { WORKSPACE_BROWSE_CHANNEL } from './wire.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/** The installed plugin package root (parent of this module's directory). */
const pluginRootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Stable cordis plugin name. */
export const name = 'dsh-remote-phone';
/** Services required before this plugin mounts. */
export const inject = ['connection', 'webServer'];
function safeJson(fields) {
    try {
        return JSON.stringify(fields);
    }
    catch {
        return '{}';
    }
}
/**
 * Host plugin body.
 * @param ctx - host cordis context (connection + webServer services).
 * @param config - the loader patch config; validated here, fail-closed.
 */
export function apply(ctx, config) {
    const resolved = resolvePluginConfig(config);
    // The gateway proxies to THIS DSH web server. The webserver service is
    // injected, so its init (listen) completed and the actual port is known —
    // including an OS-assigned port.
    const upstream = new URL(`http://127.0.0.1:${String(ctx.webServer.port)}`);
    const logger = {
        info: fields => ctx.logger.info('[dsh-remote-phone] %s', safeJson(fields)),
        warn: fields => ctx.logger.warn('[dsh-remote-phone] %s', safeJson(fields)),
    };
    let runtime;
    let startupError;
    // Runtime creation is async (state load, gateway bind). Failures are
    // captured, logged, and surfaced through the status RPC as
    // `startup-failed`; nothing serves publicly and the tunnel never starts.
    // Corrupt device-session state therefore fails closed WITHOUT taking the
    // whole DSH process down.
    ctx.effect(() => {
        void createRemoteRuntime({
            dshHome: resolveDshHome(),
            upstream,
            config: resolved,
            logger,
            pluginRootDir,
            // R07: after pairing, bounce the phone to the launch-token URL instead of
            // bare `/`. `authenticatedUrl` mints DSH's own browser session cookie on
            // the phone; the gateway's device-session cookie alone is NOT enough.
            authRootUrl: (origin) => ctx.connection.authenticatedUrl(origin),
        }).then((created) => {
            runtime = created;
            ctx.logger.info('[dsh-remote-phone] runtime ready; tunnel is OFF until the user enables remote access');
            // Automatic update check: throttled host-side to 24h; failures are
            // silent (surfaced only through the settings UI).
            void created.updateCheck(false).catch(() => { });
        }).catch((error) => {
            startupError = error instanceof Error ? error.message : String(error);
            ctx.logger.warn('[dsh-remote-phone] runtime failed to start: %s', startupError);
        });
        return async () => {
            // Disposal: tunnel stop clears the origin BEFORE killing the process,
            // then the gateway closes and unused tickets are cleared.
            if (runtime !== undefined)
                await runtime.dispose();
        };
    }, 'dsh-remote-phone: runtime');
    // Loopback-only management RPC on a DEDICATED channel. The gateway denies
    // the same channel prefix from the public entry (defense in depth).
    const managementHandler = async (endpoint, payload) => {
        return await createRpcHandler(() => runtime)(endpoint, payload);
    };
    mountChannel(ctx, REMOTE_RPC_CHANNEL, managementHandler, 'dsh-remote-phone: loopback management rpc');
    ctx.logger.info('[dsh-remote-phone] management RPC registered on %s (loopback-only)', REMOTE_RPC_CHANNEL);
    // R14: mobile workspace directory browse — READ-ONLY listing for the
    // mobile workspace picker. Same loopback-authority mechanism, but on a
    // channel NOT in the gateway's deniedPublicPaths: paired phones reach it
    // through the gateway, which authenticates every public request with the
    // device session / pairing flow. The gateway rewrites Host/Origin to
    // loopback, so the loopback trust fence passes here. Only `list` exists —
    // no create/delete/modify (see workspace-browse.ts).
    mountChannel(ctx, WORKSPACE_BROWSE_CHANNEL, createWorkspaceBrowseHandler(), 'dsh-remote-phone: workspace browse rpc');
    ctx.logger.info('[dsh-remote-phone] workspace browse RPC registered on %s (device-session authenticated via the gateway)', WORKSPACE_BROWSE_CHANNEL);
}
/** Hard cap for one private channel body; both channels carry small control payloads. */
const MAX_CHANNEL_BODY_BYTES = 4 * 1024 * 1024;
/** Channel-relative endpoint segment, as the shared Connection transport parses it. */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/** Correlation id echoed for a body that carries no usable one. */
const INVALID_RPC_ID = 'invalid-request';
/**
 * Mount one private RPC channel as a web server prefix route.
 *
 * `connection.rpc.handle` cannot mount these channels: its registration ends in
 * `owner.webServer.register(route)`, and `owner` — the Context the Connection
 * service itself was constructed with — does not inject the web server, so any
 * plugin calling it dies with `cannot get property "webServer" without inject`.
 * Mounting the identical prefix route here keeps the channel path, the
 * admission fence, and the request/response envelope byte-compatible with the
 * shared transport, so the browser client and the gateway need no change.
 * @param ctx - host context (injects `connection` and `webServer`).
 * @param channel - absolute channel prefix, e.g. `/dsh-remote`.
 * @param handler - decoded endpoint handler.
 * @param label - effect label; disposal removes the route.
 */
function mountChannel(ctx, channel, handler, label) {
    ctx.effect(() => ctx.webServer.register({
        kind: 'prefix',
        path: channel,
        handler: (req, res) => serveChannel(ctx, channel, handler, req, res),
    }), label);
}
/**
 * Serve one private channel request: the shared transport's admission fence,
 * endpoint decoding, and envelope encoding.
 * @param ctx - host context.
 * @param channel - absolute channel prefix.
 * @param handler - decoded endpoint handler.
 * @param req - incoming request.
 * @param res - response owned to completion.
 */
async function serveChannel(ctx, channel, handler, req, res) {
    // Host/Origin trust and browser authentication run before dispatch, exactly
    // as the shared transport orders them.
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) {
        res.writeHead(rejection);
        res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
        return;
    }
    const endpoint = req.method === 'POST'
        ? endpointFromChannel(channel, new URL(req.url ?? '/', 'http://dsh.internal').pathname)
        : undefined;
    if (endpoint === undefined) {
        res.writeHead(404);
        res.end('not found');
        return;
    }
    if (req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
        res.writeHead(415);
        res.end('content type must be application/json');
        return;
    }
    const body = await readChannelBody(req);
    if (body.kind === 'oversize') {
        res.writeHead(413, { connection: 'close' });
        res.end();
        req.destroy();
        return;
    }
    if (body.kind === 'bad-json') {
        res.writeHead(400);
        res.end('body is not JSON');
        return;
    }
    const request = channelRequestFrom(body.value);
    if (request === undefined) {
        sendResult(res, claimedRpcId(body.value), envelopeFailure('invalid client-request message'));
        return;
    }
    if (request.method !== endpoint) {
        sendResult(res, request.rpcId, envelopeFailure(`method ${JSON.stringify(request.method)} does not match endpoint ${JSON.stringify(endpoint)}`));
        return;
    }
    const abort = new AbortController();
    res.on('close', () => {
        if (!res.writableEnded)
            abort.abort();
    });
    try {
        sendResult(res, request.rpcId, await handler(endpoint, request.payload, abort.signal));
    }
    catch (error) {
        res.writeHead(500);
        res.end(`handler failure: ${String(error)}`);
    }
}
/**
 * Endpoint named by a channel path, or undefined when the path is not one.
 * @param channel - absolute channel prefix.
 * @param pathname - request pathname.
 */
function endpointFromChannel(channel, pathname) {
    if (!pathname.startsWith(`${channel}/`))
        return undefined;
    const endpoint = pathname.slice(channel.length + 1);
    const malformed = endpoint.split('/')
        .some(segment => segment === '' || segment === '.' || segment === '..' || !ENDPOINT_SEGMENT_PATTERN.test(segment));
    return malformed ? undefined : endpoint;
}
/**
 * Buffer and parse one JSON channel body.
 * @param req - incoming request.
 * @returns the parsed body, or why it cannot be read.
 */
async function readChannelBody(req) {
    const declared = req.headers['content-length'];
    if (declared !== undefined && Number(declared) > MAX_CHANNEL_BODY_BYTES)
        return { kind: 'oversize' };
    const chunks = [];
    let received = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        received += buffer.byteLength;
        if (received > MAX_CHANNEL_BODY_BYTES)
            return { kind: 'oversize' };
        chunks.push(buffer);
    }
    try {
        return { kind: 'value', value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
    }
    catch {
        return { kind: 'bad-json' };
    }
}
/**
 * The client-request envelope a decoded body carries, or undefined when the
 * body is not one. Envelope shape is validated here; the endpoint owns its
 * payload, as it does on the shared transport.
 * @param value - decoded JSON body.
 */
function channelRequestFrom(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const candidate = value;
    const { type, rpcId, method } = candidate;
    if (type !== 'client-request' || typeof rpcId !== 'string' || typeof method !== 'string')
        return undefined;
    return { rpcId, method, payload: candidate.payload };
}
/**
 * Correlation id a body claims, so a rejected request still correlates.
 * @param value - decoded JSON body.
 */
function claimedRpcId(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return INVALID_RPC_ID;
    const claimed = value.rpcId;
    return typeof claimed === 'string' ? claimed : INVALID_RPC_ID;
}
/**
 * Envelope-level failure, encoded as the shared transport encodes it.
 * @param message - failure message.
 */
function envelopeFailure(message) {
    return { ok: false, error: { code: 'gateway/bad-request', message, details: { issues: [] } } };
}
/**
 * Write one server-response envelope.
 * @param res - response owned to completion.
 * @param rpcId - correlation id echoed from the request.
 * @param result - endpoint result.
 */
function sendResult(res, rpcId, result) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ type: 'server-response', rpcId, result }));
}

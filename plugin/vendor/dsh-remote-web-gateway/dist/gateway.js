import { Agent, createServer } from 'node:http';
import { createProxyServer } from 'http-proxy-3';
import { sanitizeCookieHeader, STRIPPED_UPSTREAM_HEADERS } from './headers.js';
import { safePath } from './logger.js';
import { enforceHttpRequestPolicy, enforceWebSocketRequestPolicy, PublicOriginUnavailableError } from './request-policy.js';
import { staticPublicOrigin } from './public-origin.js';
import { injectLegacyWebViewPolyfill } from './web-compat.js';
const MAX_HTML_BYTES = 8 * 1024 * 1024;
function writeHttpError(response, status) {
    if (response.headersSent) {
        response.destroy();
        return;
    }
    response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
    });
    const text = status === 502 ? 'bad gateway'
        : status === 503 ? 'unavailable'
            : status === 404 ? 'not found'
                : 'forbidden';
    response.end(text);
}
function writeHtmlError(response, status, html) {
    if (response.headersSent) {
        response.destroy();
        return;
    }
    response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(Buffer.byteLength(html)),
        'x-content-type-options': 'nosniff',
    });
    response.end(html);
}
function writeUpgradeError(socket, status) {
    if (!socket.writable)
        return;
    const text = status === 401 ? 'Unauthorized'
        : status === 503 ? 'Service Unavailable'
            : status === 404 ? 'Not Found'
                : 'Forbidden';
    socket.end([
        `HTTP/1.1 ${String(status)} ${text}`,
        'Connection: close',
        'Cache-Control: no-store',
        'Content-Type: text/plain; charset=utf-8',
        `Content-Length: ${String(Buffer.byteLength(text))}`,
        '',
        text,
    ].join('\r\n'));
}
function hardenResponseHeaders(headers) {
    delete headers.server;
    headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
    headers['x-content-type-options'] = 'nosniff';
    headers['x-frame-options'] = 'DENY';
    headers['content-security-policy'] = "frame-ancestors 'none'";
    headers['referrer-policy'] = 'no-referrer';
}
function normalizeUpstreamHeaders(proxyRequest, request, upstream) {
    proxyRequest.setHeader('host', upstream.host);
    if (request.headers.origin !== undefined)
        proxyRequest.setHeader('origin', upstream.origin);
    else
        proxyRequest.removeHeader('origin');
    for (const name of STRIPPED_UPSTREAM_HEADERS)
        proxyRequest.removeHeader(name);
    const cookie = sanitizeCookieHeader(typeof request.headers.cookie === 'string' ? request.headers.cookie : undefined);
    if (cookie === undefined)
        proxyRequest.removeHeader('cookie');
    else
        proxyRequest.setHeader('cookie', cookie);
}
async function listen(server, port, host) {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.off('error', reject);
            resolve();
        });
    });
}
async function closeServer(server, sockets) {
    if (!server.listening)
        return;
    const closed = new Promise((resolve) => { server.close(() => { resolve(); }); });
    server.closeIdleConnections();
    const force = setTimeout(() => {
        for (const socket of sockets)
            socket.destroy();
    }, 5_000);
    force.unref();
    await closed;
    clearTimeout(force);
}
/** Start the authenticated transparent proxy and its separate loopback liveness endpoint. */
export async function startGateway(config, dependencies) {
    const publicOriginProvider = dependencies.publicOriginProvider ?? staticPublicOrigin(config.publicOrigin);
    const deniedPublicPaths = config.deniedPublicPaths ?? [];
    const isDeniedPublicPath = (path) => deniedPublicPaths.some(prefix => path.startsWith(prefix));
    const upstreamAgent = new Agent({ keepAlive: true });
    const proxy = createProxyServer({
        target: config.upstream.origin,
        agent: upstreamAgent,
        ws: true,
        xfwd: false,
        changeOrigin: false,
        prependPath: false,
        ignorePath: false,
    });
    /** 仅 HTML 导航需要缓冲改写；API、下载、SSE 与 WS 仍走原来的透明流式代理。 */
    const htmlRequests = new WeakSet();
    proxy.on('error', () => { });
    proxy.on('proxyReq', (proxyRequest, request) => {
        normalizeUpstreamHeaders(proxyRequest, request, config.upstream);
        // HTML 改写只处理 identity 编码，避免在网关里引入压缩解码分支。
        if (htmlRequests.has(request))
            proxyRequest.removeHeader('accept-encoding');
    });
    proxy.on('proxyReqWs', (proxyRequest, request) => {
        normalizeUpstreamHeaders(proxyRequest, request, config.upstream);
    });
    proxy.on('proxyRes', (proxyResponse, request) => {
        hardenResponseHeaders(proxyResponse.headers);
        const requestPath = safePath(request.url);
        if (requestPath.startsWith('/api')) {
            proxyResponse.headers['cache-control'] = 'no-store';
            const status = proxyResponse.statusCode;
            if (status !== undefined) {
                const fields = { event: 'http_upstream_response', method: request.method, path: requestPath, status };
                if (status >= 500)
                    dependencies.logger.warn(fields);
                else
                    dependencies.logger.info(fields);
            }
        }
    });
    proxy.on('proxyRes', (proxyResponse, request, response) => {
        if (!htmlRequests.has(request))
            return;
        const chunks = [];
        let size = 0;
        proxyResponse.on('data', (chunk) => {
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += data.length;
            if (size <= MAX_HTML_BYTES)
                chunks.push(data);
        });
        proxyResponse.once('end', () => {
            if (response.headersSent)
                return;
            if (size > MAX_HTML_BYTES) {
                dependencies.logger.warn({ event: 'html_compat_too_large', method: request.method, path: safePath(request.url), status: 502 });
                writeHttpError(response, 502);
                return;
            }
            const status = proxyResponse.statusCode ?? 502;
            const contentType = typeof proxyResponse.headers['content-type'] === 'string'
                ? proxyResponse.headers['content-type'].toLowerCase()
                : '';
            const original = Buffer.concat(chunks);
            const body = status >= 200 && status < 300 && contentType.includes('text/html')
                ? Buffer.from(injectLegacyWebViewPolyfill(original.toString('utf8')))
                : original;
            const headers = { ...proxyResponse.headers };
            delete headers['transfer-encoding'];
            delete headers['content-encoding'];
            headers['content-length'] = String(body.length);
            response.writeHead(status, proxyResponse.statusMessage, headers);
            response.end(request.method === 'HEAD' ? undefined : body);
        });
    });
    const sockets = new Set();
    const server = createServer((request, response) => {
        const requestPath = safePath(request.url);
        void (async () => {
            try {
                enforceHttpRequestPolicy(request, publicOriginProvider);
            }
            catch (error) {
                if (error instanceof PublicOriginUnavailableError) {
                    dependencies.logger.warn({ event: 'http_rejected_closed', method: request.method, path: requestPath, status: 503 });
                    writeHttpError(response, 503);
                    return;
                }
                dependencies.logger.warn({ event: 'http_rejected_policy', method: request.method, path: requestPath, status: 403 });
                writeHttpError(response, 403);
                return;
            }
            // The management plane is loopback-only: even a valid device session
            // through the public entry must never reach these prefixes. 404 keeps
            // them indistinguishable from missing resources.
            if (isDeniedPublicPath(requestPath)) {
                dependencies.logger.warn({ event: 'http_rejected_denied', method: request.method, path: requestPath, status: 404 });
                writeHttpError(response, 404);
                return;
            }
            if (dependencies.pairing !== undefined) {
                try {
                    if (await dependencies.pairing.routes.handle(request, response))
                        return;
                }
                catch {
                    dependencies.logger.warn({ event: 'pair_internal', method: request.method, path: requestPath, status: 500 });
                    writeHttpError(response, 500);
                    return;
                }
            }
            try {
                await dependencies.authenticator.authenticate(request.headers);
            }
            catch {
                dependencies.logger.warn({ event: 'http_rejected_auth', method: request.method, path: requestPath, status: 401 });
                const page = dependencies.pairing?.pageFor(request);
                if (page !== undefined)
                    writeHtmlError(response, 401, page);
                else
                    writeHttpError(response, 401);
                return;
            }
            dependencies.logger.info({ event: 'http_proxy', method: request.method, path: requestPath });
            const accept = typeof request.headers.accept === 'string' ? request.headers.accept : '';
            const rewriteHtml = request.method === 'GET' && accept.includes('text/html');
            if (rewriteHtml)
                htmlRequests.add(request);
            proxy.web(request, response, rewriteHtml ? { selfHandleResponse: true } : {}, () => {
                dependencies.logger.warn({ event: 'http_upstream_error', method: request.method, path: requestPath, status: 502 });
                writeHttpError(response, 502);
            });
        })();
    });
    server.on('connection', (socket) => {
        sockets.add(socket);
        socket.once('close', () => { sockets.delete(socket); });
    });
    server.on('upgrade', (request, socket, head) => {
        const requestPath = safePath(request.url);
        void (async () => {
            try {
                enforceWebSocketRequestPolicy(request, publicOriginProvider);
            }
            catch (error) {
                if (error instanceof PublicOriginUnavailableError) {
                    dependencies.logger.warn({ event: 'ws_rejected_closed', method: request.method, path: requestPath, status: 503 });
                    writeUpgradeError(socket, 503);
                    return;
                }
                dependencies.logger.warn({ event: 'ws_rejected_policy', method: request.method, path: requestPath, status: 403 });
                writeUpgradeError(socket, 403);
                return;
            }
            if (isDeniedPublicPath(requestPath)) {
                dependencies.logger.warn({ event: 'ws_rejected_denied', method: request.method, path: requestPath, status: 404 });
                writeUpgradeError(socket, 404);
                return;
            }
            try {
                await dependencies.authenticator.authenticate(request.headers);
            }
            catch {
                dependencies.logger.warn({ event: 'ws_rejected_auth', method: request.method, path: requestPath, status: 401 });
                writeUpgradeError(socket, 401);
                return;
            }
            dependencies.logger.info({ event: 'ws_proxy', method: request.method, path: requestPath });
            proxy.ws(request, socket, head, {}, () => {
                dependencies.logger.warn({ event: 'ws_upstream_error', method: request.method, path: requestPath, status: 502 });
                socket.destroy();
            });
        })();
    });
    const healthSockets = new Set();
    const healthServer = createServer((request, response) => {
        if (request.method === 'GET' && safePath(request.url) === '/healthz') {
            response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json' });
            response.end('{"status":"ok"}\n');
            return;
        }
        response.writeHead(404, { 'cache-control': 'no-store' });
        response.end();
    });
    healthServer.on('connection', (socket) => {
        healthSockets.add(socket);
        socket.once('close', () => { healthSockets.delete(socket); });
    });
    try {
        await listen(server, config.port, config.listenHost);
        await listen(healthServer, config.healthPort, config.listenHost);
    }
    catch (error) {
        upstreamAgent.destroy();
        await Promise.all([closeServer(server, sockets), closeServer(healthServer, healthSockets)]);
        proxy.close();
        throw error;
    }
    dependencies.logger.info({ event: 'gateway_started' });
    let closing;
    const address = server.address();
    const healthAddress = healthServer.address();
    const boundPort = typeof address === 'object' && address !== null ? address.port : config.port;
    const boundHealthPort = typeof healthAddress === 'object' && healthAddress !== null ? healthAddress.port : config.healthPort;
    return {
        server,
        healthServer,
        port: boundPort,
        healthPort: boundHealthPort,
        close() {
            closing ??= (async () => {
                upstreamAgent.destroy();
                await Promise.all([
                    closeServer(server, sockets),
                    closeServer(healthServer, healthSockets),
                ]);
                proxy.close();
                dependencies.logger.info({ event: 'gateway_stopped' });
            })();
            return closing;
        },
    };
}
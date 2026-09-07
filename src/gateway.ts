import { Agent, createServer } from 'node:http'
import type { ClientRequest, IncomingMessage, Server, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { createProxyServer } from 'http-proxy-3'
import type { Authenticator } from './auth.js'
import type { GatewayConfig } from './config.js'
import { sanitizeCookieHeader, STRIPPED_UPSTREAM_HEADERS } from './headers.js'
import type { GatewayLogger } from './logger.js'
import { safePath } from './logger.js'
import { enforceHttpRequestPolicy, enforceWebSocketRequestPolicy, PublicOriginUnavailableError } from './request-policy.js'
import type { PairingRoutes } from './pairing-routes.js'
import type { PublicOriginProvider } from './public-origin.js'
import { staticPublicOrigin } from './public-origin.js'

export interface GatewayDependencies {
  readonly authenticator: Authenticator
  readonly logger: GatewayLogger
  /**
   * Runtime public-origin provider. Defaults to a static provider over
   * `config.publicOrigin` (V1 behavior). Quick Mode passes a controller that
   * starts CLOSED (undefined → every external request gets 503) until the
   * Quick Tunnel reports a validated URL.
   */
  readonly publicOriginProvider?: PublicOriginProvider
  /**
   * Pairing surface (pairing auth mode). Requests are checked against the
   * request policy first, then the pairing routes (GET /pair, POST
   * /pair/claim) may handle them before authentication is attempted.
   * `pageFor` returns pairing HTML for unauthenticated HTML navigations so
   * browsers get a friendly pairing hint while API/WS traffic keeps a plain
   * 401.
   */
  readonly pairing?: {
    readonly routes: PairingRoutes
    readonly pageFor: (request: IncomingMessage) => string | undefined
  }
}

export interface RunningGateway {
  readonly server: Server
  readonly healthServer: Server
  /** The actual gateway listen port (resolves config.port 0 → OS-assigned). */
  readonly port: number
  /** The actual health listen port (resolves config.healthPort 0 → OS-assigned). */
  readonly healthPort: number
  close(): Promise<void>
}

function writeHttpError(response: ServerResponse, status: number): void {
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  const text = status === 502 ? 'bad gateway'
    : status === 503 ? 'unavailable'
      : status === 404 ? 'not found'
        : 'forbidden'
  response.end(text)
}

function writeHtmlError(response: ServerResponse, status: number, html: string): void {
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
    'content-length': String(Buffer.byteLength(html)),
    'x-content-type-options': 'nosniff',
  })
  response.end(html)
}

function writeUpgradeError(socket: Duplex, status: 401 | 403 | 404 | 503): void {
  if (!socket.writable) return
  const text = status === 401 ? 'Unauthorized'
    : status === 503 ? 'Service Unavailable'
      : status === 404 ? 'Not Found'
        : 'Forbidden'
  socket.end([
    `HTTP/1.1 ${String(status)} ${text}`,
    'Connection: close',
    'Cache-Control: no-store',
    'Content-Type: text/plain; charset=utf-8',
    `Content-Length: ${String(Buffer.byteLength(text))}`,
    '',
    text,
  ].join('\r\n'))
}

function hardenResponseHeaders(headers: NodeJS.Dict<string | string[]>): void {
  delete headers.server
  headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains'
  headers['x-content-type-options'] = 'nosniff'
  headers['x-frame-options'] = 'DENY'
  headers['content-security-policy'] = "frame-ancestors 'none'"
  headers['referrer-policy'] = 'no-referrer'
}

function normalizeUpstreamHeaders(proxyRequest: ClientRequest, request: IncomingMessage, upstream: URL): void {
  proxyRequest.setHeader('host', upstream.host)
  if (request.headers.origin !== undefined) proxyRequest.setHeader('origin', upstream.origin)
  else proxyRequest.removeHeader('origin')
  for (const name of STRIPPED_UPSTREAM_HEADERS) proxyRequest.removeHeader(name)
  const cookie = sanitizeCookieHeader(typeof request.headers.cookie === 'string' ? request.headers.cookie : undefined)
  if (cookie === undefined) proxyRequest.removeHeader('cookie')
  else proxyRequest.setHeader('cookie', cookie)
}

async function listen(server: Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

async function closeServer(server: Server, sockets: Set<Socket>): Promise<void> {
  if (!server.listening) return
  const closed = new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  server.closeIdleConnections()
  const force = setTimeout(() => {
    for (const socket of sockets) socket.destroy()
  }, 5_000)
  force.unref()
  await closed
  clearTimeout(force)
}

/** Start the authenticated transparent proxy and its separate loopback liveness endpoint. */
export async function startGateway(config: GatewayConfig, dependencies: GatewayDependencies): Promise<RunningGateway> {
  const publicOriginProvider = dependencies.publicOriginProvider ?? staticPublicOrigin(config.publicOrigin)
  const deniedPublicPaths = config.deniedPublicPaths ?? []
  const isDeniedPublicPath = (path: string): boolean =>
    deniedPublicPaths.some(prefix => path.startsWith(prefix))
  const upstreamAgent = new Agent({ keepAlive: true })
  const proxy = createProxyServer({
    target: config.upstream.origin,
    agent: upstreamAgent,
    ws: true,
    xfwd: false,
    changeOrigin: false,
    prependPath: false,
    ignorePath: false,
  })
  proxy.on('error', () => {})
  proxy.on('proxyReq', (proxyRequest: ClientRequest, request: IncomingMessage) => {
    normalizeUpstreamHeaders(proxyRequest, request, config.upstream)
  })
  proxy.on('proxyReqWs', (proxyRequest: ClientRequest, request: IncomingMessage) => {
    normalizeUpstreamHeaders(proxyRequest, request, config.upstream)
  })
  proxy.on('proxyRes', (proxyResponse: IncomingMessage, request: IncomingMessage) => {
    hardenResponseHeaders(proxyResponse.headers)
    const requestPath = safePath(request.url)
    if (requestPath.startsWith('/api')) {
      proxyResponse.headers['cache-control'] = 'no-store'
      const status = proxyResponse.statusCode
      if (status !== undefined) {
        const fields = { event: 'http_upstream_response', method: request.method, path: requestPath, status }
        if (status >= 500) dependencies.logger.warn(fields)
        else dependencies.logger.info(fields)
      }
    }
  })

  const sockets = new Set<Socket>()
  const server = createServer((request, response) => {
    const requestPath = safePath(request.url)
    void (async () => {
      try {
        enforceHttpRequestPolicy(request, publicOriginProvider)
      } catch (error) {
        if (error instanceof PublicOriginUnavailableError) {
          dependencies.logger.warn({ event: 'http_rejected_closed', method: request.method, path: requestPath, status: 503 })
          writeHttpError(response, 503)
          return
        }
        dependencies.logger.warn({ event: 'http_rejected_policy', method: request.method, path: requestPath, status: 403 })
        writeHttpError(response, 403)
        return
      }
      // The management plane is loopback-only: even a valid device session
      // through the public entry must never reach these prefixes. 404 keeps
      // them indistinguishable from missing resources.
      if (isDeniedPublicPath(requestPath)) {
        dependencies.logger.warn({ event: 'http_rejected_denied', method: request.method, path: requestPath, status: 404 })
        writeHttpError(response, 404)
        return
      }
      if (dependencies.pairing !== undefined) {
        try {
          if (await dependencies.pairing.routes.handle(request, response)) return
        } catch {
          dependencies.logger.warn({ event: 'pair_internal', method: request.method, path: requestPath, status: 500 })
          writeHttpError(response, 500)
          return
        }
      }
      try {
        await dependencies.authenticator.authenticate(request.headers)
      } catch {
        dependencies.logger.warn({ event: 'http_rejected_auth', method: request.method, path: requestPath, status: 401 })
        const page = dependencies.pairing?.pageFor(request)
        if (page !== undefined) writeHtmlError(response, 401, page)
        else writeHttpError(response, 401)
        return
      }
      dependencies.logger.info({ event: 'http_proxy', method: request.method, path: requestPath })
      proxy.web(request, response, {}, () => {
        dependencies.logger.warn({ event: 'http_upstream_error', method: request.method, path: requestPath, status: 502 })
        writeHttpError(response, 502)
      })
    })()
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => { sockets.delete(socket) })
  })
  server.on('upgrade', (request, socket, head) => {
    const requestPath = safePath(request.url)
    void (async () => {
      try {
        enforceWebSocketRequestPolicy(request, publicOriginProvider)
      } catch (error) {
        if (error instanceof PublicOriginUnavailableError) {
          dependencies.logger.warn({ event: 'ws_rejected_closed', method: request.method, path: requestPath, status: 503 })
          writeUpgradeError(socket, 503)
          return
        }
        dependencies.logger.warn({ event: 'ws_rejected_policy', method: request.method, path: requestPath, status: 403 })
        writeUpgradeError(socket, 403)
        return
      }
      if (isDeniedPublicPath(requestPath)) {
        dependencies.logger.warn({ event: 'ws_rejected_denied', method: request.method, path: requestPath, status: 404 })
        writeUpgradeError(socket, 404)
        return
      }
      try {
        await dependencies.authenticator.authenticate(request.headers)
      } catch {
        dependencies.logger.warn({ event: 'ws_rejected_auth', method: request.method, path: requestPath, status: 401 })
        writeUpgradeError(socket, 401)
        return
      }
      dependencies.logger.info({ event: 'ws_proxy', method: request.method, path: requestPath })
      proxy.ws(request, socket, head, {}, () => {
        dependencies.logger.warn({ event: 'ws_upstream_error', method: request.method, path: requestPath, status: 502 })
        socket.destroy()
      })
    })()
  })

  const healthSockets = new Set<Socket>()
  const healthServer = createServer((request, response) => {
    if (request.method === 'GET' && safePath(request.url) === '/healthz') {
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json' })
      response.end('{"status":"ok"}\n')
      return
    }
    response.writeHead(404, { 'cache-control': 'no-store' })
    response.end()
  })
  healthServer.on('connection', (socket) => {
    healthSockets.add(socket)
    socket.once('close', () => { healthSockets.delete(socket) })
  })

  try {
    await listen(server, config.port, config.listenHost)
    await listen(healthServer, config.healthPort, config.listenHost)
  } catch (error) {
    upstreamAgent.destroy()
    await Promise.all([closeServer(server, sockets), closeServer(healthServer, healthSockets)])
    proxy.close()
    throw error
  }

  dependencies.logger.info({ event: 'gateway_started' })
  let closing: Promise<void> | undefined
  const address = server.address()
  const healthAddress = healthServer.address()
  const boundPort = typeof address === 'object' && address !== null ? address.port : config.port
  const boundHealthPort = typeof healthAddress === 'object' && healthAddress !== null ? healthAddress.port : config.healthPort
  return {
    server,
    healthServer,
    port: boundPort,
    healthPort: boundHealthPort,
    close() {
      closing ??= (async () => {
        upstreamAgent.destroy()
        await Promise.all([
          closeServer(server, sockets),
          closeServer(healthServer, healthSockets),
        ])
        proxy.close()
        dependencies.logger.info({ event: 'gateway_stopped' })
      })()
      return closing
    },
  }
}

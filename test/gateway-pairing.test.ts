import { createServer, request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket, { WebSocketServer } from 'ws'
import { createPairingAuthenticator } from '../src/auth.js'
import { createDeviceSessionStore } from '../src/device-session.js'
import type { DeviceSessionStore } from '../src/device-session.js'
import { startGateway } from '../src/gateway.js'
import type { RunningGateway } from '../src/gateway.js'
import { createPairingService } from '../src/pairing.js'
import type { PairingService } from '../src/pairing.js'
import { createPairingRoutes } from '../src/pairing-routes.js'
import { capturedLogs, close, listen, testConfig } from './helpers.js'

interface HttpResult {
  readonly status: number
  readonly headers: IncomingHttpHeaders
  readonly body: string
}

function request(port: number, options: {
  readonly method?: string
  readonly path: string
  readonly headers?: Record<string, string>
  readonly body?: string
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({
      host: '127.0.0.1',
      port,
      method: options.method ?? 'GET',
      path: options.path,
      headers: { connection: 'close', ...options.headers },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.once('end', () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    outgoing.once('error', reject)
    if (options.body !== undefined) outgoing.write(options.body)
    outgoing.end()
  })
}

const PUBLIC_ORIGIN = 'https://dsh.example.com'

describe('gateway in pairing mode', () => {
  let current = 1_700_000_000_000
  const now = (): number => current
  const upstreams: ReturnType<typeof createServer>[] = []
  const gateways: RunningGateway[] = []
  const clients: WebSocket[] = []

  afterEach(async () => {
    for (const client of clients.splice(0)) client.terminate()
    await Promise.all(gateways.splice(0).map(gateway => gateway.close()))
    await Promise.all(upstreams.splice(0).map(close))
  })

  async function startPairingGateway(overrides: Record<string, unknown> = {}): Promise<{
    port: number
    sessions: DeviceSessionStore
    pairing: PairingService
  }> {
    const upstream = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('upstream-ok')
    })
    upstreams.push(upstream)
    const upstreamPort = await listen(upstream)
    const dir = mkdtempSync(join(tmpdir(), 'dsh-gateway-pairing-test-'))
    const sessions = await createDeviceSessionStore({
      file: join(dir, 'state.json'),
      now,
      ...(typeof overrides.ttlMs === 'number' ? { ttlMs: overrides.ttlMs } : {}),
    })
    const pairing = createPairingService({ now })
    const logs = capturedLogs()
    const routes = createPairingRoutes({
      pairing,
      sessions,
      sessionTtlMs: 30 * 24 * 60 * 60_000,
      logger: logs.logger,
      now: () => new Date(current),
    })
    const gateway = await startGateway(testConfig(upstreamPort), {
      authenticator: createPairingAuthenticator({ sessions }),
      logger: logs.logger,
      pairing: { routes, pageFor: routes.pageFor },
    })
    gateways.push(gateway)
    return { port: (gateway.server.address() as AddressInfo).port, sessions, pairing }
  }

  async function pairDevice(port: number, pairing: PairingService): Promise<string> {
    const ticket = pairing.issue()
    const result = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: {
        host: 'dsh.example.com',
        origin: PUBLIC_ORIGIN,
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ secret: ticket.secret }),
    })
    expect(result.status).toBe(200)
    const cookies = result.headers['set-cookie']
    const cookie = (Array.isArray(cookies) ? cookies[0] : undefined) ?? ''
    return cookie.split(';', 1)[0] ?? ''
  }

  it('returns the pairing page for unauthenticated HTML navigation and plain 401 for API traffic', async () => {
    const { port } = await startPairingGateway()
    const page = await request(port, { path: '/', headers: { host: 'dsh.example.com', accept: 'text/html' } })
    expect(page.status).toBe(401)
    expect(page.body).toContain('设备配对')
    expect(page.headers['content-type']).toContain('text/html')

    const api = await request(port, { path: '/api/session', headers: { host: 'dsh.example.com' } })
    expect(api.status).toBe(401)
    expect(api.body).toBe('forbidden')
  })

  it('proxies after pairing and rejects revoked or expired sessions', async () => {
    const { port, sessions, pairing } = await startPairingGateway({ ttlMs: 60_000 })
    const cookie = await pairDevice(port, pairing)

    const ok = await request(port, { path: '/', headers: { host: 'dsh.example.com', cookie } })
    expect(ok.status).toBe(200)
    expect(ok.body).toBe('upstream-ok')

    // Find the device id through the store and revoke it.
    const summary = sessions.list()[0]
    expect(summary).toBeDefined()
    await sessions.revoke(summary!.id)
    const revoked = await request(port, { path: '/', headers: { host: 'dsh.example.com', cookie } })
    expect(revoked.status).toBe(401)

    const second = await pairDevice(port, pairing)
    current += 61_000
    const expired = await request(port, { path: '/', headers: { host: 'dsh.example.com', cookie: second } })
    expect(expired.status).toBe(401)
  })

  it('keeps Host, Origin, and Fetch-Metadata policy ahead of pairing auth', async () => {
    const { port, pairing } = await startPairingGateway()
    const cookie = await pairDevice(port, pairing)

    const wrongHost = await request(port, { path: '/', headers: { host: 'evil.example', cookie } })
    expect(wrongHost.status).toBe(403)

    const wrongOrigin = await request(port, {
      method: 'POST',
      path: '/api/session/create',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://evil.example',
        cookie,
        'content-type': 'application/json',
      },
      body: '{}',
    })
    expect(wrongOrigin.status).toBe(403)

    const crossSite = await request(port, {
      method: 'POST',
      path: '/api/session/create',
      headers: {
        host: 'dsh.example.com',
        origin: PUBLIC_ORIGIN,
        'sec-fetch-site': 'cross-site',
        cookie,
        'content-type': 'application/json',
      },
      body: '{}',
    })
    expect(crossSite.status).toBe(403)
  })

  it('rejects a cross-origin pairing claim', async () => {
    const { port, pairing } = await startPairingGateway()
    const ticket = pairing.issue()
    const result = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ secret: ticket.secret }),
    })
    expect(result.status).toBe(403)
    expect(pairing.claim(ticket.secret).ok).toBe(true)
  })

  it('authenticates WebSocket upgrades with a valid cookie and valid Origin only', async () => {
    let upgrades = 0
    const upstream = createServer()
    const websocketServer = new WebSocketServer({ noServer: true })
    upstream.on('upgrade', (request, socket, head) => {
      upgrades += 1
      websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        websocket.send('server-frame')
      })
    })
    upstreams.push(upstream)
    const upstreamPort = await listen(upstream)
    const dir = mkdtempSync(join(tmpdir(), 'dsh-gateway-pairing-ws-test-'))
    const sessions = await createDeviceSessionStore({ file: join(dir, 'state.json'), now })
    const pairing = createPairingService({ now })
    const logs = capturedLogs()
    const routes = createPairingRoutes({
      pairing,
      sessions,
      sessionTtlMs: 30 * 24 * 60 * 60_000,
      logger: logs.logger,
      now: () => new Date(current),
    })
    const gateway = await startGateway(testConfig(upstreamPort), {
      authenticator: createPairingAuthenticator({ sessions }),
      logger: logs.logger,
      pairing: { routes, pageFor: routes.pageFor },
    })
    gateways.push(gateway)
    const port = (gateway.server.address() as AddressInfo).port

    const ticket = pairing.issue()
    const claimed = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: {
        host: 'dsh.example.com',
        origin: PUBLIC_ORIGIN,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ secret: ticket.secret }),
    })
    const cookie = (Array.isArray(claimed.headers['set-cookie'])
      ? claimed.headers['set-cookie'][0] ?? ''
      : '').split(';', 1)[0] ?? ''

    // Valid cookie + valid Origin upgrades and carries frames.
    const client = new WebSocket(`ws://127.0.0.1:${String(port)}/api/events.mux`, {
      origin: PUBLIC_ORIGIN,
      headers: { host: 'dsh.example.com', cookie },
    })
    clients.push(client)
    const message = new Promise<string>((resolve, reject) => {
      client.once('message', data => resolve(data.toString()))
      client.once('error', reject)
    })
    await new Promise<void>((resolve, reject) => {
      client.once('open', resolve)
      client.once('error', reject)
    })
    expect(await message).toBe('server-frame')

    // Valid cookie + malicious Origin is rejected before DSH.
    const evil = new WebSocket(`ws://127.0.0.1:${String(port)}/api/events.host`, {
      origin: 'https://evil.example',
      headers: { host: 'dsh.example.com', cookie },
    })
    clients.push(evil)
    const evilError = await new Promise<Error>((resolve) => evil.once('error', resolve))
    expect(evilError.message).toContain('403')

    // Revoked cookie is rejected.
    await sessions.revoke(sessions.list()[0]!.id)
    const revoked = new WebSocket(`ws://127.0.0.1:${String(port)}/api/events.host`, {
      origin: PUBLIC_ORIGIN,
      headers: { host: 'dsh.example.com', cookie },
    })
    clients.push(revoked)
    const revokedError = await new Promise<Error>((resolve) => revoked.once('error', resolve))
    expect(revokedError.message).toContain('401')

    // No cookie at all is rejected.
    const bare = new WebSocket(`ws://127.0.0.1:${String(port)}/api/events.host`, {
      origin: PUBLIC_ORIGIN,
      headers: { host: 'dsh.example.com' },
    })
    clients.push(bare)
    const bareError = await new Promise<Error>((resolve) => bare.once('error', resolve))
    expect(bareError.message).toContain('401')

    expect(upgrades).toBe(1)
    websocketServer.close()
  })
})

import { createServer, request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { startGateway } from '../src/gateway.js'
import type { RunningGateway } from '../src/gateway.js'
import { acceptingAuthenticator, capturedLogs, close, listen, testConfig } from './helpers.js'

interface HttpResult {
  readonly status: number
  readonly headers: IncomingHttpHeaders
  readonly body: Buffer
}

function request(port: number, options: {
  readonly method?: string
  readonly path: string
  readonly headers?: Record<string, string>
  readonly body?: Buffer
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
        body: Buffer.concat(chunks),
      }))
    })
    outgoing.once('error', reject)
    if (options.body !== undefined) outgoing.write(options.body)
    outgoing.end()
  })
}

const AUTH_HEADERS = {
  host: 'dsh.example.com',
  'cf-access-jwt-assertion': 'valid-test-token',
}

describe('HTTP gateway', () => {
  const upstreams: ReturnType<typeof createServer>[] = []
  const gateways: RunningGateway[] = []

  afterEach(async () => {
    await Promise.all(gateways.splice(0).map(gateway => gateway.close()))
    await Promise.all(upstreams.splice(0).map(close))
  })

  it('transparently proxies paths and hardens responses without logging query data', async () => {
    let seenHeaders: IncomingHttpHeaders = {}
    const upstream = createServer((incoming, response) => {
      seenHeaders = incoming.headers
      response.writeHead(200, { 'content-type': 'text/javascript', server: 'fake-dsh' })
      response.end('asset-body')
    })
    upstreams.push(upstream)
    const logs = capturedLogs()
    const gateway = await startGateway(testConfig(await listen(upstream)), {
      authenticator: acceptingAuthenticator,
      logger: logs.logger,
    })
    gateways.push(gateway)
    const port = (gateway.server.address() as AddressInfo).port

    const result = await request(port, {
      path: '/assets/app.js?private=session-id',
      headers: {
        ...AUTH_HEADERS,
        cookie: 'CF_Authorization=edge-secret; dsh=kept',
        authorization: 'Bearer edge-secret',
        'cf-connecting-ip': '203.0.113.10',
      },
    })

    expect(result.status).toBe(200)
    expect(result.body.toString()).toBe('asset-body')
    expect(result.headers.server).toBeUndefined()
    expect(result.headers['x-frame-options']).toBe('DENY')
    expect(seenHeaders.host).toMatch(/^127\.0\.0\.1:\d+$/)
    expect(seenHeaders.cookie).toBe('dsh=kept')
    expect(seenHeaders.authorization).toBeUndefined()
    expect(seenHeaders['cf-access-jwt-assertion']).toBeUndefined()
    expect(seenHeaders['cf-connecting-ip']).toBeUndefined()
    expect(logs.info.some(entry => entry.path === '/assets/app.js')).toBe(true)
    expect(JSON.stringify(logs)).not.toContain('session-id')
    expect(JSON.stringify(logs)).not.toContain('edge-secret')
  })

  it('streams a large API body and normalizes Origin for the DSH loopback fence', async () => {
    const body = Buffer.alloc(2 * 1024 * 1024, 0x61)
    let received = 0
    let seenOrigin: string | undefined
    const upstream = createServer((incoming, response) => {
      seenOrigin = typeof incoming.headers.origin === 'string' ? incoming.headers.origin : undefined
      incoming.on('data', chunk => { received += Buffer.byteLength(chunk) })
      incoming.once('end', () => {
        response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="result.bin"' })
        response.end(body)
      })
    })
    upstreams.push(upstream)
    const gateway = await startGateway(testConfig(await listen(upstream)), {
      authenticator: acceptingAuthenticator,
      logger: capturedLogs().logger,
    })
    gateways.push(gateway)
    const port = (gateway.server.address() as AddressInfo).port

    const result = await request(port, {
      method: 'POST',
      path: '/api/upload',
      headers: {
        ...AUTH_HEADERS,
        origin: 'https://dsh.example.com',
        'content-type': 'multipart/form-data; boundary=test',
        'content-length': String(body.length),
      },
      body,
    })

    expect(result.status).toBe(200)
    expect(received).toBe(body.length)
    expect(result.body).toEqual(body)
    expect(result.headers['content-disposition']).toBe('attachment; filename="result.bin"')
    expect(result.headers['cache-control']).toBe('no-store')
    expect(seenOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  }, 30_000)

  it('records a redacted API upstream status so a 503 can be attributed', async () => {
    const upstream = createServer((_incoming, response) => {
      response.writeHead(503, { 'content-type': 'text/plain' })
      response.end('internal detail that must not be logged')
    })
    upstreams.push(upstream)
    const logs = capturedLogs()
    const gateway = await startGateway(testConfig(await listen(upstream)), {
      authenticator: acceptingAuthenticator,
      logger: logs.logger,
    })
    gateways.push(gateway)
    const port = (gateway.server.address() as AddressInfo).port

    const result = await request(port, {
      method: 'POST',
      path: '/api/session.history?session=private-session-id',
      headers: {
        ...AUTH_HEADERS,
        origin: 'https://dsh.example.com',
        'content-type': 'application/json',
      },
      body: Buffer.from('{"private":"request-content"}'),
    })

    expect(result.status).toBe(503)
    expect(logs.warn).toContainEqual({
      event: 'http_upstream_response', method: 'POST', path: '/api/session.history', status: 503,
    })
    expect(JSON.stringify(logs)).not.toContain('private-session-id')
    expect(JSON.stringify(logs)).not.toContain('request-content')
    expect(JSON.stringify(logs)).not.toContain('internal detail')
  })

  it('streams the plugin EventSource channel without buffering or path filtering', async () => {
    let releaseSecondEvent: (() => void) | undefined
    const secondEventGate = new Promise<void>((resolve) => { releaseSecondEvent = resolve })
    let seenUrl: string | undefined
    let seenLastEventId: string | undefined
    const upstream = createServer((incoming, response) => {
      seenUrl = incoming.url
      seenLastEventId = typeof incoming.headers['last-event-id'] === 'string'
        ? incoming.headers['last-event-id']
        : undefined
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      response.flushHeaders()
      response.write('event: graph\ndata: {"rev":1}\n\n')
      void secondEventGate.then(() => {
        response.end('event: rebuilt\ndata: {"id":"plugin"}\n\n')
      })
    })
    upstreams.push(upstream)
    const logs = capturedLogs()
    const gateway = await startGateway(testConfig(await listen(upstream)), {
      authenticator: acceptingAuthenticator,
      logger: logs.logger,
    })
    gateways.push(gateway)
    const port = (gateway.server.address() as AddressInfo).port

    let ended = false
    let received = ''
    let firstResponseHeaders: IncomingHttpHeaders = {}
    let resolveFirstEvent: (() => void) | undefined
    const firstEvent = new Promise<void>((resolve) => { resolveFirstEvent = resolve })
    const completed = new Promise<void>((resolve, reject) => {
      const outgoing = httpRequest({
        host: '127.0.0.1',
        port,
        path: '/plugins/events?rev=private-revision',
        headers: { ...AUTH_HEADERS, 'last-event-id': '41' },
      }, (response) => {
        firstResponseHeaders = response.headers
        response.on('data', (chunk) => {
          received += Buffer.from(chunk).toString('utf8')
          if (received.includes('event: graph')) resolveFirstEvent?.()
        })
        response.once('end', () => {
          ended = true
          resolve()
        })
        response.once('error', reject)
      })
      outgoing.once('error', reject)
      outgoing.end()
    })

    await firstEvent
    expect(ended).toBe(false)
    expect(received).toContain('event: graph')
    expect(firstResponseHeaders['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(firstResponseHeaders['cache-control']).toBe('no-cache')
    expect(firstResponseHeaders['x-frame-options']).toBe('DENY')
    expect(seenUrl).toBe('/plugins/events?rev=private-revision')
    expect(seenLastEventId).toBe('41')
    expect(logs.info.some(entry => entry.path === '/plugins/events')).toBe(true)
    expect(JSON.stringify(logs)).not.toContain('private-revision')

    releaseSecondEvent?.()
    await completed
    expect(received).toContain('event: rebuilt')
  })

  it('rejects missing authentication and cross-site requests before DSH', async () => {
    let upstreamRequests = 0
    const upstream = createServer((_incoming, response) => {
      upstreamRequests += 1
      response.writeHead(204).end()
    })
    upstreams.push(upstream)
    const gateway = await startGateway(testConfig(await listen(upstream)), {
      authenticator: acceptingAuthenticator,
      logger: capturedLogs().logger,
    })
    gateways.push(gateway)
    const port = (gateway.server.address() as AddressInfo).port

    const unauthenticated = await request(port, { path: '/', headers: { host: 'dsh.example.com' } })
    const crossSite = await request(port, {
      method: 'POST',
      path: '/api/session/create',
      headers: {
        ...AUTH_HEADERS,
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
    })
    const wrongHost = await request(port, { path: '/', headers: { ...AUTH_HEADERS, host: 'evil.example' } })

    expect(unauthenticated.status).toBe(401)
    expect(crossSite.status).toBe(403)
    expect(wrongHost.status).toBe(403)
    expect(upstreamRequests).toBe(0)
  })

  it('keeps health checks on a separate loopback listener', async () => {
    const upstream = createServer((_incoming, response) => response.end())
    upstreams.push(upstream)
    const gateway = await startGateway(testConfig(await listen(upstream)), {
      authenticator: acceptingAuthenticator,
      logger: capturedLogs().logger,
    })
    gateways.push(gateway)
    const healthPort = (gateway.healthServer.address() as AddressInfo).port
    const result = await request(healthPort, { path: '/healthz' })
    expect(result.status).toBe(200)
    expect(result.body.toString()).toBe('{"status":"ok"}\n')
  })

  it('returns a redacted 502 when DSH is unavailable', async () => {
    const reserve = createServer()
    const unavailablePort = await listen(reserve)
    await close(reserve)
    const gateway = await startGateway(testConfig(unavailablePort), {
      authenticator: acceptingAuthenticator,
      logger: capturedLogs().logger,
    })
    gateways.push(gateway)
    const port = (gateway.server.address() as AddressInfo).port
    const result = await request(port, { path: '/', headers: AUTH_HEADERS })
    expect(result.status).toBe(502)
    expect(result.body.toString()).toBe('bad gateway')
  })
})

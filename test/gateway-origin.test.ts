import { createServer, request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { acceptingAuthenticator, capturedLogs, close, listen, testConfig } from './helpers.js'
import { startGateway } from '../src/gateway.js'
import type { RunningGateway } from '../src/gateway.js'
import { createPublicOriginController } from '../src/public-origin.js'
import type { PublicOriginProvider } from '../src/public-origin.js'

interface HttpResult {
  readonly status: number
  readonly headers: IncomingHttpHeaders
  readonly body: string
}

const AUTH = { 'cf-access-jwt-assertion': 'valid-test-token' }

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

describe('gateway runtime public origin', () => {
  const upstreams: ReturnType<typeof createServer>[] = []
  const gateways: RunningGateway[] = []
  const clients: WebSocket[] = []

  afterEach(async () => {
    for (const client of clients.splice(0)) client.terminate()
    await Promise.all(gateways.splice(0).map(gateway => gateway.close()))
    await Promise.all(upstreams.splice(0).map(close))
  })

  async function startWithProvider(provider: PublicOriginProvider): Promise<number> {
    const upstream = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('upstream-ok')
    })
    upstreams.push(upstream)
    const gateway = await startGateway(testConfig(await listen(upstream)), {
      authenticator: acceptingAuthenticator,
      logger: capturedLogs().logger,
      publicOriginProvider: provider,
    })
    gateways.push(gateway)
    return (gateway.server.address() as AddressInfo).port
  }

  it('rejects every external request while CLOSED (503, not a Host skip)', async () => {
    const controller = createPublicOriginController()
    const port = await startWithProvider(controller)

    const page = await request(port, { path: '/', headers: { host: 'dsh.example.com', accept: 'text/html' } })
    expect(page.status).toBe(503)
    expect(page.body).toBe('unavailable')
    expect(page.headers['content-type']).toContain('text/plain')

    const api = await request(port, {
      method: 'POST',
      path: '/api/session/create',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'content-type': 'application/json',
      },
      body: '{}',
    })
    expect(api.status).toBe(503)

    const evilHost = await request(port, { path: '/', headers: { host: 'evil.example' } })
    expect(evilHost.status).toBe(503)
  })

  it('rejects WebSocket upgrades while CLOSED', async () => {
    const controller = createPublicOriginController()
    const port = await startWithProvider(controller)
    const client = new WebSocket(`ws://127.0.0.1:${String(port)}/api/events.mux`, {
      origin: 'https://dsh.example.com',
      headers: { host: 'dsh.example.com', 'cf-access-jwt-assertion': 'valid-test-token' },
    })
    clients.push(client)
    const error = await new Promise<Error>((resolve) => client.once('error', resolve))
    expect(error.message).toContain('503')
  })

  it('opens with the exact runtime origin and rejects everything else', async () => {
    const controller = createPublicOriginController()
    const port = await startWithProvider(controller)
    controller.set(new URL('https://abc.trycloudflare.com'))

    const accepted = await request(port, { path: '/', headers: { host: 'abc.trycloudflare.com', ...AUTH } })
    expect(accepted.status).toBe(200)
    expect(accepted.body).toBe('upstream-ok')

    const otherHost = await request(port, { path: '/', headers: { host: 'other.trycloudflare.com', ...AUTH } })
    expect(otherHost.status).toBe(403)

    const wrongOrigin = await request(port, {
      method: 'POST',
      path: '/api/x',
      headers: {
        host: 'abc.trycloudflare.com',
        origin: 'https://dsh.example.com',
        'content-type': 'application/json',
        ...AUTH,
      },
      body: '{}',
    })
    expect(wrongOrigin.status).toBe(403)
  })

  it('replaces the origin atomically and immediately rejects the old one', async () => {
    const controller = createPublicOriginController()
    const port = await startWithProvider(controller)
    controller.set(new URL('https://old.trycloudflare.com'))
    expect((await request(port, { path: '/', headers: { host: 'old.trycloudflare.com', ...AUTH } })).status).toBe(200)

    controller.set(new URL('https://new.trycloudflare.com'))
    expect((await request(port, { path: '/', headers: { host: 'old.trycloudflare.com', ...AUTH } })).status).toBe(403)
    expect((await request(port, { path: '/', headers: { host: 'new.trycloudflare.com', ...AUTH } })).status).toBe(200)
  })

  it('closes again after clear()', async () => {
    const controller = createPublicOriginController()
    const port = await startWithProvider(controller)
    controller.set(new URL('https://abc.trycloudflare.com'))
    expect((await request(port, { path: '/', headers: { host: 'abc.trycloudflare.com', ...AUTH } })).status).toBe(200)

    controller.clear()
    expect((await request(port, { path: '/', headers: { host: 'abc.trycloudflare.com', ...AUTH } })).status).toBe(503)
  })

  it('keeps the V1 static origin behavior when no provider is given', async () => {
    const upstream = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('upstream-ok')
    })
    upstreams.push(upstream)
    const gateway = await startGateway(testConfig(await listen(upstream)), {
      authenticator: acceptingAuthenticator,
      logger: capturedLogs().logger,
    })
    gateways.push(gateway)
    const port = (gateway.server.address() as AddressInfo).port

    // testConfig.publicOrigin is https://dsh.example.com.
    expect((await request(port, { path: '/', headers: { host: 'dsh.example.com', ...AUTH } })).status).toBe(200)
    expect((await request(port, { path: '/', headers: { host: 'evil.example', ...AUTH } })).status).toBe(403)
  })

  it('denies the management prefix from the public entry even with valid auth', async () => {
    const upstream = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('upstream-ok')
    })
    upstreams.push(upstream)
    const config = { ...testConfig(await listen(upstream)), deniedPublicPaths: ['/api/dsh-remote'] }
    const gateway = await startGateway(config, {
      authenticator: acceptingAuthenticator,
      logger: capturedLogs().logger,
      publicOriginProvider: { get: () => new URL('https://dsh.example.com') },
    })
    gateways.push(gateway)
    const port = (gateway.server.address() as AddressInfo).port

    const denied = await request(port, {
      method: 'POST',
      path: '/api/dsh-remote.status',
      headers: {
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'content-type': 'application/json',
        ...AUTH,
      },
      body: '{}',
    })
    expect(denied.status).toBe(404)

    // The ordinary surface still proxies.
    const ok = await request(port, { path: '/', headers: { host: 'dsh.example.com', ...AUTH } })
    expect(ok.status).toBe(200)

    // A prefix sibling that is NOT denied still proxies.
    const sibling = await request(port, { path: '/api/other', headers: { host: 'dsh.example.com', ...AUTH } })
    expect(sibling.status).toBe(200)
  })

  it('exposes the actual bound ports when configured with OS-assigned ports', async () => {
    const upstream = createServer((_request, response) => {
      response.writeHead(204)
      response.end()
    })
    upstreams.push(upstream)
    const gateway = await startGateway(testConfig(await listen(upstream)), {
      authenticator: acceptingAuthenticator,
      logger: capturedLogs().logger,
      publicOriginProvider: { get: () => new URL('https://dsh.example.com') },
    })
    gateways.push(gateway)
    expect(gateway.port).toBe((gateway.server.address() as AddressInfo).port)
    expect(gateway.healthPort).toBe((gateway.healthServer.address() as AddressInfo).port)
  })
})

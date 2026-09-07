import { createServer } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket, { WebSocketServer } from 'ws'
import { startGateway } from '../src/gateway.js'
import type { RunningGateway } from '../src/gateway.js'
import { acceptingAuthenticator, capturedLogs, close, listen, testConfig } from './helpers.js'

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once('message', data => resolve(data.toString()))
    socket.once('error', reject)
  })
}

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
}

describe('WebSocket gateway', () => {
  const upstreams: ReturnType<typeof createServer>[] = []
  const gateways: RunningGateway[] = []
  const clients: WebSocket[] = []

  afterEach(async () => {
    for (const client of clients.splice(0)) client.terminate()
    await Promise.all(gateways.splice(0).map(gateway => gateway.close()))
    await Promise.all(upstreams.splice(0).map(close))
  })

  it('authenticates the upgrade, rewrites trust headers, and carries frames', async () => {
    let seenHeaders: IncomingHttpHeaders = {}
    const upstream = createServer()
    const websocketServer = new WebSocketServer({ noServer: true })
    upstream.on('upgrade', (request, socket, head) => {
      seenHeaders = request.headers
      websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        websocket.send('server-frame')
      })
    })
    upstreams.push(upstream)
    const upstreamPort = await listen(upstream)
    const gateway = await startGateway(testConfig(upstreamPort), {
      authenticator: acceptingAuthenticator,
      logger: capturedLogs().logger,
    })
    gateways.push(gateway)
    const gatewayPort = (gateway.server.address() as AddressInfo).port
    const client = new WebSocket(`ws://127.0.0.1:${String(gatewayPort)}/api/events.mux`, {
      origin: 'https://dsh.example.com',
      headers: {
        host: 'dsh.example.com',
        'cf-access-jwt-assertion': 'valid-test-token',
        cookie: 'CF_Authorization=secret; dsh=kept',
      },
    })
    clients.push(client)
    const message = nextMessage(client)
    await opened(client)
    expect(await message).toBe('server-frame')
    expect(seenHeaders.host).toBe(`127.0.0.1:${String(upstreamPort)}`)
    expect(seenHeaders.origin).toBe(`http://127.0.0.1:${String(upstreamPort)}`)
    expect(seenHeaders['cf-access-jwt-assertion']).toBeUndefined()
    expect(seenHeaders.cookie).toBe('dsh=kept')
    websocketServer.close()
  })

  it('rejects a cross-site upgrade before it reaches DSH', async () => {
    let upgrades = 0
    const upstream = createServer()
    upstream.on('upgrade', (_request, socket) => {
      upgrades += 1
      socket.destroy()
    })
    upstreams.push(upstream)
    const gateway = await startGateway(testConfig(await listen(upstream)), {
      authenticator: acceptingAuthenticator,
      logger: capturedLogs().logger,
    })
    gateways.push(gateway)
    const gatewayPort = (gateway.server.address() as AddressInfo).port
    const client = new WebSocket(`ws://127.0.0.1:${String(gatewayPort)}/api/events.host`, {
      origin: 'https://evil.example',
      headers: {
        host: 'dsh.example.com',
        'cf-access-jwt-assertion': 'valid-test-token',
      },
    })
    clients.push(client)
    const error = await new Promise<Error>((resolve) => client.once('error', resolve))
    expect(error.message).toContain('403')
    expect(upgrades).toBe(0)
  })
})

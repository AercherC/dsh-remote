import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Authenticator } from '../src/auth.js'
import type { GatewayConfig } from '../src/config.js'
import type { GatewayLogger, LogFields } from '../src/logger.js'

export async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  return (server.address() as AddressInfo).port
}

export async function close(server: Server): Promise<void> {
  if (!server.listening) return
  const closed = new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  server.closeAllConnections()
  await closed
}

export const acceptingAuthenticator: Authenticator = {
  async authenticate(headers) {
    if (headers['cf-access-jwt-assertion'] !== 'valid-test-token') throw new Error('denied')
    return { subject: 'test-subject' }
  },
}

export interface CapturedLogs {
  readonly info: LogFields[]
  readonly warn: LogFields[]
  readonly logger: GatewayLogger
}

export function capturedLogs(): CapturedLogs {
  const info: LogFields[] = []
  const warn: LogFields[] = []
  return {
    info,
    warn,
    logger: {
      info(fields) { info.push(fields) },
      warn(fields) { warn.push(fields) },
    },
  }
}

export function testConfig(upstreamPort: number): GatewayConfig {
  return {
    listenHost: '127.0.0.1',
    port: 0,
    healthPort: 0,
    upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
    publicOrigin: new URL('https://dsh.example.com'),
    auth: {
      mode: 'cloudflare-access',
      issuer: new URL('https://test.cloudflareaccess.com'),
      audience: 'test-audience',
      allowedEmails: new Set(['owner@example.com']),
    },
  }
}

export function emptyServer(): Server {
  return createServer((_request, response) => {
    response.writeHead(204)
    response.end()
  })
}

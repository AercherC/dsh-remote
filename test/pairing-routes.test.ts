import { createServer, request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createPairingService } from '../src/pairing.js'
import type { PairingService } from '../src/pairing.js'
import { createDeviceSessionStore } from '../src/device-session.js'
import type { DeviceSessionStore } from '../src/device-session.js'
import { createPairingRoutes } from '../src/pairing-routes.js'
import type { PairingGithubRoutes, PairingRoutes } from '../src/pairing-routes.js'
import { createLongPairingStore } from '../src/pairing-long.js'
import type { LongPairingStore } from '../src/pairing-long.js'
import { capturedLogs, close, listen } from './helpers.js'
import type { CapturedLogs } from './helpers.js'

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

describe('pairing routes', () => {
  let current = 1_700_000_000_000
  const now = (): number => current
  const servers: ReturnType<typeof createServer>[] = []
  const logs: CapturedLogs[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close))
  })

  async function setup(overrides: Record<string, unknown> = {}): Promise<{
    port: number
    pairing: PairingService
    sessions: DeviceSessionStore
  }> {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-pairing-routes-test-'))
    const sessions = await createDeviceSessionStore({
      file: join(dir, 'state.json'),
      now,
      ...(typeof overrides.maxDevices === 'number' ? { maxDevices: overrides.maxDevices } : {}),
      ...(typeof overrides.ttlMs === 'number' ? { ttlMs: overrides.ttlMs } : {}),
    })
    const pairing = createPairingService({
      now,
      ...(typeof overrides.claimRateLimit === 'number' ? { claimRateLimit: overrides.claimRateLimit } : {}),
    })
    const captured = capturedLogs()
    logs.push(captured)
    const routes: PairingRoutes = createPairingRoutes({
      pairing,
      sessions,
      sessionTtlMs: 30 * 24 * 60 * 60_000,
      logger: captured.logger,
      now: () => new Date(current),
      ...(typeof overrides.resolveAuthRoot === 'function' ? { resolveAuthRoot: overrides.resolveAuthRoot as () => string | undefined } : {}),
    })
    const server = createServer((request, response) => {
      void routes.handle(request, response).then(handled => {
        if (!handled) {
          response.writeHead(404, { 'content-type': 'text/plain' })
          response.end('not handled')
        }
      })
    })
    servers.push(server)
    const port = await listen(server)
    return { port, pairing, sessions }
  }

  it('serves the pairing page with hardened headers, inline-only resources, and no secret in the source', async () => {
    const { port } = await setup()
    const result = await request(port, { path: '/pair' })
    expect(result.status).toBe(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(result.headers['x-frame-options']).toBe('DENY')
    expect(result.headers['x-content-type-options']).toBe('nosniff')
    expect(result.headers['referrer-policy']).toBe('no-referrer')
    expect(result.headers['content-security-policy']).toContain("default-src 'none'")
    expect(result.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(result.headers['content-security-policy']).toContain("connect-src 'self'")
    expect(result.body).toContain('设备配对')
    // No EXTERNAL resources: the fragment auto-claim is an inline script only.
    expect(result.body).not.toContain('https://')
    expect(result.body).not.toContain('src=')
    expect(result.body).not.toContain('href=')
    // The claim surface exists and never embeds a real secret.
    expect(result.body).toContain('pair/claim')
    expect(result.body).toContain('history.replaceState')
    expect(result.body).not.toContain('secret-value')
    expect(result.body).not.toContain('localStorage')
  })

  it('rejects a GET claim and any query-string credential', async () => {
    const { port, pairing } = await setup()
    const ticket = pairing.issue()
    const result = await request(port, { path: `/pair/claim?secret=${ticket.secret}` })
    expect(result.status).toBe(405)
    expect(result.headers.allow).toBe('POST')
    // The ticket was never consumed by the GET.
    expect(pairing.claim(ticket.secret).ok).toBe(true)
  })

  it('requires application/json content type', async () => {
    const { port, pairing } = await setup()
    const ticket = pairing.issue()
    const result = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ secret: ticket.secret }),
    })
    expect(result.status).toBe(415)
  })

  it.each([
    ['malformed json', 'not-json', 'application/json'],
    ['oversized body', JSON.stringify({ secret: `a${'a'.repeat(5000)}` }), 'application/json'],
    ['both credentials', null, 'application/json'],
    ['no credentials', JSON.stringify({}), 'application/json'],
    ['overlong secret', JSON.stringify({ secret: 'a'.repeat(129) }), 'application/json'],
    ['bad code charset', JSON.stringify({ code: 'AB_CD1IL' }), 'application/json'],
  ])('rejects a bad claim request shape (%s)', async (_label, body, contentType) => {
    const { port, pairing } = await setup()
    const ticket = pairing.issue()
    const payload = body === null
      ? JSON.stringify({ secret: ticket.secret, code: ticket.code })
      : body as string
    const result = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': contentType },
      body: payload,
    })
    expect(result.status).toBe(400)
  })

  it('claims with the high-entropy secret and sets a hardened host-only cookie', async () => {
    const { port, pairing } = await setup()
    const ticket = pairing.issue()
    const result = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: ticket.secret, name: '我的手机' }),
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('{"ok":true}')

    const cookies = result.headers['set-cookie']
    expect(Array.isArray(cookies)).toBe(true)
    const cookie = (cookies as string[])[0] ?? ''
    expect(cookie).toMatch(/^dsh_remote_device=[A-Za-z0-9_-]{43}; /)
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Max-Age=2592000')
    expect(cookie).not.toContain('Domain=')

    // The ticket is gone after a successful claim.
    expect(pairing.claim(ticket.secret)).toEqual({ ok: false, reason: 'rejected' })
  })

  it('includes a DSH auth-root redirect when the host resolver is wired', async () => {
    const authRoot = 'https://example.dsh.app/?token=RQaun1za4p4LJKsBbqI8-g'
    const { port, pairing } = await setup({ resolveAuthRoot: () => authRoot })
    const ticket = pairing.issue()
    const result = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: ticket.secret, name: '我的手机' }),
    })
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ ok: true, redirect: authRoot })
  })

  it('omits the redirect field when no DSH auth-root resolver is wired', async () => {
    const { port, pairing } = await setup()
    const ticket = pairing.issue()
    const result = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: ticket.secret, name: '我的手机' }),
    })
    expect(result.status).toBe(200)
    expect(result.body).toBe('{"ok":true}')
  })

  it('claims with the manual code case-insensitively', async () => {
    const { port, pairing } = await setup()
    const ticket = pairing.issue()
    const result = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: ticket.code.toLowerCase() }),
    })
    expect(result.status).toBe(200)
    expect(pairing.claim(ticket.code)).toEqual({ ok: false, reason: 'rejected' })
  })

  it('returns one uniform 403 for unknown, expired, or mismatched credentials', async () => {
    const { port, pairing } = await setup()
    const ticket = pairing.issue()

    const wrong = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'ABCDEFGH' }),
    })
    expect(wrong.status).toBe(403)
    expect(wrong.body).toBe('{"error":"invalid-credential"}')

    current = ticket.expiresAt + 1
    const expired = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: ticket.secret }),
    })
    expect(expired.status).toBe(403)
  })

  it('never locks a shared source; the global claim budget still applies', async () => {
    // R03: behind a Quick Tunnel every public request shares the local
    // cloudflared peer, so repeated failures must NOT lock the real user out
    // for 15 minutes. Only the global short-window rate limit applies.
    const { port, pairing } = await setup({ claimRateLimit: 8 })
    const ticket = pairing.issue()

    for (let i = 0; i < 7; i += 1) {
      const result = await request(port, {
        method: 'POST',
        path: '/pair/claim',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'WRNGCDEX' }),
      })
      expect(result.status).toBe(403)
    }
    // The right code still succeeds (budget not exhausted): no source lock.
    const ok = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: ticket.code }),
    })
    expect(ok.status).toBe(200)

    // Budget exhausted: further attempts are rate limited.
    const rateLimited = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'QWERTYAB' }),
    })
    expect(rateLimited.status).toBe(429)
    expect(rateLimited.body).toBe('{"error":"try-later"}')
  })

  it('refuses new devices once the hard limit is reached', async () => {
    const { port, pairing } = await setup({ maxDevices: 1 })
    const first = pairing.issue()
    const claimed = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: first.secret }),
    })
    expect(claimed.status).toBe(200)

    const second = pairing.issue()
    const refused = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: second.secret }),
    })
    expect(refused.status).toBe(403)
    expect(refused.body).toBe('{"error":"device-limit"}')
  })

  it('never logs secrets, codes, cookies, or token hashes', async () => {
    const { port, pairing } = await setup()
    const ticket = pairing.issue()
    await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'WRNGCDEX' }),
    })
    const success = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: ticket.secret }),
    })
    expect(success.status).toBe(200)
    const serialized = JSON.stringify(logs[logs.length - 1])
    expect(serialized).not.toContain(ticket.secret)
    expect(serialized).not.toContain(ticket.code)
    expect(serialized).not.toContain('WRONGCDE')
    expect(serialized).not.toContain('dsh_remote_device=')
  })
})

describe('pairing routes — GitHub device-flow login (R05)', () => {
  let current = 1_700_000_000_000
  const servers: ReturnType<typeof createServer>[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close))
  })

  function githubStub(overrides: Partial<PairingGithubRoutes> = {}): PairingGithubRoutes {
    return {
      enabled: true,
      start: async () => ({
        flowId: 'flow-1',
        verificationUri: 'https://github.com/login/device',
        userCode: 'ABCD-EFGH',
        expiresAt: current + 600_000,
        intervalMs: 5,
      }),
      poll: async (flowId) => (
        flowId === 'flow-1' ? { status: 'ready', login: 'alice' } : { status: 'not-found' }
      ),
      cancel: async () => true,
      ...overrides,
    }
  }

  async function setup(github?: PairingGithubRoutes): Promise<{ port: number; sessions: DeviceSessionStore }> {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-pairing-github-test-'))
    const sessions = await createDeviceSessionStore({ file: join(dir, 'state.json'), now: () => current })
    const pairing = createPairingService({ now: () => current })
    const routes = createPairingRoutes({
      pairing,
      sessions,
      sessionTtlMs: 30 * 24 * 60 * 60_000,
      logger: capturedLogs().logger,
      now: () => new Date(current),
      ...(github === undefined ? {} : { github }),
    })
    const server = createServer((request, response) => {
      void routes.handle(request, response).then(handled => {
        if (!handled) {
          response.writeHead(404, { 'content-type': 'text/plain' })
          response.end('not handled')
        }
      })
    })
    servers.push(server)
    const port = await listen(server)
    return { port, sessions }
  }

  it('hides the GitHub button when the host did not enable it', async () => {
    const { port } = await setup()
    const page = await request(port, { path: '/pair' })
    expect(page.status).toBe(200)
    expect(page.body).not.toContain('使用 GitHub 登录')
  })

  it('renders the GitHub login button when enabled and serves the flow', async () => {
    const { port } = await setup(githubStub())
    const page = await request(port, { path: '/pair' })
    expect(page.status).toBe(200)
    expect(page.body).toContain('使用 GitHub 登录')
    expect(page.body).toContain('github/start')
    expect(page.body).toContain('github/poll')
    // R06A: the public device-flow phishing warning must be present.
    expect(page.body).toContain('只批准由你本人刚刚在当前设备发起的 GitHub 验证')

    const started = await request(port, {
      method: 'POST',
      path: '/pair/github/start',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(started.status).toBe(200)
    const flow = JSON.parse(started.body) as { flowId: string; userCode: string; verificationUri: string }
    expect(flow.userCode).toBe('ABCD-EFGH')
    expect(flow.verificationUri).toBe('https://github.com/login/device')
  })

  it('mints OUR device session on a ready poll — never a GitHub token', async () => {
    const { port, sessions } = await setup(githubStub())
    const polled = await request(port, {
      method: 'POST',
      path: '/pair/github/poll',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ flowId: 'flow-1' }),
    })
    expect(polled.status).toBe(200)
    expect(polled.body).toContain('"status":"ready"')
    const cookie = (polled.headers['set-cookie'] as string[] | undefined)?.[0] ?? ''
    expect(cookie).toMatch(/^dsh_remote_device=[A-Za-z0-9_-]{43}; /)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    // A real device session was created (revocable like any other).
    const device = (await sessions.list())[0]
    expect(device).toBeDefined()
    expect(device?.name).toBe('GitHub (alice)')
  })

  it('rejects a non-allowed identity with 403 and unknown flows with 404', async () => {
    const { port } = await setup(githubStub({
      poll: async (flowId) => (
        flowId === 'flow-1' ? { status: 'wrong-user' } : { status: 'not-found' }
      ),
    }))
    const wrong = await request(port, {
      method: 'POST',
      path: '/pair/github/poll',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ flowId: 'flow-1' }),
    })
    expect(wrong.status).toBe(403)
    expect(wrong.body).toBe('{"error":"wrong-user"}')

    const missing = await request(port, {
      method: 'POST',
      path: '/pair/github/poll',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ flowId: 'nope' }),
    })
    expect(missing.status).toBe(404)
  })

  it('respects polling cadence states and start rate limiting', async () => {
    const { port } = await setup(githubStub({
      start: async () => ({ error: 'rate-limited' }),
    }))
    const limited = await request(port, {
      method: 'POST',
      path: '/pair/github/start',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(limited.status).toBe(429)
    expect(limited.body).toBe('{"error":"try-later"}')
  })

  it('rejects bad poll payloads and 404s when GitHub is absent', async () => {
    const { port } = await setup(githubStub())
    const bad = await request(port, {
      method: 'POST',
      path: '/pair/github/poll',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(bad.status).toBe(400)

    const without = await setup()
    const absent = await request(without.port, {
      method: 'POST',
      path: '/pair/github/start',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(absent.status).toBe(404)
  })
})

describe('pairing routes — durable long code (D2)', () => {
  let current = 1_700_000_000_000
  const servers: ReturnType<typeof createServer>[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close))
  })

  async function makeLongStore(logs: CapturedLogs): Promise<LongPairingStore> {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-pairing-long-store-'))
    return await createLongPairingStore({
      file: join(dir, 'pairing-long.json'),
      logger: logs.logger,
      now: () => current,
    })
  }

  async function setup(options: {
    readonly long: LongPairingStore
    readonly claimRateLimit?: number
    readonly maxDevices?: number
  }): Promise<{ port: number; sessions: DeviceSessionStore; logs: CapturedLogs }> {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-pairing-long-routes-test-'))
    const sessions = await createDeviceSessionStore({
      file: join(dir, 'state.json'),
      now: () => current,
      ...(options.maxDevices === undefined ? {} : { maxDevices: options.maxDevices }),
    })
    const pairing = createPairingService({
      now: () => current,
      ...(options.claimRateLimit === undefined ? {} : { claimRateLimit: options.claimRateLimit }),
    })
    const captured = capturedLogs()
    const routes = createPairingRoutes({
      pairing,
      sessions,
      sessionTtlMs: 30 * 24 * 60 * 60_000,
      logger: captured.logger,
      now: () => new Date(current),
      long: options.long,
    })
    const server = createServer((request, response) => {
      void routes.handle(request, response).then(handled => {
        if (!handled) {
          response.writeHead(404, { 'content-type': 'text/plain' })
          response.end('not handled')
        }
      })
    })
    servers.push(server)
    const port = await listen(server)
    return { port, sessions, logs: captured }
  }

  function claim(port: number, payload: Record<string, string>): Promise<HttpResult> {
    return request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  it('mints a device session from the long manual code and remains repeatable', async () => {
    const logs = capturedLogs()
    const long = await makeLongStore(logs)
    const credential = await long.rotate()
    const { port, sessions } = await setup({ long })

    const first = await claim(port, { code: credential.code })
    expect(first.status).toBe(200)
    // A long code is NOT consumed: the same credential can pair another
    // device later (each success = one more revocable device session).
    const second = await claim(port, { code: credential.code })
    expect(second.status).toBe(200)
    expect(await sessions.list()).toHaveLength(2)
    // Never logs the credential.
    const serialized = JSON.stringify(logs)
    expect(serialized).not.toContain(credential.code)
    expect(serialized).not.toContain(credential.secret)
  })

  it('mints a device session from the long QR secret too', async () => {
    const long = await makeLongStore(capturedLogs())
    const { secret } = await long.rotate()
    const { port, sessions } = await setup({ long })
    const result = await claim(port, { secret })
    expect(result.status).toBe(200)
    expect(await sessions.list()).toHaveLength(1)
  })

  it('rejects the old credential after rotate with 403 while the fresh one works', async () => {
    const long = await makeLongStore(capturedLogs())
    const first = await long.rotate()
    const { port } = await setup({ long })
    expect((await claim(port, { code: first.code })).status).toBe(200)

    const second = await long.rotate()
    const oldCode = await claim(port, { code: first.code })
    expect(oldCode.status).toBe(403)
    expect(oldCode.body).toBe('{"error":"invalid-credential"}')
    expect((await claim(port, { secret: second.secret })).status).toBe(200)
  })

  it('still claims after a restart that reloads only the digests', async () => {
    const logs = capturedLogs()
    const dir = mkdtempSync(join(tmpdir(), 'dsh-pairing-long-restart-'))
    const file = join(dir, 'pairing-long.json')
    const firstStore = await createLongPairingStore({ file, logger: logs.logger, now: () => current })
    const credential = await firstStore.rotate()
    const restarted = await createLongPairingStore({ file, logger: logs.logger, now: () => current })
    const { port, sessions } = await setup({ long: restarted })
    const result = await claim(port, { code: credential.code })
    expect(result.status).toBe(200)
    expect(await sessions.list()).toHaveLength(1)
  })

  it('a rate-limited window cannot be bypassed through the long code', async () => {
    const long = await makeLongStore(capturedLogs())
    const { secret } = await long.rotate()
    const { port } = await setup({ long, claimRateLimit: 3 })
    for (let i = 0; i < 3; i += 1) {
      const wrong = await claim(port, { code: 'WRNGCDEX' })
      expect(wrong.status).toBe(403)
    }
    // Budget exhausted: even the VALID long code is refused (429) — the
    // fallback deliberately never bypasses the shared short-window budget.
    const valid = await claim(port, { secret })
    expect(valid.status).toBe(429)
    expect(valid.body).toBe('{"error":"try-later"}')
  })

  it('claims a 6-char custom long code over the route (D2.1 custom-code bounds)', async () => {
    const long = await makeLongStore(capturedLogs())
    const { code, secret } = await long.rotate('AB3XY9')
    expect(code).toBe('AB3XY9')
    const { port, sessions } = await setup({ long })
    const byCode = await claim(port, { code })
    expect(byCode.status).toBe(200)
    const bySecret = await claim(port, { secret })
    expect(bySecret.status).toBe(200)
    expect(await sessions.list()).toHaveLength(2)
    // A too-short guess is a malformed request (400), never a credential miss.
    const malformed = await claim(port, { code: 'AB1' })
    expect(malformed.status).toBe(400)
  })

  it('applies the device hard limit to long-code claims', async () => {
    const long = await makeLongStore(capturedLogs())
    const { secret } = await long.rotate()
    const { port } = await setup({ long, maxDevices: 1 })
    expect((await claim(port, { secret })).status).toBe(200)
    const refused = await claim(port, { secret })
    expect(refused.status).toBe(403)
    expect(refused.body).toBe('{"error":"device-limit"}')
  })
})

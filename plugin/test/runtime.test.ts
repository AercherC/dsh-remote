/**
 * Runtime lifecycle + end-to-end pairing through the real loopback gateway.
 *
 * The runtime factory is driven with a fake QuickTunnelService (injected),
 * a fake upstream DSH web server, and a scratch harness home. The final test
 * exercises the FULL loop: enable → rotate ticket → claim over the gateway
 * HTTP surface → device cookie → proxied DSH access → management RPC denied
 * from the public entry.
 */

import { createServer, request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type {
  BinarySource,
  QuickTunnelPhase,
  QuickTunnelService,
  QuickTunnelStatus,
  TunnelErrorCode,
} from '../vendor/dsh-remote-web-gateway/dist/quick-tunnel.js'
import type { GatewayLogger } from '../vendor/dsh-remote-web-gateway/dist/logger.js'

import { resolvePluginConfig } from '../src/config.js'
import { createRemoteRuntime, type RemoteRuntime } from '../src/runtime.js'

const silentLogger: GatewayLogger = { info: () => {}, warn: () => {} }

function makeConfig(): ReturnType<typeof resolvePluginConfig> {
  return resolvePluginConfig({ gatewayPort: 0, healthPort: 0 })
}

/** A temp "installed plugin root" with a package.json the updater can read. */
function pluginRoot(version = '0.2.0-rc.1'): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-root-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-remote-web-gateway', version }))
  return dir
}

/** A fake tunnel the test can flip between phases / status shapes. */
function fakeTunnel(initial: QuickTunnelPhase | Partial<QuickTunnelStatus> = 'idle'): QuickTunnelService {
  let phase = typeof initial === 'string' ? initial : (initial.phase ?? 'idle')
  let publicUrl: string | undefined
  let startedAt: number | undefined
  let errorCode: TunnelErrorCode | undefined
  let binarySource: BinarySource | undefined
  let extra: Partial<QuickTunnelStatus> = {}
  if (typeof initial !== 'string') {
    for (const [key, value] of Object.entries(initial)) {
      if (key === 'phase') continue
      if (value !== undefined) (extra as Record<string, unknown>)[key] = value
    }
  }
  const status = (): QuickTunnelStatus => ({
    phase,
    ...extra,
    ...(publicUrl === undefined ? {} : { publicUrl }),
    ...(errorCode === undefined ? {} : { lastErrorCode: errorCode }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(binarySource === undefined ? {} : { binarySource }),
  })
  return {
    async start() {
      phase = 'ready'
      publicUrl = 'https://abc.trycloudflare.com'
      startedAt = 1000
      binarySource = 'managed-cache'
      return new URL(publicUrl)
    },
    async stop() {
      phase = 'idle'
      publicUrl = undefined
    },
    status,
  }
}

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

describe('remote runtime', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-'))
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('upstream-ok')
  })
  let upstreamPort = 0
  let runtime: RemoteRuntime | undefined
  let tunnel: QuickTunnelService
  const hardened: string[] = []

  beforeAll(async () => {
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    upstreamPort = (upstream.address() as AddressInfo).port
  })

  afterAll(async () => {
    await runtime?.dispose()
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  })

  it('creates the state and cache directories and hardens the plugin root', async () => {
    tunnel = fakeTunnel()
    runtime = await createRemoteRuntime({
      dshHome: home,
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async dir => { hardened.push(dir) },
      tunnelOverride: tunnel,
    })
    expect(existsSync(join(home, 'plugins', 'dsh-remote-web-gateway', 'state'))).toBe(true)
    expect(existsSync(join(home, 'plugins', 'dsh-remote-web-gateway', 'bin', 'cache'))).toBe(true)
    expect(hardened).toEqual([join(home, 'plugins', 'dsh-remote-web-gateway')])
  })

  it('starts OFF: tunnel is never auto-started on plugin load', () => {
    const status = runtime!.status()
    expect(status.available).toBe(true)
    expect(status.enabled).toBe(false)
    expect(status.phase).toBe('idle')
    expect(status.devices).toEqual([])
  })

  it('enable opens the origin; pairing needs a ready tunnel', async () => {
    expect(runtime!.pairingRotate()).toBe('tunnel-not-ready')
    const started = await runtime!.tunnelStart()
    expect(started).toEqual({ ok: true, url: 'https://abc.trycloudflare.com' })
    const status = runtime!.status()
    expect(status.enabled).toBe(true)
    expect(status.publicUrl).toBe('https://abc.trycloudflare.com')
    expect(status.binarySource).toBe('managed-cache')
  })

  it('R06C2: status passes through download progress while the phase is downloading', async () => {
    const progressTunnel = fakeTunnel({
      phase: 'downloading',
      downloadReceivedBytes: 1024 * 1024 * 18,
      downloadTotalBytes: 1024 * 1024 * 55,
      downloadPercent: 33,
      downloadElapsedMs: 42_000,
      downloadSpeedBytesPerSecond: 1_200_000,
      downloadProxySource: 'system',
      downloadProxyDisplay: '127.0.0.1:7890',
      downloadSource: 'official',
    })
    const progressRuntime = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: progressTunnel,
    })
    try {
      const status = progressRuntime.status()
      expect(status.phase).toBe('downloading')
      expect(status.downloadReceivedBytes).toBe(1024 * 1024 * 18)
      expect(status.downloadTotalBytes).toBe(1024 * 1024 * 55)
      expect(status.downloadPercent).toBe(33)
      expect(status.downloadElapsedMs).toBe(42_000)
      expect(status.downloadSpeedBytesPerSecond).toBe(1_200_000)
      // R06C4: the current route/source are surfaced (redacted display only).
      expect(status.downloadProxySource).toBe('system')
      expect(status.downloadProxyDisplay).toBe('127.0.0.1:7890')
      expect(status.downloadSource).toBe('official')
    } finally {
      await progressRuntime.dispose()
    }
  })

  it('E1-A: status passes through the post-ready edge-link diagnostics', async () => {
    const degradedTunnel = fakeTunnel({
      phase: 'ready',
      edgeState: 'degraded',
      edgeDegradedSinceMs: 5_000,
      edgeEvents: [
        { kind: 'degraded', at: 4_000 },
        { kind: 'regained', at: 5_000, degradedMs: 1_000 },
      ],
    })
    const edgeRuntime = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: degradedTunnel,
    })
    try {
      const status = edgeRuntime.status()
      expect(status.phase).toBe('ready')
      expect(status.edgeState).toBe('degraded')
      expect(status.edgeDegradedSinceMs).toBe(5_000)
      expect(status.edgeEvents).toEqual([
        { kind: 'degraded', at: 4_000 },
        { kind: 'regained', at: 5_000, degradedMs: 1_000 },
      ])
    } finally {
      await edgeRuntime.dispose()
    }
  })

  it('D2.1: rotate persists the PLAINTEXT long code (v2); a restart re-reads the SAME code as active', async () => {
    const homeA = mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-'))
    const make = (): Promise<RemoteRuntime> => createRemoteRuntime({
      dshHome: homeA,
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: fakeTunnel(),
    })

    const first = await make()
    let issuedCode = ''
    let issuedSecret = ''
    try {
      // Never auto-minted.
      expect(first.pairingLongStatus()).toEqual({ state: 'none' })
      const rotated = await first.pairingLongRotate()
      expect(typeof rotated).not.toBe('string')
      const issued = rotated as { code: string; secret: string; createdAt: number }
      expect(issued.code).toHaveLength(9)
      issuedCode = issued.code
      issuedSecret = issued.secret
      const view = first.pairingLongStatus()
      if (view.state !== 'active') throw new Error('expected active after rotate')
      expect(view.code).toBe(issuedCode)
      expect(view.secret).toBe(issuedSecret)

      // D2.1: the state file holds the PLAINTEXT (version 2) so the code can
      // be re-displayed after a restart — no digest-only schema anymore.
      const file = join(homeA, 'plugins', 'dsh-remote-web-gateway', 'state', 'pairing-long.json')
      const raw = readFileSync(file, 'utf8')
      expect(raw).toContain(`"version": 2`)
      expect(raw).toContain(issuedCode)
      expect(raw).toContain(issuedSecret)
      expect(raw).not.toContain('codeSha256')
    } finally {
      await first.dispose()
    }

    // Restart on the SAME home: plaintext reloads → active with the SAME code.
    const second = await make()
    try {
      const view = second.pairingLongStatus()
      if (view.state !== 'active') throw new Error('expected active after restart (v2 plaintext)')
      expect(view.code).toBe(issuedCode)
      expect(view.secret).toBe(issuedSecret)
    } finally {
      await second.dispose()
    }
  })

  it('D2.1: custom codes are shape-validated host-side (bad-request) and persisted on success', async () => {
    const homeA = mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-'))
    const runtime = await createRemoteRuntime({
      dshHome: homeA,
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: fakeTunnel(),
    })
    try {
      // Too short / symbols / overlong → bad-request, nothing persisted.
      expect(await runtime.pairingLongRotate('AB1')).toBe('bad-request')
      expect(await runtime.pairingLongRotate('ABC-12')).toBe('bad-request')
      expect(await runtime.pairingLongRotate('AB CD1')).toBe('bad-request')
      expect(await runtime.pairingLongRotate('A'.repeat(13))).toBe('bad-request')
      expect(runtime.pairingLongStatus()).toEqual({ state: 'none' })

      // A valid custom code (mixed case → upper; letters A–Z + digits 0–9,
      // so I/L/O/0/1 are fine for memorable codes) is minted and persisted.
      const rotated = await runtime.pairingLongRotate('ab3xy9')
      expect(typeof rotated).not.toBe('string')
      const issued = rotated as { code: string; secret: string; createdAt: number }
      expect(issued.code).toBe('AB3XY9')
      const digits = await runtime.pairingLongRotate('012345')
      expect(typeof digits).not.toBe('string')
      const digitsIssued = digits as { code: string }
      expect(digitsIssued.code).toBe('012345')
      const view = runtime.pairingLongStatus()
      if (view.state !== 'active') throw new Error('expected active after custom rotate')
      expect(view.code).toBe('012345')

      const file = join(homeA, 'plugins', 'dsh-remote-web-gateway', 'state', 'pairing-long.json')
      const raw = readFileSync(file, 'utf8')
      expect(raw).toContain('012345')
    } finally {
      await runtime.dispose()
    }
  })

  it('R06C4: network config defaults come from the plugin config and persist through the RPC', async () => {
    const fresh = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: resolvePluginConfig({ downloadNetwork: 'direct', downloadSource: 'mirror' }),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: fakeTunnel(),
    })
    try {
      expect(await fresh.networkConfigGet()).toEqual({ network: 'direct', source: 'mirror' })
      const set = await fresh.networkConfigSet({ network: 'custom', source: 'official', customProxyUrl: 'http://127.0.0.1:7890' })
      expect(set).toEqual({ ok: true })
      expect(await fresh.networkConfigGet()).toEqual({
        network: 'custom', source: 'official', customProxyUrl: 'http://127.0.0.1:7890',
      })
    } finally {
      await fresh.dispose()
    }
  })

  it('R06C4: network config REJECTS credential-bearing custom proxy URLs (never persisted)', async () => {
    const fresh = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: fakeTunnel(),
    })
    try {
      const bad = await fresh.networkConfigSet({
        network: 'custom', source: 'auto', customProxyUrl: 'http://user:secret@127.0.0.1:7890',
      })
      expect(bad).toEqual({ ok: false, errorCode: 'bad-request' })
      // The persisted state is untouched — defaults, and no secret anywhere.
      expect(await fresh.networkConfigGet()).toEqual({ network: 'auto', source: 'auto' })
      const invalidMode = await fresh.networkConfigSet({ network: 'turbo', source: 'auto' })
      expect(invalidMode).toEqual({ ok: false, errorCode: 'bad-request' })
    } finally {
      await fresh.dispose()
    }
  })

  it('issues a one-time ticket usable only by secret or code', async () => {
    const ticket = runtime!.pairingRotate()
    expect(typeof ticket).not.toBe('string')
    const t = ticket as { secret: string; code: string; expiresAt: number }
    expect(t.secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(t.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(t.expiresAt).toBeGreaterThan(Date.now())
  })

  it('R06C4B: pairingStatus is READ-ONLY — repeated reads never create or change the ticket', () => {
    const first = runtime!.pairingStatus()
    expect(first.state).toBe('active')
    if (first.state !== 'active') return
    for (let i = 0; i < 5; i += 1) {
      expect(runtime!.pairingStatus()).toEqual(first)
    }
    // The ticket count is unchanged by any number of reads.
    expect(runtime!.status().enabled).toBe(true)
  })

  it('R06C4B: status() never carries pairing secrets (read surfaces are separate)', () => {
    const status = runtime!.status()
    expect('secret' in status).toBe(false)
    expect('code' in status).toBe(false)
    expect(status.devices).toEqual([])
  })

  it('R06C4B: enable mints exactly ONE initial ticket; stop clears it; restart mints a NEW one', async () => {
    const fresh = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: fakeTunnel(),
    })
    try {
      expect(fresh.pairingStatus()).toEqual({ state: 'none' })
      await fresh.tunnelStart()
      const first = fresh.pairingStatus()
      expect(first.state).toBe('active')
      if (first.state !== 'active') return
      await fresh.tunnelStop()
      expect(fresh.pairingStatus()).toEqual({ state: 'none' })
      await fresh.tunnelStart()
      const second = fresh.pairingStatus()
      expect(second.state).toBe('active')
      if (second.state === 'active' && first.state === 'active') {
        // Restart is a NEW lifecycle: the initial ticket must be a fresh one.
        expect(second.id).not.toBe(first.id)
        expect(second.code).not.toBe(first.code)
      }
    } finally {
      await fresh.dispose()
    }
  })

  it('R06C4B: HTTP claim flips pairingStatus to consumed (no secret/code); generate mints a fresh ticket', async () => {
    const fresh = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: fakeTunnel(),
    })
    try {
      const port = fresh.gatewayPort
      const host = 'abc.trycloudflare.com'
      await fresh.tunnelStart()
      const initial = fresh.pairingStatus()
      expect(initial.state).toBe('active')
      if (initial.state !== 'active') return

      const claim = await request(port, {
        method: 'POST',
        path: '/pair/claim',
        headers: { host, origin: `https://${host}`, 'content-type': 'application/json' },
        body: JSON.stringify({ code: initial.code }),
      })
      expect(claim.status).toBe(200)

      const consumed = fresh.pairingStatus()
      expect(consumed.state).toBe('consumed')
      if (consumed.state === 'consumed') {
        expect(consumed.id).toBe(initial.id)
        expect('secret' in consumed).toBe(false)
        expect('code' in consumed).toBe(false)
      }
      // Consumed stays consumed across reads — no auto-refresh, no revival.
      expect(fresh.pairingStatus().state).toBe('consumed')

      // The user's explicit generate action mints a fresh active ticket.
      const rotated = fresh.pairingRotate()
      expect(typeof rotated).not.toBe('string')
      const next = fresh.pairingStatus()
      expect(next.state).toBe('active')
      if (next.state === 'active') expect(next.id).not.toBe(initial.id)
    } finally {
      await fresh.dispose()
    }
  })

  it('R06C4B: revoke/revokeAll never create, revive or mutate the pairing ticket', async () => {
    const fresh = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: fakeTunnel(),
    })
    try {
      const port = fresh.gatewayPort
      const host = 'abc.trycloudflare.com'
      await fresh.tunnelStart()
      const initial = fresh.pairingStatus()
      expect(initial.state).toBe('active')
      if (initial.state !== 'active') return

      // Claim to mint a device AND consume the ticket.
      const claim = await request(port, {
        method: 'POST',
        path: '/pair/claim',
        headers: { host, origin: `https://${host}`, 'content-type': 'application/json' },
        body: JSON.stringify({ code: initial.code }),
      })
      expect(claim.status).toBe(200)
      const devices = fresh.deviceList()
      expect(devices).toHaveLength(1)
      const afterClaim = fresh.pairingStatus()
      expect(afterClaim.state).toBe('consumed')

      // Revoking the device must not create a ticket or revive the consumed one.
      const revoked = await fresh.deviceRevoke(devices[0]!.id)
      expect(revoked).toEqual({ ok: true, revoked: true })
      expect(fresh.deviceList()).toEqual([])
      expect(fresh.pairingStatus()).toEqual(afterClaim)

      // Explicit generate → fresh active ticket.
      const rotated = fresh.pairingRotate()
      expect(typeof rotated).not.toBe('string')
      const active = fresh.pairingStatus()
      expect(active.state).toBe('active')

      // revokeAll with a live ticket: the active ticket stays untouched.
      expect(await fresh.deviceRevokeAll()).toEqual({ ok: true })
      expect(fresh.pairingStatus()).toEqual(active)
    } finally {
      await fresh.dispose()
    }
  })

  it('R06C4B: expiry flips pairingStatus to expired with NO secret/code (host-authoritative)', async () => {
    let fakeNow = 1_700_000_000_000
    const fresh = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: resolvePluginConfig({ ticketTtlMs: 60_000 }),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: fakeTunnel(),
      now: () => fakeNow,
    })
    try {
      expect(fresh.pairingStatus()).toEqual({ state: 'none' })
      await fresh.tunnelStart()
      const active = fresh.pairingStatus()
      expect(active.state).toBe('active')
      if (active.state !== 'active') return
      fakeNow = active.expiresAt + 1
      const expired = fresh.pairingStatus()
      expect(expired.state).toBe('expired')
      if (expired.state === 'expired') {
        expect(expired.id).toBe(active.id)
        expect('secret' in expired).toBe(false)
        expect('code' in expired).toBe(false)
      }
      // Repeated reads stay expired — no auto-refresh, no drift to none.
      expect(fresh.pairingStatus().state).toBe('expired')
    } finally {
      await fresh.dispose()
    }
  })

  it('R06C4D: the initial ticket is issued only after confirmed ready, never at hostname-acquired', async () => {
    let phase: QuickTunnelPhase = 'idle'
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const tunnel: QuickTunnelService = {
      async start() {
        phase = 'connecting' // hostname acquired, edge not ready
        await gate
        phase = 'ready'
        return new URL('https://abc.trycloudflare.com')
      },
      async stop() { phase = 'idle' },
      status: () => ({ phase }),
    }
    const fresh = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: tunnel,
    })
    try {
      const started = fresh.tunnelStart()
      // While "connecting": no initial ticket may exist (its TTL must not
      // start burning before the tunnel is actually reachable).
      expect(fresh.pairingStatus()).toEqual({ state: 'none' })
      expect(fresh.status().enabled).toBe(false)
      release()
      await started
      expect(fresh.pairingStatus().state).toBe('active')
      expect(fresh.status().enabled).toBe(true)
    } finally {
      await fresh.dispose()
    }
  })

  it('R06C4D: readiness failure fails closed — no ticket, tunnel never marked ready', async () => {
    const tunnel: QuickTunnelService = {
      async start() {
        const err = new Error('edge readiness timeout') as Error & { code?: string }
        err.code = 'start-timeout'
        throw err
      },
      async stop() {},
      status: () => ({ phase: 'error', lastErrorCode: 'start-timeout' }),
    }
    const fresh = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: tunnel,
    })
    try {
      const result = await fresh.tunnelStart()
      expect(result).toEqual({ ok: false, errorCode: 'start-timeout' })
      expect(fresh.pairingStatus()).toEqual({ state: 'none' })
      expect(fresh.status().enabled).toBe(false)
    } finally {
      await fresh.dispose()
    }
  })

  it('R06C4D: restart re-runs the readiness cycle and mints a fresh initial ticket', async () => {
    let phase: QuickTunnelPhase = 'idle'
    const gates: Array<() => void> = []
    const tunnel: QuickTunnelService = {
      async start() {
        phase = 'connecting'
        await new Promise<void>((resolve) => { gates.push(resolve) })
        phase = 'ready'
        return new URL('https://abc.trycloudflare.com')
      },
      async stop() { phase = 'idle' },
      status: () => ({ phase }),
    }
    const fresh = await createRemoteRuntime({
      dshHome: mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-')),
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: tunnel,
    })
    try {
      const first = fresh.tunnelStart()
      expect(fresh.pairingStatus()).toEqual({ state: 'none' })
      gates[0]!()
      await first
      const t1 = fresh.pairingStatus()
      expect(t1.state).toBe('active')
      await fresh.tunnelStop()
      expect(fresh.pairingStatus()).toEqual({ state: 'none' })

      const second = fresh.tunnelStart()
      expect(fresh.pairingStatus()).toEqual({ state: 'none' })
      gates[1]!()
      await second
      const t2 = fresh.pairingStatus()
      expect(t2.state).toBe('active')
      if (t1.state === 'active' && t2.state === 'active') {
        expect(t2.id).not.toBe(t1.id)
      }
    } finally {
      await fresh.dispose()
    }
  })

  it('dispose stops the tunnel and closes the gateway', async () => {
    await runtime!.dispose()
    expect(tunnel.status().phase).toBe('idle')
  })

  it('full public flow: claim → device cookie → proxied DSH, management denied', async () => {
    const fresh = await createRemoteRuntime({
      dshHome: home,
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger: silentLogger,
      pluginRootDir: pluginRoot(),
      hardenDir: async () => {},
      tunnelOverride: fakeTunnel(),
    })
    runtime = fresh
    const port = fresh.gatewayPort
    const publicHost = 'abc.trycloudflare.com'

    await fresh.tunnelStart()
    const ticket = fresh.pairingRotate() as { code: string }

    // The /pair page is served by the gateway (not DSH).
    const pairPage = await request(port, { path: '/pair', headers: { host: publicHost, accept: 'text/html' } })
    expect([200, 401]).toContain(pairPage.status)
    expect(pairPage.body).toContain('pair/claim')

    // Claim with the manual code → device cookie.
    const claim = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: {
        host: publicHost,
        origin: `https://${publicHost}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code: ticket.code }),
    })
    expect(claim.status).toBe(200)
    const setCookie = claim.headers['set-cookie']
    expect(setCookie).toBeDefined()
    const cookieHeader = Array.isArray(setCookie)
      ? setCookie.map(c => c.split(';')[0]).join('; ')
      : String(setCookie).split(';')[0]

    // The same ticket is one-time: a second claim fails.
    const second = await request(port, {
      method: 'POST',
      path: '/pair/claim',
      headers: { host: publicHost, origin: `https://${publicHost}`, 'content-type': 'application/json' },
      body: JSON.stringify({ code: ticket.code }),
    })
    expect(second.status).toBe(403)

    // The device cookie reaches DSH through the proxy.
    const page = await request(port, {
      path: '/',
      headers: { host: publicHost, cookie: cookieHeader },
    })
    expect(page.status).toBe(200)
    expect(page.body).toBe('upstream-ok')

    // The management channel is denied from the public entry even with a
    // valid device session.
    const denied = await request(port, {
      method: 'POST',
      path: '/dsh-remote/status',
      headers: { host: publicHost, origin: `https://${publicHost}`, 'content-type': 'application/json', cookie: cookieHeader },
      body: '{}',
    })
    expect(denied.status).toBe(404)

    // Without a cookie the DSH surface is refused.
    const unauth = await request(port, { path: '/', headers: { host: publicHost } })
    expect(unauth.status).toBe(401)

    await fresh.dispose()
  })

})

describe('remote runtime tunnel error mapping (R06C)', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-remote-plugin-home-err-'))
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('upstream-ok')
  })
  let upstreamPort = 0

  beforeAll(async () => {
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    upstreamPort = (upstream.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  })

  it('maps a raw numeric DOMException code (e.g. AbortError) to internal, never leaks it, and logs the cause', async () => {
    const warns: unknown[] = []
    const logger: GatewayLogger = { info: () => {}, warn: (fields) => { warns.push(fields) } }
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    // DOMException has a NUMERIC `.code` (20 for AbortError) — the old mapping
    // read it as the plugin error code and leaked `20` onto the wire.
    expect(abortError.code).toBe(20)
    const failingTunnel: QuickTunnelService = {
      async start() { throw abortError },
      async stop() {},
      status: () => ({ phase: 'error', lastErrorCode: 'internal' }),
    }
    const runtime = await createRemoteRuntime({
      dshHome: home,
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger,
      pluginRootDir: pluginRoot(),
      tunnelOverride: failingTunnel,
    })
    const result = await runtime.tunnelStart()
    expect(result).toEqual({ ok: false, errorCode: 'internal' })
    // The real cause was logged locally for diagnostics, not shown to the user.
    expect(warns.some(w => String((w as { cause?: unknown }).cause).includes('aborted'))).toBe(true)
    await runtime.dispose()
  })

  it('passes through a stable TunnelStartError code unchanged', async () => {
    const logger: GatewayLogger = { info: () => {}, warn: () => {} }
    const failingTunnel: QuickTunnelService = {
      async start() {
        const err = new Error('cloudflared download failed') as Error & { code?: string }
        err.code = 'download-failed'
        throw err
      },
      async stop() {},
      status: () => ({ phase: 'error', lastErrorCode: 'download-failed' }),
    }
    const runtime = await createRemoteRuntime({
      dshHome: home,
      upstream: new URL(`http://127.0.0.1:${String(upstreamPort)}`),
      config: makeConfig(),
      logger,
      pluginRootDir: pluginRoot(),
      tunnelOverride: failingTunnel,
    })
    const result = await runtime.tunnelStart()
    expect(result).toEqual({ ok: false, errorCode: 'download-failed' })
    await runtime.dispose()
  })
})

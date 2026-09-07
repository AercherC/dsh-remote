import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cloudflaredAssetFor,
  CLOUDFLARED_ASSETS,
  CLOUDFLARED_PINNED_VERSION,
  isRunnableAsset,
  managedBinaryName,
  pinnedDownloadUrl,
} from '../src/cloudflared-assets.js'
import {
  classifyEdgeLogSignal,
  cloudflaredConfigCandidates,
  createQuickTunnelService,
  defaultDownloadBinary,
  downloadWithNetworkRoutes,
  hasTunnelReadySignal,
  parseTunnelUrl,
  pathCandidateVersionOk,
  TunnelStartError,
} from '../src/quick-tunnel.js'
import type { ProcessLike, QuickTunnelService, QuickTunnelStatus } from '../src/quick-tunnel.js'

interface FakeRecord {
  readonly emitter: EventEmitter
  readonly stdout: EventEmitter
  readonly stderr: EventEmitter
  readonly bin: string
  readonly args: string[]
  killCount: number
}

function fakeSpawnFactory(): {
  spawn: (bin: string, args: string[]) => ProcessLike
  spawned: FakeRecord[]
} {
  const spawned: FakeRecord[] = []
  const spawn = (bin: string, args: string[]): ProcessLike => {
    const emitter = new EventEmitter()
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    const record: FakeRecord = { emitter, stdout, stderr, bin, args, killCount: 0 }
    const fake = {
      stdout: {
        on: (event: string, cb: (chunk: string | Buffer) => void) => { stdout.on(event, cb); return fake },
        off: (event: string, cb: (chunk: string | Buffer) => void) => { stdout.off(event, cb); return fake },
      },
      stderr: {
        on: (event: string, cb: (chunk: string | Buffer) => void) => { stderr.on(event, cb); return fake },
        off: (event: string, cb: (chunk: string | Buffer) => void) => { stderr.off(event, cb); return fake },
      },
      on: (event: string, cb: (...args: unknown[]) => void) => { emitter.on(event, cb); return fake },
      once: (event: string, cb: (...args: unknown[]) => void) => { emitter.once(event, cb); return fake },
      kill: () => { record.killCount += 1; return true },
      killed: false,
    } as unknown as ProcessLike & { killed: boolean }
    spawned.push(record)
    return fake
  }
  return { spawn, spawned }
}

const directories: string[] = []

/**
 * R06C4D: the Edge-readiness signal, in the real 2026.8.2 log shape
 * (captured on Windows — see the R06C4D report). Tests that previously
 * treated "hostname acquired" as ready must emit this line too.
 */
const READY_LOG_LINE = '2026-08-19T14:25:11Z INF Registered tunnel connection connIndex=0 connection=test-conn-0000'

function cacheDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-quick-tunnel-test-'))
  directories.push(dir)
  writeFileSync(join(dir, 'cloudflared.exe'), 'fake-binary')
  return dir
}

afterEach(() => {
  for (const dir of directories.splice(0)) {
    try { writeFileSync(join(dir, 'cloudflared.exe'), 'fake-binary') } catch { /* ignore */ }
  }
})

/** The injected spawn is async (binary resolution runs first); poll for it. */
async function until(fn: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (fn()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('condition not met within timeout')
}

async function setup(options: { timeoutMs?: number } = {}): Promise<{
  service: QuickTunnelService
  spawned: FakeRecord[]
  readyUrls: string[]
  closedCount: () => number
}> {
  const { spawn, spawned } = fakeSpawnFactory()
  const readyUrls: string[] = []
  let closed = 0
  const service = createQuickTunnelService({
    cacheDir: cacheDir(),
    gatewayPort: 8787,
    startTimeoutMs: options.timeoutMs ?? 2_000,
    spawn,
    verifyBinary: async () => {},
    downloadBinary: async () => { throw new Error('should never download in tests') },
    configPreflight: async () => {},
    onReady: url => { readyUrls.push(url.origin) },
    onClosed: () => { closed += 1 },
  })
  return { service, spawned, readyUrls, closedCount: () => closed }
}

describe('parseTunnelUrl', () => {
  it('accepts a plain trycloudflare https origin', () => {
    expect(parseTunnelUrl('Visit it at https://abc-123.trycloudflare.com.')?.host).toBe('abc-123.trycloudflare.com')
  })

  it.each([
    'https://evil.example',
    'http://abc.trycloudflare.com',
    'https://trycloudflare.com',
    'https://abc.trycloudflare.com:8443',
    'https://abc.trycloudflare.com/path',
    'https://abc.trycloudflare.com?x=1',
    'https://abc.trycloudflare.com#frag',
    'https://user@abc.trycloudflare.com',
  ])('rejects an invalid or truncated URL (%s)', (text) => {
    expect(parseTunnelUrl(text)).toBeUndefined()
  })
})

describe('pinned cloudflared asset table', () => {
  it('pins the verified 2026.8.2 release with the official windows-amd64 hash', () => {
    expect(CLOUDFLARED_PINNED_VERSION).toBe('2026.8.2')
    const win = CLOUDFLARED_ASSETS['win32-x64']
    expect(win).toBeDefined()
    expect(win!.assetName).toBe('cloudflared-windows-amd64.exe')
    expect(win!.sha256).toBe('c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5')
    expect(win!.sizeBytes).toBe(54_893_480)
    expect(win!.kind).toBe('exe')
  })

  it('maps every supported host pair to a real official asset with a hash', () => {
    for (const key of ['win32-x64', 'win32-ia32', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-ia32', 'linux-arm', 'linux-arm64']) {
      const asset = cloudflaredAssetFor(key.split('-')[0]!, key.split('-')[1]!)
      expect(asset.assetName).toMatch(/^cloudflared-/)
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(asset.sizeBytes).toBeGreaterThan(1_000_000)
    }
  })

  it('fails closed for an unknown platform/arch instead of guessing a filename', () => {
    expect(() => cloudflaredAssetFor('win32', 'arm64')).toThrow(/not supported/)
    expect(() => cloudflaredAssetFor('freebsd', 'x64')).toThrow(/not supported/)
  })

  it('flags .tgz darwin assets as not runnable DIRECTLY (they are extracted first)', () => {
    expect(isRunnableAsset(cloudflaredAssetFor('win32', 'x64'))).toBe(true)
    expect(isRunnableAsset(cloudflaredAssetFor('linux', 'arm64'))).toBe(true)
    // darwin .tgz is not directly runnable — it is extracted into `cloudflared`.
    expect(isRunnableAsset(cloudflaredAssetFor('darwin', 'arm64'))).toBe(false)
  })

  it('builds the exact-version download URL (never releases/latest)', () => {
    const url = pinnedDownloadUrl(cloudflaredAssetFor('win32', 'x64'))
    expect(url).toBe('https://github.com/cloudflare/cloudflared/releases/download/2026.8.2/cloudflared-windows-amd64.exe')
    expect(url).not.toContain('/latest/download')
  })

  it('names the managed cache file with the platform extension', () => {
    expect(managedBinaryName('win32')).toBe('cloudflared.exe')
    expect(managedBinaryName('linux')).toBe('cloudflared')
  })

  it('lists the standard user config candidates without touching them', () => {
    const candidates = cloudflaredConfigCandidates()
    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) expect(candidate).toBeTruthy()
  })
})

describe('QuickTunnelService', () => {
  it('re-verifies a cached binary on every start and tags its source', async () => {
    const { spawn, spawned } = fakeSpawnFactory()
    let verifies = 0
    const service = createQuickTunnelService({
      cacheDir: cacheDir(),
      gatewayPort: 8787,
      startTimeoutMs: 2_000,
      spawn,
      verifyBinary: async () => { verifies += 1 },
      downloadBinary: async () => { throw new Error('should never download in tests') },
      configPreflight: async () => {},
    })
    const pending = service.start()
    await until(() => spawned.length > 0)
    expect(verifies).toBe(1) // the cached binary was checked before use
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE) // R06C4D: edge readiness
    await pending
    expect(service.status().binarySource).toBe('managed-cache')
  })

  it('rejects a corrupt cache: deletes it, never executes it, and re-downloads', async () => {
    const { spawn, spawned } = fakeSpawnFactory()
    let downloadCalled = false
    const downloads: string[] = []
    const service = createQuickTunnelService({
      cacheDir: cacheDir(),
      gatewayPort: 8787,
      startTimeoutMs: 2_000,
      spawn,
      verifyBinary: async () => { throw new Error('corrupt cache') },
      downloadBinary: async (_dir, dest) => {
        downloadCalled = true
        downloads.push(dest)
        writeFileSync(dest, 'fresh-binary')
      },
      configPreflight: async () => {},
    })
    const pending = service.start()
    await until(() => spawned.length > 0)
    expect(downloadCalled).toBe(true)
    expect(service.status().phase).toBe('starting')
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE) // R06C4D: edge readiness
    await pending
    expect(service.status().binarySource).toBe('downloaded')
  })

  it('fails closed with a config-conflict code when a user Cloudflare config exists', async () => {
    const service = createQuickTunnelService({
      cacheDir: cacheDir(),
      gatewayPort: 8787,
      startTimeoutMs: 2_000,
      spawn: ((_bin: string, _args: string[]) => { throw new Error('must not spawn') }) as unknown as (bin: string, args: string[]) => ProcessLike,
      verifyBinary: async () => {},
      downloadBinary: async () => { throw new Error('must not download') },
      configPreflight: async () => {
        throw new TunnelStartError('config-conflict', 'existing config detected; nothing was modified')
      },
    })
    await expect(service.start()).rejects.toMatchObject({ code: 'config-conflict' })
    expect(service.status().phase).toBe('error')
    expect(service.status().lastErrorCode).toBe('config-conflict')
  })

  it('records stable error codes, never raw paths, in status', async () => {
    const { service, spawned } = await setup({ timeoutMs: 200 })
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.emitter.emit('exit', 1, null)
    await expect(pending).rejects.toThrow()
    const status = service.status()
    expect(status.phase).toBe('error')
    expect(status.lastErrorCode).toBe('exit-before-ready')
    expect(JSON.stringify(status)).not.toMatch(/[A-Za-z]:[\\/]/) // no filesystem path leaks
  })

  it('starts, discovers a valid URL, and opens the origin', async () => {
    const { service, spawned, readyUrls } = await setup()
    const pending = service.start()
    await until(() => spawned.length > 0)
    const proc = spawned[0]!
    expect(proc.args).toEqual([
      'tunnel', '--url', 'http://127.0.0.1:8787', '--protocol', 'http2', '--no-autoupdate',
    ])
    proc.stdout.emit('data', 'Your quick Tunnel has been created! Visit it at (trycloudflare.com): ')
    proc.stdout.emit('data', 'https://abc-123.trycloudflare.com')
    // R06C4D: the hostname alone is only `connecting` — the Edge must confirm
    // the connector route before `ready`.
    expect(service.status().phase).toBe('connecting')
    expect(service.status().publicUrl).toBe('https://abc-123.trycloudflare.com')
    expect(readyUrls).toHaveLength(0)
    proc.stderr.emit('data', READY_LOG_LINE)
    const url = await pending
    expect(url.host).toBe('abc-123.trycloudflare.com')
    expect(service.status().phase).toBe('ready')
    expect(service.status().publicUrl).toBe('https://abc-123.trycloudflare.com')
    expect(readyUrls).toEqual(['https://abc-123.trycloudflare.com'])
  })

  it('never opens the origin for an invalid or malicious URL', async () => {
    const { service, spawned, readyUrls } = await setup({ timeoutMs: 200 })
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://evil.example says hi')
    spawned[0]!.stderr.emit('data', 'http://abc.trycloudflare.com')
    await expect(pending).rejects.toThrow(/timeout|publish a tunnel URL/)
    expect(readyUrls).toHaveLength(0)
    expect(service.status().phase).toBe('error')
  })

  it('times out, errors, and leaves the origin closed', async () => {
    const { service, closedCount } = await setup({ timeoutMs: 200 })
    await expect(service.start()).rejects.toThrow(/timeout/)
    expect(closedCount()).toBe(0) // never opened, so nothing to close
    expect(service.status().phase).toBe('error')
    expect(service.status().lastErrorCode).toBeTruthy()
  })

  it('closes the origin immediately when the process crashes after ready', async () => {
    const { service, spawned, closedCount } = await setup()
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    await pending
    expect(service.status().phase).toBe('ready')
    expect(closedCount()).toBe(0)

    spawned[0]!.emitter.emit('exit', 1, null)
    expect(closedCount()).toBe(1)
    expect(service.status().phase).toBe('error')
    expect(service.status().publicUrl).toBeUndefined()
  })

  it('stops: closes the origin first, terminates the process, returns to idle', async () => {
    const { service, spawned, closedCount } = await setup()
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    await pending

    const stopping = service.stop()
    expect(closedCount()).toBe(1) // origin closed BEFORE the process dies
    spawned[0]!.emitter.emit('exit', 0, null)
    await stopping
    expect(spawned[0]!.killCount).toBeGreaterThanOrEqual(1)
    expect(service.status().phase).toBe('idle')
    expect(service.status().publicUrl).toBeUndefined()
  })

  it('single-flights concurrent start calls: only one spawn', async () => {
    const { service, spawned } = await setup()
    const first = service.start()
    const second = service.start()
    await until(() => spawned.length > 0)
    expect(spawned).toHaveLength(1)
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    await expect(first).resolves.toMatchObject({ host: 'abc.trycloudflare.com' })
    await expect(second).resolves.toMatchObject({ host: 'abc.trycloudflare.com' })
  })

  it('handles repeated stop safely', async () => {
    const { service } = await setup()
    await service.stop()
    await service.stop()
    expect(service.status().phase).toBe('idle')
  })

  it('start during stopping spawns no orphan and eventually opens', async () => {
    const { service, spawned } = await setup()
    const first = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://one.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    await first

    const stopping = service.stop()
    spawned[0]!.emitter.emit('exit', 0, null)
    const second = service.start() // while stop is still settling
    await until(() => spawned.length > 1)
    expect(spawned).toHaveLength(2)
    spawned[1]!.stdout.emit('data', 'https://two.trycloudflare.com')
    spawned[1]!.stderr.emit('data', READY_LOG_LINE)
    await expect(second).resolves.toMatchObject({ host: 'two.trycloudflare.com' })
    await stopping
    expect(service.status().phase).toBe('ready')
  })
})

describe('E1-A post-ready edge-link watch (transient loss → regain)', () => {
  // Real 2026.8.2 output captured on 2026-09-07 while a live tunnel was
  // suspended to simulate a transient outage (console INF/ERR shape).
  const LOST_LINE = '2026-09-07T06:48:43Z INF Lost connection with the edge'
  const LOST_JSON = '{"level":"info","connIndex":0,"time":"2026-09-07T06:48:43Z","message":"Lost connection with the edge"}'
  const RETRY_LINE = '2026-09-07T06:48:43Z INF Retrying connection in up to 1s'
  const SERVE_ERROR_LINE = '2026-09-07T06:48:43Z ERR event=0 ip=198.41.200.113 connIndex=0 error="connection with edge closed" message="Serve tunnel error"'
  const TERMINATED_LINE = '2026-09-07T06:48:44Z ERR error="connection with edge closed" connIndex=0 message="Connection terminated"'
  const REGAIN_LINE = '2026-09-07T06:48:52Z INF Registered tunnel connection connIndex=0 connection=db3f2c3e-818c-44d3-93c3-a6f56c229d6c location=sjc05 ip=198.41.200.113 protocol=http2 event=0'

  it('classifies real cloudflared 2026.8.2 loss/regain output (console + JSON logfile shapes)', () => {
    expect(classifyEdgeLogSignal(LOST_LINE)).toBe('lost')
    expect(classifyEdgeLogSignal(LOST_JSON)).toBe('lost')
    expect(classifyEdgeLogSignal(RETRY_LINE)).toBe('lost')
    expect(classifyEdgeLogSignal(SERVE_ERROR_LINE)).toBe('lost')
    expect(classifyEdgeLogSignal(TERMINATED_LINE)).toBe('lost')
    expect(classifyEdgeLogSignal(REGAIN_LINE)).toBe('regained')
    expect(classifyEdgeLogSignal(READY_LOG_LINE)).toBe('regained')
    // Startup/metrics noise must never flip the edge state.
    expect(classifyEdgeLogSignal('Starting metrics server on 127.0.0.1:20241/metrics')).toBeUndefined()
    expect(classifyEdgeLogSignal('Your quick Tunnel has been created! Visit it at (trycloudflare.com): https://abc-123.trycloudflare.com')).toBeUndefined()
    expect(classifyEdgeLogSignal('INF precheck component="TCP Connectivity" target=region1.v2.argotunnel.com status=pass')).toBeUndefined()
    // A regain in the same output burst wins over surrounding loss lines.
    expect(classifyEdgeLogSignal(`${LOST_LINE}\n${REGAIN_LINE}`)).toBe('regained')
  })

  async function reachReady(service: QuickTunnelService, spawned: FakeRecord[]): Promise<void> {
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://abc-123.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    await pending
  }

  it('records a transient loss as degraded WITHOUT closing the origin (phase stays ready, URL unchanged)', async () => {
    const { service, spawned, readyUrls, closedCount } = await setup()
    await reachReady(service, spawned)
    expect(closedCount()).toBe(0)
    expect(readyUrls).toEqual(['https://abc-123.trycloudflare.com'])

    spawned[0]!.stderr.emit('data', LOST_LINE)
    const status = service.status()
    expect(status.phase).toBe('ready')
    expect(status.publicUrl).toBe('https://abc-123.trycloudflare.com')
    expect(status.edgeState).toBe('degraded')
    expect(typeof status.edgeDegradedSinceMs).toBe('number')
    // Fail-closed stays reserved for process exit/stop: a live process holds
    // the SAME URL, so a loss is expected to self-heal in-process.
    expect(closedCount()).toBe(0)
    expect(readyUrls).toHaveLength(1)
  })

  it('recovers to ok on a later Registered line and records the degraded window', async () => {
    const { service, spawned, closedCount } = await setup()
    await reachReady(service, spawned)
    spawned[0]!.stderr.emit('data', LOST_LINE)
    expect(service.status().edgeState).toBe('degraded')
    const before = service.status().edgeEvents ?? []

    spawned[0]!.stderr.emit('data', REGAIN_LINE)
    const status = service.status()
    expect(status.phase).toBe('ready')
    expect(status.edgeState).toBe('ok')
    expect(status.edgeDegradedSinceMs).toBeUndefined()
    const events = status.edgeEvents ?? []
    expect(events).toHaveLength(before.length + 1)
    const last = events[events.length - 1]!
    expect(last.kind).toBe('regained')
    expect(typeof last.degradedMs).toBe('number')
    expect(closedCount()).toBe(0)
  })

  it('does not double-count repeated loss lines nor regain while already ok', async () => {
    const { service, spawned } = await setup()
    await reachReady(service, spawned)
    spawned[0]!.stderr.emit('data', LOST_LINE)
    spawned[0]!.stderr.emit('data', LOST_JSON)
    spawned[0]!.stderr.emit('data', RETRY_LINE)
    let events = service.status().edgeEvents ?? []
    expect(events.map(event => event.kind)).toEqual(['degraded'])

    spawned[0]!.stderr.emit('data', REGAIN_LINE)
    spawned[0]!.stderr.emit('data', REGAIN_LINE) // already ok: no-op
    spawned[0]!.stdout.emit('data', READY_LOG_LINE) // same line through stdout: still no-op
    events = service.status().edgeEvents ?? []
    expect(events.map(event => event.kind)).toEqual(['degraded', 'regained'])
    expect(service.status().edgeState).toBe('ok')
  })

  it('process exit during a degraded window still fail-closes exactly once (crash semantics preserved)', async () => {
    const { service, spawned, closedCount } = await setup()
    await reachReady(service, spawned)
    spawned[0]!.stderr.emit('data', LOST_LINE)
    expect(service.status().edgeState).toBe('degraded')
    expect(closedCount()).toBe(0)

    spawned[0]!.emitter.emit('exit', 1, null)
    expect(closedCount()).toBe(1)
    expect(service.status().phase).toBe('error')
    expect(service.status().lastErrorCode).toBe('connection-lost')
    expect(service.status().publicUrl).toBeUndefined()
  })

  it('stop() clears the edge diagnostics with the tunnel state', async () => {
    const { service, spawned, closedCount } = await setup()
    await reachReady(service, spawned)
    spawned[0]!.stderr.emit('data', LOST_LINE)
    expect(service.status().edgeState).toBe('degraded')

    const stopping = service.stop()
    expect(closedCount()).toBe(1) // stop still closes the origin first
    spawned[0]!.emitter.emit('exit', 0, null)
    await stopping
    const status = service.status()
    expect(status.phase).toBe('idle')
    expect(status.edgeState).toBeUndefined()
    expect(status.edgeDegradedSinceMs).toBeUndefined()
    expect(status.edgeEvents).toBeUndefined()
  })
})

describe('R06C4D ready-signal matcher', () => {
  it('recognizes the real 2026.8.2 registration line (timestamp/connIndex/uuid are context only)', () => {
    expect(hasTunnelReadySignal('2026-08-19T14:25:11Z INF Registered tunnel connection connIndex=0 connection=445bea13-568e-4fe7-9a65-22acc6d6574f event=0')).toBe(true)
    expect(hasTunnelReadySignal('INF Registered tunnel connection')).toBe(true)
    expect(hasTunnelReadySignal('Registered tunnel connection')).toBe(true)
  })

  it('does not fire on the banner, connector-id, or feature lines', () => {
    expect(hasTunnelReadySignal('Your quick Tunnel has been created! Visit it at (it may take some time to be reachable): https://abc.trycloudflare.com')).toBe(false)
    expect(hasTunnelReadySignal('INF Generated Connector ID: db8203de-6041-4af4-9b41-0d0d57457a81')).toBe(false)
    expect(hasTunnelReadySignal('INF Requesting new quick Tunnel on trycloudflare.com...')).toBe(false)
    expect(hasTunnelReadySignal('ERR Failed to fetch features, default to disable')).toBe(false)
  })
})

describe('R06C4D tunnel readiness gate', () => {
  it('hostname acquired but edge not ready → phase stays connecting (NOT ready), no origin open', async () => {
    const { service, spawned, readyUrls } = await setup()
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'Your quick Tunnel has been created! https://abc.trycloudflare.com')
    // Give the (absent) ready signal a moment; the phase must remain connecting.
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(service.status().phase).toBe('connecting')
    expect(service.status().publicUrl).toBe('https://abc.trycloudflare.com')
    expect(readyUrls).toHaveLength(0) // onReady/onClosed: the origin is still closed
    // Clean up: stop aborts the (60s) readiness wait.
    const stopping = service.stop()
    spawned[0]!.emitter.emit('exit', 0, null)
    await stopping
    await expect(pending).rejects.toThrow()
    expect(service.status().phase).toBe('idle')
  })

  it('multiple connection-registration lines transition to ready exactly once', async () => {
    const { service, spawned, readyUrls } = await setup()
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    spawned[0]!.stderr.emit('data', '2026-08-19T14:25:12Z INF Registered tunnel connection connIndex=1 connection=conn-two')
    spawned[0]!.stderr.emit('data', '2026-08-19T14:25:13Z INF Registered tunnel connection connIndex=2 connection=conn-three')
    await pending
    expect(service.status().phase).toBe('ready')
    expect(readyUrls).toEqual(['https://abc.trycloudflare.com'])
  })

  it('repeated hostname lines never duplicate the readiness transition', async () => {
    const { service, spawned, readyUrls } = await setup()
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'banner: https://abc.trycloudflare.com')
    spawned[0]!.stdout.emit('data', 'again: https://abc.trycloudflare.com')
    expect(service.status().phase).toBe('connecting')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    await pending
    expect(service.status().phase).toBe('ready')
    expect(readyUrls).toEqual(['https://abc.trycloudflare.com'])
  })

  it('ready timeout fails closed: error phase, child killed, origin closed, start rejected', async () => {
    const { spawn, spawned } = fakeSpawnFactory()
    let closed = 0
    const service = createQuickTunnelService({
      cacheDir: cacheDir(),
      gatewayPort: 8787,
      startTimeoutMs: 2_000,
      readyTimeoutMs: 150,
      spawn,
      verifyBinary: async () => {},
      downloadBinary: async () => { throw new Error('should never download in tests') },
      configPreflight: async () => {},
      onClosed: () => { closed += 1 },
    })
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    await expect(pending).rejects.toMatchObject({ code: 'start-timeout' })
    expect(service.status().phase).toBe('error')
    expect(service.status().lastErrorCode).toBe('start-timeout')
    expect(service.status().publicUrl).toBeUndefined()
    expect(spawned[0]!.killCount).toBeGreaterThanOrEqual(1)
    // The origin never opened (onReady never fired) → nothing to close.
    expect(closed).toBe(0)
  })

  it('cloudflared exit during connecting fails closed and can never flip to ready', async () => {
    const { service, spawned, readyUrls } = await setup()
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    expect(service.status().phase).toBe('connecting')
    spawned[0]!.emitter.emit('exit', 1, null)
    await expect(pending).rejects.toMatchObject({ code: 'exit-before-ready' })
    expect(service.status().phase).toBe('error')
    expect(service.status().publicUrl).toBeUndefined()
    expect(readyUrls).toHaveLength(0)
    // A ready-signal line arriving after the exit must not flip anything.
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    expect(service.status().phase).toBe('error')
  })

  it('stop during waiting-ready aborts: idle, start rejected, no late ready, no ticket surface', async () => {
    const { service, spawned, readyUrls } = await setup()
    const pending = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    expect(service.status().phase).toBe('connecting')
    const stopping = service.stop()
    expect(spawned[0]!.killCount).toBeGreaterThanOrEqual(1)
    spawned[0]!.emitter.emit('exit', 0, null)
    await stopping
    expect(service.status().phase).toBe('idle')
    await expect(pending).rejects.toThrow()
    // A ready-signal line arriving after the stop must never flip to ready.
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    expect(service.status().phase).toBe('idle')
    expect(service.status().publicUrl).toBeUndefined()
    expect(readyUrls).toHaveLength(0)
  })

  it('controlled fixture (R06C4D §23): hostname at 100ms → connecting window → ready signal at 2000ms', async () => {
    const { service, spawned, readyUrls } = await setup({ timeoutMs: 10_000 })
    const pending = service.start()
    await until(() => spawned.length > 0)
    const proc = spawned[0]!
    setTimeout(() => proc.stdout.emit('data', 'Your quick Tunnel has been created! https://abc.trycloudflare.com'), 100)
    setTimeout(() => proc.stderr.emit('data', READY_LOG_LINE), 2_000)
    // Mid-window: hostname known, phase connecting, no ticket surface, no ready.
    await new Promise(resolve => setTimeout(resolve, 700))
    expect(service.status().phase).toBe('connecting')
    expect(service.status().publicUrl).toBe('https://abc.trycloudflare.com')
    expect(readyUrls).toHaveLength(0)
    // After the ready signal: ready exactly once.
    await pending
    expect(service.status().phase).toBe('ready')
    expect(readyUrls).toEqual(['https://abc.trycloudflare.com'])
    proc.emitter.emit('exit', 0, null)
    await service.stop()
    expect(service.status().phase).toBe('idle')
  })
})

describe('PATH cloudflared trust gate (R05)', () => {
  it('recognizes a real cloudflared version line and rejects impostors', () => {
    expect(pathCandidateVersionOk('cloudflared version 2026.8.2 (built 2026-08-14T04:22 UTC)')).toBe(true)
    expect(pathCandidateVersionOk('cloudflared version 2026.8.2')).toBe(true)
    expect(pathCandidateVersionOk('not-cloudflared version 1.2.3')).toBe(false)
    expect(pathCandidateVersionOk('cloudflared version')).toBe(false)
    expect(pathCandidateVersionOk('')).toBe(false)
  })

  it('never executes an untrusted PATH candidate: falls back to the managed pinned binary', async () => {
    const { spawn, spawned } = fakeSpawnFactory()
    const dir = cacheDir()
    const managed = join(dir, 'cloudflared.exe')
    const readyUrls: string[] = []
    let verifiedPathCandidate = ''
    const service = createQuickTunnelService({
      cacheDir: dir,
      gatewayPort: 8787,
      startTimeoutMs: 2_000,
      spawn,
      verifyBinary: async () => {},
      downloadBinary: async () => { throw new Error('should never download') },
      configPreflight: async () => {},
      // A malicious/unsigned fake on PATH:
      pathProbe: async () => 'C:\\fake\\cloudflared.exe',
      verifyPathCandidate: async (path) => {
        verifiedPathCandidate = path
        return false // unsigned/malicious → rejected
      },
      onReady: url => { readyUrls.push(url.origin) },
    })
    const url = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    await expect(url).resolves.toMatchObject({ host: 'abc.trycloudflare.com' })
    expect(verifiedPathCandidate).toBe('C:\\fake\\cloudflared.exe')
    // The spawned binary is the MANAGED cached binary, never the PATH fake.
    expect(spawned[0]!.bin).toBe(managed)
    expect(service.status().binarySource).toBe('managed-cache')
    // The PATH candidate's absolute path never leaks into status.
    expect(JSON.stringify(service.status())).not.toContain('fake')
  })

  it('executes a PATH candidate that passes the trust gate', async () => {
    const { spawn, spawned } = fakeSpawnFactory()
    const service = createQuickTunnelService({
      cacheDir: cacheDir(),
      gatewayPort: 8787,
      startTimeoutMs: 2_000,
      spawn,
      verifyBinary: async () => {},
      downloadBinary: async () => { throw new Error('should never download') },
      configPreflight: async () => {},
      pathProbe: async () => 'C:\\official\\cloudflared.exe',
      verifyPathCandidate: async () => true,
    })
    const url = service.start()
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    await expect(url).resolves.toMatchObject({ host: 'abc.trycloudflare.com' })
    expect(spawned[0]!.bin).toBe('C:\\official\\cloudflared.exe')
    expect(service.status().binarySource).toBe('PATH')
    // The full PATH is never exposed on the status surface.
    expect(JSON.stringify(service.status())).not.toContain('C:\\official')
  })
})

/** Build a fake fetch Response with a controllable ReadableStream body. */
function fakeStreamResponse(
  chunks: Uint8Array[],
  options: { totalBytes?: number; failAt?: number; delayMs?: number; neverClose?: boolean } = {},
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < chunks.length; i += 1) {
        if (options.failAt !== undefined && i === options.failAt) {
          controller.error(new Error('network reset mid-body'))
          return
        }
        controller.enqueue(chunks[i]!)
        if (options.delayMs !== undefined && options.delayMs > 0 && i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, options.delayMs))
        }
      }
      if (!options.neverClose) controller.close()
    },
  })
  const headers = new Headers()
  if (options.totalBytes !== undefined) headers.set('content-length', String(options.totalBytes))
  return { ok: true, status: 200, body: stream, headers } as unknown as Response
}

describe('defaultDownloadBinary (R06C regression: mid-body failure must be download-failed, not internal)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try { writeFileSync(join(dir, 'cloudflared.exe'), 'fake-binary') } catch { /* ignore */ }
    }
    vi.unstubAllGlobals()
  })

  it('maps a mid-body abort (raw AbortError) to the stable download-failed code', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-download-test-'))
    dirs.push(dir)
    // Simulate the R06C real-world failure: the fetch promise resolves but the
    // BODY read aborts (slow link hitting the abort signal). The old code let
    // this raw error escape and the UI showed the generic `internal` code.
    vi.stubGlobal('fetch', vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]))
            controller.error(new DOMException('The operation was aborted', 'AbortError'))
          },
        }),
        headers: new Headers(),
      } as unknown as Response
    }))
    await expect(
      defaultDownloadBinary(dir, join(dir, 'cloudflared.exe'), async () => {}),
    ).rejects.toMatchObject({ code: 'download-failed' })
    // No partial temp file is left behind.
    const { readdir } = await import('node:fs/promises')
    const leftover = (await readdir(dir)).some(name => name.includes('cloudflared.download.'))
    expect(leftover).toBe(false)
  })

  it('maps an HTTP failure to download-failed and preserves the status in the message', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-download-test-'))
    dirs.push(dir)
    vi.stubGlobal('fetch', vi.fn(async () => {
      return { ok: false, status: 503 } as unknown as Response
    }))
    await expect(
      defaultDownloadBinary(dir, join(dir, 'cloudflared.exe'), async () => {}),
    ).rejects.toMatchObject({ code: 'download-failed' })
  })
})

describe('defaultDownloadBinary streaming progress (R06C2)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try { writeFileSync(join(dir, 'cloudflared.exe'), 'fake-binary') } catch { /* ignore */ }
    }
    vi.unstubAllGlobals()
  })

  function tmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-stream-test-'))
    dirs.push(dir)
    return dir
  }

  it('streams a complete body and reports monotonic progress with a known total', async () => {
    const dir = tmpDir()
    const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6, 7, 8, 9])]
    vi.stubGlobal('fetch', vi.fn(async () => fakeStreamResponse(chunks, { totalBytes: 9 })))
    const progress: number[] = []
    const percents: number[] = []
    let verifyCalled = false
    await defaultDownloadBinary(
      dir,
      join(dir, 'cloudflared.exe'),
      async () => { verifyCalled = true },
      (p) => {
        progress.push(p.receivedBytes)
        if (p.percent !== undefined) percents.push(p.percent)
        expect(p.receivedBytes).toBeGreaterThanOrEqual(0)
        if (p.totalBytes !== undefined) expect(p.receivedBytes).toBeLessThanOrEqual(p.totalBytes)
      },
    )
    // Monotonic, never regresses, and lands exactly on the total.
    expect(progress.length).toBeGreaterThan(0)
    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i]!).toBeGreaterThanOrEqual(progress[i - 1]!)
    }
    expect(progress[progress.length - 1]).toBe(9)
    // Known total → percent within 0..100 and the final one is 100.
    expect(percents.length).toBe(progress.length)
    for (const p of percents) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(100)
    }
    expect(percents[percents.length - 1]).toBe(100)
    // The full verification chain still runs after the download.
    expect(verifyCalled).toBe(true)
    // The binary landed in the cache (renamed from the .part file).
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(dir)
    expect(files).toContain('cloudflared.exe')
    expect(files.some(name => name.includes('cloudflared.download.'))).toBe(false)
  })

  it('never fabricates a percent when the total is unknown', async () => {
    const dir = tmpDir()
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])]
    vi.stubGlobal('fetch', vi.fn(async () => fakeStreamResponse(chunks))) // no content-length
    const percents: Array<number | undefined> = []
    await defaultDownloadBinary(dir, join(dir, 'cloudflared.exe'), async () => {}, (p) => {
      percents.push(p.percent)
      expect(p.totalBytes).toBeUndefined()
    })
    expect(percents.length).toBeGreaterThan(0)
    expect(percents.every(p => p === undefined)).toBe(true)
  })

  it('a slow-but-progressing stream is NOT killed by the idle timeout', async () => {
    const dir = tmpDir()
    const chunk = new Uint8Array(1024).fill(7)
    vi.stubGlobal('fetch', vi.fn(async () => fakeStreamResponse([chunk, chunk, chunk, chunk], {
      totalBytes: chunk.length * 4,
      delayMs: 20, // every chunk arrives within the 60ms idle window
    })))
    const received: number[] = []
    await defaultDownloadBinary(
      dir, join(dir, 'cloudflared.exe'), async () => {},
      (p) => { received.push(p.receivedBytes) },
      { idleMs: 60, overallMs: 2_000 },
    )
    expect(received[received.length - 1]).toBe(chunk.length * 4)
  })

  it('a stalled stream (no new bytes) fails with download-failed', async () => {
    const dir = tmpDir()
    vi.stubGlobal('fetch', vi.fn(async () => fakeStreamResponse(
      [new Uint8Array([1])],
      { neverClose: true }, // one chunk, then silence forever
    )))
    await expect(
      defaultDownloadBinary(dir, join(dir, 'cloudflared.exe'), async () => {}, undefined, { idleMs: 60, overallMs: 2_000 }),
    ).rejects.toMatchObject({ code: 'download-failed' })
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(dir)
    expect(files.some(name => name.includes('cloudflared.download.'))).toBe(false)
  })

  it('a stream error mid-body fails with download-failed and cleans the .part', async () => {
    const dir = tmpDir()
    vi.stubGlobal('fetch', vi.fn(async () => fakeStreamResponse(
      [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])],
      { failAt: 1, totalBytes: 3 },
    )))
    await expect(
      defaultDownloadBinary(dir, join(dir, 'cloudflared.exe'), async () => {}),
    ).rejects.toMatchObject({ code: 'download-failed' })
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(dir)
    expect(files.some(name => name.includes('cloudflared.download.'))).toBe(false)
  })

  it('reports a size mismatch as size-mismatch when the body is shorter than Content-Length', async () => {
    const dir = tmpDir()
    vi.stubGlobal('fetch', vi.fn(async () => fakeStreamResponse(
      [new Uint8Array([1, 2])],
      { totalBytes: 100 }, // advertised 100, body only 2
    )))
    await expect(
      defaultDownloadBinary(dir, join(dir, 'cloudflared.exe'), async () => {}),
    ).rejects.toMatchObject({ code: 'size-mismatch' })
  })

  it('does NOT abort a slow-but-progressing download when the overall cap elapses (progress floor)', async () => {
    const dir = tmpDir()
    // 512 KiB delivered slowly over ~150 ms, all within a 30 ms idle window.
    const chunk = new Uint8Array(512 * 1024).fill(9)
    const chunks = [chunk, chunk, chunk, chunk] // 2 MiB total > 1 MiB floor
    vi.stubGlobal('fetch', vi.fn(async () => fakeStreamResponse(chunks, {
      totalBytes: chunk.length * 4,
      delayMs: 30,
    })))
    // overallMs=120 fires mid-download; the progress floor (already > 1 MiB)
    // must let the healthy slow download continue to completion.
    const received: number[] = []
    await defaultDownloadBinary(
      dir, join(dir, 'cloudflared.exe'), async () => {},
      (p) => { received.push(p.receivedBytes) },
      { idleMs: 200, overallMs: 120, overallMinBytes: 1024 * 1024 },
    )
    expect(received[received.length - 1]).toBe(chunk.length * 4)
  })

  it('aborts a pathological trickle (below the progress floor at the overall cap)', async () => {
    const dir = tmpDir()
    // A tiny byte every 25 ms (never idle, never makes real progress): the
    // overall cap must cut it because it stays under the floor.
    const chunk = new Uint8Array([7])
    vi.stubGlobal('fetch', vi.fn(async () => fakeStreamResponse(
      Array.from({ length: 100 }, () => chunk),
      { neverClose: true, delayMs: 25 },
    )))
    await expect(
      defaultDownloadBinary(
        dir, join(dir, 'cloudflared.exe'), async () => {},
        undefined,
        { idleMs: 2_000, overallMs: 150, overallMinBytes: 1024 * 1024 },
      ),
    ).rejects.toMatchObject({ code: 'download-failed' })
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(dir)
    expect(files.some(name => name.includes('cloudflared.download.'))).toBe(false)
  })

  it('exposes download progress through QuickTunnelService.status() while downloading', async () => {
    const dir = tmpDir()
    const chunks = [new Uint8Array(100).fill(1), new Uint8Array(100).fill(2)]
    vi.stubGlobal('fetch', vi.fn(async () => fakeStreamResponse(chunks, { totalBytes: 200, delayMs: 80 })))
    const { spawn, spawned } = fakeSpawnFactory()
    const service = createQuickTunnelService({
      cacheDir: dir,
      gatewayPort: 8787,
      startTimeoutMs: 10_000,
      spawn,
      verifyBinary: async () => {},
      configPreflight: async () => {},
      onReady: () => {},
      onClosed: () => {},
    })
    const startPromise = service.start()
    // Sample status while the download runs. The first progress event can fire
    // in the same millisecond as the start (speed 0), so keep the BEST sample
    // seen and assert the contract on it — the fields must be present, bounded,
    // and monotonic while phase === 'downloading'.
    let best: QuickTunnelStatus | undefined
    for (let i = 0; i < 60; i += 1) {
      const s = service.status()
      if (s.phase === 'downloading' && s.downloadReceivedBytes !== undefined) {
        if (best === undefined || s.downloadReceivedBytes! > best.downloadReceivedBytes!) best = s
      }
      if (best !== undefined && best.downloadReceivedBytes === 200) break
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    expect(best, 'never observed the downloading phase with progress').toBeDefined()
    expect(best!.downloadTotalBytes).toBe(200)
    expect(best!.downloadPercent).toBeGreaterThanOrEqual(0)
    expect(best!.downloadPercent).toBeLessThanOrEqual(100)
    expect(best!.downloadElapsedMs).toBeGreaterThanOrEqual(0)
    // Let the download finish (spawn happens next), then publish a URL BEFORE
    // awaiting so start() resolves instead of hitting the start timeout.
    await until(() => spawned.length > 0)
    spawned[0]!.stdout.emit('data', 'https://abc.trycloudflare.com')
    spawned[0]!.stderr.emit('data', READY_LOG_LINE)
    await startPromise
    expect(spawned.length).toBe(1)
    // Progress fields are gone once the download phase ends.
    const after = service.status()
    expect(after.phase).toBe('ready')
    expect(after.downloadReceivedBytes).toBeUndefined()
    // Clean shutdown: the fake child must emit exit so stop()'s exitWaiter
    // resolves; otherwise the test hangs on the unref'd waiter.
    spawned[0]!.emitter.emit('exit', 0, null)
    await service.stop()
  })
})

describe('downloadWithNetworkRoutes — proxy/source routing (R06C4)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try { writeFileSync(join(dir, 'cloudflared.exe'), 'fake-binary') } catch { /* ignore */ }
    }
    vi.unstubAllGlobals()
  })

  function tmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-route-test-'))
    dirs.push(dir)
    return dir
  }

  const directSource = { id: 'official', kind: 'official' as const, url: 'https://official.example/cloudflared.exe' }
  const mirrorSource = { id: 'mirror-a', kind: 'mirror' as const, url: 'https://mirror-a.example/https://official.example/cloudflared.exe' }

  it('uses a REQUEST-SCOPED dispatcher for a proxy route and never touches the global dispatcher', async () => {
    const dir = tmpDir()
    const globalKey = Symbol.for('undici.globalDispatcher.1')
    const before = (globalThis as Record<symbol, unknown>)[globalKey] ?? null
    const calls: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: unknown) => {
      calls.push(init)
      return fakeStreamResponse([new Uint8Array([1, 2, 3])], { totalBytes: 3 })
    }))
    await downloadWithNetworkRoutes({
      cacheDir: dir,
      dest: join(dir, 'cloudflared.exe'),
      verify: async () => {},
      network: { network: 'custom', customProxyUrl: 'http://127.0.0.1:7890' },
      sources: [directSource],
      timeouts: { idleMs: 2_000, overallMs: 5_000, overallMinBytes: 1, firstByteMs: 2_000 },
    })
    // The proxy route must have carried a dispatcher on the request...
    const dispatcherInit = calls[0] as { dispatcher?: unknown } | undefined
    expect(dispatcherInit?.dispatcher).toBeDefined()
    // ...and the GLOBAL dispatcher must be exactly what it was before.
    const after = (globalThis as Record<symbol, unknown>)[globalKey] ?? null
    expect(after).toBe(before)
  })

  it('AUTO: a proxy connect failure falls through to the next candidate (direct)', async () => {
    const dir = tmpDir()
    const fetchMock = vi.fn(async (_url: string, init?: { dispatcher?: unknown }) => {
      if (init?.dispatcher !== undefined) {
        throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:7890') })
      }
      return fakeStreamResponse([new Uint8Array([9, 9, 9])], { totalBytes: 3 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir,
      dest: join(dir, 'cloudflared.exe'),
      verify: async () => {},
      network: { network: 'auto' },
      env: { HTTPS_PROXY: 'http://127.0.0.1:7890' },
      readSystemProxy: async () => undefined,
      sources: [directSource],
      timeouts: { idleMs: 2_000, overallMs: 5_000, overallMinBytes: 1, firstByteMs: 2_000 },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const second = fetchMock.mock.calls[1] as [string, { dispatcher?: unknown } | undefined]
    expect(second[1]?.dispatcher).toBeUndefined()
  })

  it('AUTO: a first-byte timeout on the first source switches to the next source', async () => {
    const dir = tmpDir()
    const fetchMock = vi.fn(async (url: string) => {
      if (url === directSource.url) {
        // 200 + Content-Length but the body never delivers a chunk (R06C3 stall).
        return fakeStreamResponse([], { totalBytes: 3, neverClose: true })
      }
      return fakeStreamResponse([new Uint8Array([1, 2, 3])], { totalBytes: 3 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir,
      dest: join(dir, 'cloudflared.exe'),
      verify: async () => {},
      network: { network: 'direct' },
      sources: [directSource, mirrorSource],
      timeouts: { idleMs: 2_000, overallMs: 5_000, overallMinBytes: 1, firstByteMs: 60 },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]![0]).toBe(mirrorSource.url)
  })

  it('CUSTOM: a failing custom proxy does NOT silently fall back to direct', async () => {
    const dir = tmpDir()
    // Every attempt must stay on the custom proxy — a dispatcher-less (direct)
    // fetch would fail the in-mock assertion and prove a silent fallback.
    const fetchMock = vi.fn(async (_url: string, init?: { dispatcher?: unknown }) => {
      expect(init?.dispatcher).toBeDefined()
      throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:7890') })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      downloadWithNetworkRoutes({
        cacheDir: dir,
        dest: join(dir, 'cloudflared.exe'),
        verify: async () => {},
        network: { network: 'custom', customProxyUrl: 'http://127.0.0.1:7890' },
        sources: [directSource, mirrorSource],
        timeouts: { idleMs: 2_000, overallMs: 5_000, overallMinBytes: 1, firstByteMs: 2_000 },
      }),
    ).rejects.toMatchObject({ code: 'proxy-connect-failed' })
    // Both SOURCE attempts ran, both through the custom proxy (asserted inside
    // the mock) — the failure never fell back to a direct network path.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('AUTO: a trust-chain failure (checksum) skips to the next source with the same verification', async () => {
    const dir = tmpDir()
    let verifyCount = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url === directSource.url) return fakeStreamResponse([new Uint8Array([1])], { totalBytes: 1 })
      return fakeStreamResponse([new Uint8Array([2])], { totalBytes: 1 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir,
      dest: join(dir, 'cloudflared.exe'),
      verify: async () => {
        verifyCount += 1
        if (verifyCount === 1) throw new TunnelStartError('checksum-mismatch', 'pinned SHA mismatch')
      },
      network: { network: 'direct' },
      sources: [directSource, mirrorSource],
      timeouts: { idleMs: 2_000, overallMs: 5_000, overallMinBytes: 1, firstByteMs: 2_000 },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(verifyCount).toBe(2)
  })

  it('does NOT switch sources after real progress (>= the progress floor)', async () => {
    const dir = tmpDir()
    // A body that delivers 2 chunks first, THEN resets mid-stream (a real
    // mid-body drop arrives after bytes flowed; a stream errored before the
    // first read would reject with 0 bytes and legitimately switch).
    const fetchMock = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]))
          controller.enqueue(new Uint8Array([2]))
          setTimeout(() => controller.error(new Error('network reset mid-body')), 15)
        },
      })
      const headers = new Headers()
      headers.set('content-length', '3')
      return { ok: true, status: 200, body: stream, headers } as unknown as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      downloadWithNetworkRoutes({
        cacheDir: dir,
        dest: join(dir, 'cloudflared.exe'),
        verify: async () => {},
        network: { network: 'direct' },
        sources: [directSource, mirrorSource],
        timeouts: { idleMs: 2_000, overallMs: 5_000, overallMinBytes: 2, firstByteMs: 2_000 },
      }),
    ).rejects.toMatchObject({ code: 'download-failed' })
    // The failure happened AFTER 2 bytes >= the 2-byte floor: no second attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports proxySource/proxyDisplay/downloadSource through progress', async () => {
    const dir = tmpDir()
    const progress: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async () => fakeStreamResponse([new Uint8Array([1, 2, 3])], { totalBytes: 3 })))
    await downloadWithNetworkRoutes({
      cacheDir: dir,
      dest: join(dir, 'cloudflared.exe'),
      verify: async () => {},
      onProgress: (p) => { progress.push(p as unknown as Record<string, unknown>) },
      network: { network: 'custom', customProxyUrl: 'http://127.0.0.1:7890' },
      sources: [directSource],
      timeouts: { idleMs: 2_000, overallMs: 5_000, overallMinBytes: 1, firstByteMs: 2_000 },
    })
    const last = progress[progress.length - 1]!
    expect(last.proxySource).toBe('custom')
    expect(last.proxyDisplay).toBe('127.0.0.1:7890')
    expect(last.downloadSource).toBe('official')
    // The credential-free display never leaks the URL form.
    expect(JSON.stringify(progress)).not.toContain('http://127.0.0.1:7890')
    expect(JSON.stringify(progress)).toContain('127.0.0.1:7890')
  })

  it('cleans up the .part file after a failed proxy attempt', async () => {
    const dir = tmpDir()
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') })
    }))
    await expect(
      downloadWithNetworkRoutes({
        cacheDir: dir,
        dest: join(dir, 'cloudflared.exe'),
        verify: async () => {},
        network: { network: 'custom', customProxyUrl: 'http://127.0.0.1:7890' },
        sources: [directSource],
        timeouts: { idleMs: 2_000, overallMs: 5_000, overallMinBytes: 1, firstByteMs: 2_000 },
      }),
    ).rejects.toMatchObject({ code: 'proxy-connect-failed' })
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(dir)
    expect(files.some(name => name.includes('cloudflared.download.'))).toBe(false)
  })

  it('DIRECT mode never attaches a dispatcher to the request', async () => {
    const dir = tmpDir()
    const fetchMock = vi.fn(async (_url: string, init?: unknown) => {
      expect((init as { dispatcher?: unknown } | undefined)?.dispatcher).toBeUndefined()
      return fakeStreamResponse([new Uint8Array([7])], { totalBytes: 1 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir,
      dest: join(dir, 'cloudflared.exe'),
      verify: async () => {},
      network: { network: 'direct' },
      env: { HTTPS_PROXY: 'http://127.0.0.1:7890' },
      readSystemProxy: async () => ({ url: 'http://sys:1', display: 'sys:1' }),
      sources: [directSource],
      timeouts: { idleMs: 2_000, overallMs: 5_000, overallMinBytes: 1, firstByteMs: 2_000 },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('downloadWithNetworkRoutes — AUTO slow-source gate (R06C4A)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try { writeFileSync(join(dir, 'cloudflared.exe'), 'fake-binary') } catch { /* ignore */ }
    }
    vi.unstubAllGlobals()
  })

  function tmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-slow-gate-'))
    dirs.push(dir)
    return dir
  }

  const official = { id: 'official', kind: 'official' as const, url: 'https://official.example/cloudflared.exe' }
  const mirror = { id: 'mirror-a', kind: 'mirror' as const, url: 'https://mirror-a.example/https://official.example/cloudflared.exe' }
  // Injected small window keeps the unit tests fast while exercising the same
  // gate logic the production 15 s window uses.
  const FAST = { idleMs: 2_000, overallMs: 10_000, overallMinBytes: 1, firstByteMs: 3_000, slowWindowMs: 500, slowMinBytes: 1024, slowThresholdBytesPerSecond: 300 * 1024 }

  /** A paced stream: first chunk after firstDelayMs, then chunkSize every intervalMs. */
  function pacedStream(chunkSize: number, intervalMs: number, chunks: number, firstDelayMs = 0): Response {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (let i = 0; i < chunks; i += 1) {
          if (i === 0 && firstDelayMs > 0) await new Promise(r => setTimeout(r, firstDelayMs))
          else if (i > 0 && intervalMs > 0) await new Promise(r => setTimeout(r, intervalMs))
          controller.enqueue(new Uint8Array(chunkSize).fill(i % 251))
        }
        controller.close()
      },
    })
    const headers = new Headers()
    headers.set('content-length', String(chunkSize * chunks))
    return { ok: true, status: 200, body: stream, headers } as unknown as Response
  }

  it('AUTO + official FAST: never switches to a mirror', async () => {
    const dir = tmpDir()
    let inFlight = 0
    let maxInFlight = 0
    const fetchMock = vi.fn(async (_url: string) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      const result = pacedStream(64 * 1024, 5, 40) // ~12.8 MB/s
      inFlight -= 1
      return result
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir, dest: join(dir, 'cloudflared.exe'), verify: async () => {},
      network: { network: 'direct' }, source: 'auto', sources: [official, mirror],
      timeouts: FAST,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(official.url)
    expect(maxInFlight).toBe(1)
  })

  it('AUTO + official SLOW (< threshold over the window): auto-switches to the verified mirror', async () => {
    const dir = tmpDir()
    const fetchMock = vi.fn(async (url: string) => {
      if (url === official.url) return pacedStream(4 * 1024, 50, 60) // ~80 KB/s
      return pacedStream(64 * 1024, 5, 40) // mirror is fast
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir, dest: join(dir, 'cloudflared.exe'), verify: async () => {},
      network: { network: 'direct' }, source: 'auto', sources: [official, mirror],
      timeouts: FAST,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]![0]).toBe(mirror.url)
  })

  it('slow switch deletes the .part and the mirror restarts progress from 0', async () => {
    const dir = tmpDir()
    const fetchMock = vi.fn(async (url: string) => {
      if (url === official.url) return pacedStream(4 * 1024, 50, 60)
      return pacedStream(64 * 1024, 5, 40)
    })
    vi.stubGlobal('fetch', fetchMock)
    const events: Record<string, unknown>[] = []
    let sawChanging = false
    let minAfterSwitch = Infinity
    let switchingSeen = false
    // Mirror the service wrapper: the route loop announces a source switch,
    // which the status surface turns into a sourceChanging transition.
    const onSourceSwitch = (next: { source: { kind: string }; path: { source: string; display?: string } }): void => {
      switchingSeen = true
      sawChanging = true
      events.push({
        receivedBytes: 0, elapsedMs: 0,
        proxySource: next.path.source,
        downloadSource: next.source.kind,
        sourceChanging: true,
      })
    }
    await downloadWithNetworkRoutes({
      cacheDir: dir, dest: join(dir, 'cloudflared.exe'), verify: async () => {},
      onProgress: (p) => {
        const record = p as unknown as Record<string, unknown>
        events.push(record)
        if (switchingSeen && record.downloadSource === 'mirror' && typeof record.receivedBytes === 'number') {
          minAfterSwitch = Math.min(minAfterSwitch, record.receivedBytes as number)
        }
      },
      onSourceSwitch,
      network: { network: 'direct' }, source: 'auto', sources: [official, mirror],
      timeouts: FAST,
    })
    // A sourceChanging transition was published, and the mirror restarted
    // from a FRESH counter: its first progress event carries exactly one
    // 64 KiB chunk (it never continued from the abandoned official attempt).
    expect(sawChanging).toBe(true)
    expect(minAfterSwitch).toBeLessThanOrEqual(64 * 1024)
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(dir)
    expect(files.some(name => name.includes('cloudflared.download.'))).toBe(false)
  })

  it('AUTO + official first-byte timeout still falls back (existing gate intact)', async () => {
    const dir = tmpDir()
    const fetchMock = vi.fn(async (url: string) => {
      if (url === official.url) return fakeStreamResponse([], { totalBytes: 3, neverClose: true })
      return fakeStreamResponse([new Uint8Array([1, 2, 3])], { totalBytes: 3 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir, dest: join(dir, 'cloudflared.exe'), verify: async () => {},
      network: { network: 'direct' }, source: 'auto', sources: [official, mirror],
      timeouts: { idleMs: 2_000, overallMs: 5_000, overallMinBytes: 1, firstByteMs: 60, slowWindowMs: 500, slowMinBytes: 1024, slowThresholdBytesPerSecond: 300 * 1024 },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('OFFICIAL-ONLY + slow: never switches (the user asked for official only)', async () => {
    const dir = tmpDir()
    const fetchMock = vi.fn(async (_url: string) => pacedStream(4 * 1024, 50, 40)) // slow, but completes
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir, dest: join(dir, 'cloudflared.exe'), verify: async () => {},
      network: { network: 'direct' }, source: 'official', sources: [official, mirror],
      timeouts: FAST,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(official.url)
  })

  it('MIRROR mode: the official source is never fetched', async () => {
    const dir = tmpDir()
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).not.toBe(official.url)
      return pacedStream(64 * 1024, 5, 40)
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir, dest: join(dir, 'cloudflared.exe'), verify: async () => {},
      network: { network: 'direct' }, source: 'mirror',
      timeouts: FAST,
    })
    // Real mode resolution: only verified mirrors, never the official URL.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).not.toBe(official.url)
  })

  it('the slow gate counts from the FIRST BODY CHUNK — a long TTFB never trips it', async () => {
    const dir = tmpDir()
    // First byte after 1500 ms (still inside the 3 s first-byte timeout), then
    // 800 KB/s. From the first chunk the average is healthy; counting from the
    // request start it would look like ~200 KB/s and wrongly trip the gate.
    const fetchMock = vi.fn(async () => pacedStream(16 * 1024, 20, 40, 1500))
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir, dest: join(dir, 'cloudflared.exe'), verify: async () => {},
      network: { network: 'direct' }, source: 'auto', sources: [official, mirror],
      timeouts: { idleMs: 2_000, overallMs: 10_000, overallMinBytes: 1, firstByteMs: 3_000, slowWindowMs: 500, slowMinBytes: 1024, slowThresholdBytesPerSecond: 300 * 1024 },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fast initial burst + later normal rate: never misjudged as slow', async () => {
    const dir = tmpDir()
    // 2 MB burst immediately, then 32 KB / 100 ms (~320 KB/s) — the window
    // average stays far above the threshold because of the burst.
    const fetchMock = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new Uint8Array(2 * 1024 * 1024))
          for (let i = 0; i < 40; i += 1) {
            await new Promise(r => setTimeout(r, 100))
            controller.enqueue(new Uint8Array(32 * 1024))
          }
          controller.close()
        },
      })
      const headers = new Headers()
      headers.set('content-length', String(2 * 1024 * 1024 + 40 * 32 * 1024))
      return { ok: true, status: 200, body: stream, headers } as unknown as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir, dest: join(dir, 'cloudflared.exe'), verify: async () => {},
      network: { network: 'direct' }, source: 'auto', sources: [official, mirror],
      timeouts: FAST,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a slow official through a PROXY route switches with no parallel requests and no leaked credential', async () => {
    const dir = tmpDir()
    let inFlight = 0
    let maxInFlight = 0
    const diagnostics: string[] = []
    const fetchMock = vi.fn(async (url: string) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        if (url === official.url) return pacedStream(4 * 1024, 50, 60)
        return pacedStream(64 * 1024, 5, 40)
      } finally {
        inFlight -= 1
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadWithNetworkRoutes({
      cacheDir: dir, dest: join(dir, 'cloudflared.exe'), verify: async () => {},
      network: { network: 'auto' },
      env: { HTTPS_PROXY: 'http://user:secret@127.0.0.1:7890' },
      readSystemProxy: async () => undefined,
      source: 'auto', sources: [official, mirror],
      onDiagnostic: (d) => { diagnostics.push(d) },
      timeouts: FAST,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(maxInFlight).toBe(1) // sources are serialized — never parallel
    // The credential never leaves the resolver into diagnostics or status.
    expect(diagnostics.join(' ')).not.toContain('secret')
    expect(diagnostics.join(' ')).not.toContain('user:')
    expect(JSON.stringify(diagnostics)).not.toContain('http://user:secret')
  })

  it('exhausted all-too-slow run surfaces download-failed, never source-too-slow', async () => {
    const dir = tmpDir()
    // AUTO with NO verified mirrors available (single official source): the
    // slow gate trips, the loop has nowhere to fall back, and the final error
    // must be the stable download-failed model — never the internal reason.
    const fetchMock = vi.fn(async () => pacedStream(4 * 1024, 50, 60))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      downloadWithNetworkRoutes({
        cacheDir: dir, dest: join(dir, 'cloudflared.exe'), verify: async () => {},
        network: { network: 'direct' }, source: 'auto', sources: [official],
        timeouts: FAST,
      }),
    ).rejects.toMatchObject({ code: 'download-failed' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

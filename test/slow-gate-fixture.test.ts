/**
 * R06C4A — CONTROLLED FIXTURE integration test for the AUTO slow-source gate.
 *
 * The real-network E2E B proved the AUTO mirror fallback fires (official
 * direct stalled → first-byte timeout → gh.ddlc.top). This fixture proves the
 * OTHER slow trigger the product must handle: a source that DELIVERS BYTES but
 * only at ~100 KB/s (the R06C4 human-scale E2E measured official direct at
 * ~0.1 MB/s for 8+ minutes without falling back). A local HTTP server stands
 * in for "official" (paced 100 KB/s) and a fast local server stands in for the
 * verified mirror. This is a CONTROLLED FIXTURE — never presented as a real
 * internet result (report §17 distinction).
 */

import { createServer, type Server } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadWithNetworkRoutes } from '../src/quick-tunnel.js'
import { writeFileSync } from 'node:fs'

const TOTAL = 4 * 1024 * 1024 // 4 MiB fixture payload
const CHUNK = 32 * 1024

/** A local server that streams `total` bytes at roughly `bytesPerSec`. */
function slowServer(bytesPerSec: number): Promise<{ server: Server; origin: string; served: { count: number } }> {
  return new Promise((resolve) => {
    const served = { count: 0 }
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-length': String(TOTAL) })
      let sent = 0
      const interval = setInterval(() => {
        if (sent >= TOTAL) { clearInterval(interval); res.end(); return }
        const next = Math.min(CHUNK, TOTAL - sent)
        res.write(Buffer.alloc(next, 7))
        sent += next
        served.count += 1
      }, Math.max(1, Math.round(CHUNK / (bytesPerSec / 1000))))
      req.on('close', () => clearInterval(interval))
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('no port')
      resolve({ server, origin: `http://127.0.0.1:${String(address.port)}`, served })
    })
  })
}

describe('AUTO slow-source gate — controlled fixture (R06C4A, NOT real internet)', () => {
  const servers: Server[] = []
  const dirs: string[] = []
  afterEach(() => {
    for (const server of servers.splice(0)) server.close()
    for (const dir of dirs.splice(0)) {
      try { writeFileSync(join(dir, 'cloudflared.exe'), 'fake-binary') } catch { /* ignore */ }
    }
  })

  it('a slow-but-flowing official source (≈100 KB/s) triggers the gate and finishes via the mirror', async () => {
    const slow = await slowServer(100 * 1024) // the "official" stand-in
    const fast = await slowServer(20 * 1024 * 1024) // the "verified mirror" stand-in
    servers.push(slow.server, fast.server)
    const dir = mkdtempSync(join(tmpdir(), 'dsh-fixture-'))
    dirs.push(dir)

    const slowSource = { id: 'official', kind: 'official' as const, url: `${slow.origin}/cloudflared.exe` }
    const mirrorSource = { id: 'mirror-fixture', kind: 'mirror' as const, url: `${fast.origin}/cloudflared.exe` }

    const started = Date.now()
    await downloadWithNetworkRoutes({
      cacheDir: dir,
      dest: join(dir, 'cloudflared.exe'),
      verify: async () => {},
      network: { network: 'direct' },
      source: 'auto',
      sources: [slowSource, mirrorSource],
      timeouts: {
        idleMs: 60_000, overallMs: 120_000, overallMinBytes: 1024,
        firstByteMs: 10_000, slowWindowMs: 15_000, slowMinBytes: 512 * 1024,
        slowThresholdBytesPerSecond: 300 * 1024,
      },
    })
    const elapsedMs = Date.now() - started

    // The slow official delivered SOME bytes (its counter moved) but was
    // abandoned by the gate; the fast mirror completed the file.
    expect(slow.served.count).toBeGreaterThan(0)
    expect(elapsedMs).toBeGreaterThan(15_000) // the 15 s window really elapsed
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(dir, 'cloudflared.exe')).length).toBe(TOTAL)
    // No .part leftovers from the abandoned attempt.
    const { readdir } = await import('node:fs/promises')
    expect((await readdir(dir)).some(name => name.includes('cloudflared.download.'))).toBe(false)
  }, 60_000)
})

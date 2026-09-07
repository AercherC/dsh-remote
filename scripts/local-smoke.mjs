/**
 * Local real smoke test (R04/R06 style) of the plugin host runtime against a
 * live DSH webserver on port 3080.
 *
 * Drives the PRODUCTION `createRemoteRuntime` (the exact factory the plugin's
 * `apply` wires into cordis) with:
 *   - upstream  = http://127.0.0.1:3080   (the running DSH web server)
 *   - dshHome   = a fresh TEMP dir         (plugin state NEVER touches the
 *                                           real ~/.dsh — hard constraint)
 *   - gateway/health = OS-assigned loopback ports (never binds 3080)
 *
 * Flow:
 *   1. baseline: what DSH on 3080 serves for `/` (proxy target reference)
 *   2. start the Quick Tunnel -> public trycloudflare URL
 *   3. anonymous `/` through the tunnel -> EXPECT 401 (gateway rejects)
 *   4. claim a pairing ticket (POST /pair/claim) -> device-session cookie
 *   5. authenticated `/` through the tunnel -> proxy reaches DSH (baseline match)
 *   6. authenticated `/dsh-remote` through the tunnel -> EXPECT denied (management
 *      is loopback-only, never reachable via the public entry)
 *   7. stop + dispose + cleanup
 *
 * Exit 0 = the full pipeline behaves as designed; non-zero = a gate was breached.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = resolve(fileURLToPath(new URL('.', import.meta.url)))
const pluginDir = resolve(here, '..', 'plugin')

const { createRemoteRuntime } = await import(pathToFileURL(resolve(pluginDir, 'lib/runtime.js')).href)
const { resolvePluginConfig } = await import(pathToFileURL(resolve(pluginDir, 'lib/config.js')).href)

const UPSTREAM_PORT = Number(process.env.DSH_SMOKE_UPSTREAM_PORT ?? 3080)
const upstream = new URL(`http://127.0.0.1:${String(UPSTREAM_PORT)}`)

// Isolate ALL plugin state (device sessions, cloudflared cache, github/update
// state) to a scratch home. The real harness home is never read or written.
const scratchHome = mkdtempSync(join(tmpdir(), 'dsh-gateway-smoke-'))
const logger = {
  info: (fields) => console.log('[runtime]', JSON.stringify(fields)),
  warn: (fields) => console.warn('[runtime]', JSON.stringify(fields)),
}

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

let runtime
let exit = 0
try {
  // 1. Baseline: what upstream DSH serves for `/` (the proxy target). DSH is
  //    itself login-gated (401 for anonymous), so reachability is proven by the
  //    authenticated response MATCHING this direct-DSH response, not by 200.
  const baseline = await fetch(upstream.href, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  const baselineBody = await textSafely(baseline)
  console.log(`[smoke] baseline DSH ${upstream.origin}/ -> HTTP ${baseline.status} (${baselineBody.length} bytes)`)

  runtime = await createRemoteRuntime({
    dshHome: scratchHome,
    upstream,
    config: resolvePluginConfig({ tunnelStartTimeoutMs: 120_000 }),
    logger,
    pluginRootDir: pluginDir,
  })
  console.log(`[smoke] gateway bound on 127.0.0.1:${String(runtime.gatewayPort)} -> upstream ${upstream.origin}`)

  // 2. Start the real Quick Tunnel.
  const started = await runtime.tunnelStart()
  if (!started.ok) throw new Error(`tunnelStart failed: ${started.errorCode ?? 'unknown'}`)
  const base = started.url.replace(/\/$/, '')
  console.log(`[smoke] tunnel UP: ${base}`)

  // 3. Anonymous public request -> the gateway's pairing auth rejects it.
  const anon = await fetch(`${base}/`, { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
  const anonBody = await textSafely(anon)
  console.log(`[smoke] anonymous ${base}/ -> HTTP ${anon.status} (${anonBody.length} bytes)`)
  assert(anon.status === 401, `expected gateway to reject anonymous / with 401, got ${anon.status}`)
  console.log('[smoke] OK — anonymous public request is rejected (gateway auth boundary holds)')

  // 4. Claim a one-time pairing ticket into a device session. The gateway's
  //    same-origin CSRF policy REQUIRES an Origin equal to the tunnel host for
  //    any non-GET; a real browser sends it, so the harness must too.
  const ticket = runtime.pairingRotate()
  if (typeof ticket === 'string') throw new Error(`pairingRotate failed: ${ticket}`)
  const claimRes = await fetch(`${base}/pair/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ secret: ticket.secret }),
    signal: AbortSignal.timeout(30_000),
  })
  assert(claimRes.ok, `pairing claim failed: HTTP ${claimRes.status}`)
  const deviceCookie = claimRes.headers.get('set-cookie')?.split(';', 1)[0]
  assert(deviceCookie, 'pairing claim returned no dsh_remote_device cookie')
  console.log(`[smoke] claimed device session (cookie ${deviceCookie.split('=', 1)[0]})`)

  // 5. Authenticated request -> the gateway proxies to upstream DSH. Prove the
  //    proxy reached DSH by matching the direct-DSH baseline response.
  const authed = await fetch(`${base}/`, {
    headers: { cookie: deviceCookie },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  const authedBody = await textSafely(authed)
  console.log(`[smoke] authenticated ${base}/ -> HTTP ${authed.status} (${authedBody.length} bytes)`)
  assert(authedBody === baselineBody, 'authenticated response did not match the direct-DSH baseline — proxy did not reach DSH')
  assert(authedBody !== anonBody, 'authenticated response still shows the gateway\'s 401 rejection')
  console.log('[smoke] OK — authenticated request proxies through to DSH (baseline match)')

  // 6. Management channel is loopback-only: even a valid device session must
  //    NOT reach /dsh-remote through the public entry (deniedPublicPaths).
  const mgmt = await fetch(`${base}/dsh-remote/status`, {
    headers: { cookie: deviceCookie },
    signal: AbortSignal.timeout(30_000),
  })
  console.log(`[smoke] authenticated ${base}/dsh-remote/status -> HTTP ${mgmt.status}`)
  assert(mgmt.status === 404 || mgmt.status === 403, `management channel must be publicly denied, got ${mgmt.status}`)
  console.log('[smoke] OK — management RPC is NOT reachable via the public tunnel')

  console.log('[smoke] SMOKE TEST PASSED')
} catch (error) {
  exit = 1
  console.error(`[smoke] FAIL — ${error instanceof Error ? error.message : String(error)}`)
} finally {
  if (runtime !== undefined) {
    try { await runtime.tunnelStop() } catch {}
    try { await runtime.dispose() } catch {}
  }
  rmSync(scratchHome, { recursive: true, force: true })
}

async function textSafely(response) {
  try { return await response.text() } catch { return '' }
}

process.exit(exit)

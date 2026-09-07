import { createPairingAuthenticator } from './auth.js'
import { loadConfig, loadQuickTunnelConfig } from './config.js'
import { createDeviceSessionStore } from './device-session.js'
import { startGateway } from './gateway.js'
import { jsonLogger, safePath } from './logger.js'
import { createPairingService } from './pairing.js'
import { createPairingRoutes } from './pairing-routes.js'
import { createPublicOriginController } from './public-origin.js'
import { createQuickTunnelService } from './quick-tunnel.js'

/**
 * Quick Mode entry: pairing gateway + Cloudflare Quick Tunnel, no plugin UI.
 *
 * Startup order (R03):
 *   1. load pairing config (fail closed) and the device-session state
 *   2. start the loopback gateway with a CLOSED public-origin controller —
 *      every external request gets 503 until the tunnel is up
 *   3. start cloudflared (PATH → cache → verified download) pointed ONLY at
 *      the loopback gateway
 *   4. on validated trycloudflare URL: open the origin; on crash/stop: close
 *
 * The tunnel URL is printed to stdout for the user (R04 replaces this with
 * the plugin settings UI); structured logs never include it.
 */
const config = loadConfig()
if (config.auth.mode !== 'pairing') {
  throw new Error('quick mode requires GATEWAY_AUTH_MODE=pairing')
}
const quick = loadQuickTunnelConfig(process.env)

const sessions = await createDeviceSessionStore({
  file: config.auth.deviceSessionFile,
  maxDevices: config.auth.deviceMax,
  ttlMs: config.auth.sessionTtlMs,
})
const pairingService = createPairingService({
  ttlMs: config.auth.ticketTtlMs,
  maxTickets: config.auth.ticketMax,
  claimRateLimit: config.auth.claimRateLimit,
  claimRateWindowMs: config.auth.claimRateWindowMs,
})
const routes = createPairingRoutes({
  pairing: pairingService,
  sessions,
  sessionTtlMs: config.auth.sessionTtlMs,
  logger: jsonLogger,
})

const publicOrigin = createPublicOriginController()
const gateway = await startGateway(config, {
  authenticator: createPairingAuthenticator({ sessions }),
  logger: jsonLogger,
  publicOriginProvider: publicOrigin,
  pairing: { routes, pageFor: routes.pageFor },
})

const tunnel = createQuickTunnelService({
  cacheDir: quick.cacheDir,
  gatewayPort: config.port,
  startTimeoutMs: quick.startTimeoutMs,
  onReady: url => {
    publicOrigin.set(url)
    // A fresh tunnel URL must not inherit tickets minted for an older origin.
    pairingService.invalidateAll()
  },
  onClosed: () => {
    publicOrigin.clear()
    // Unused tickets are useless without a reachable origin; kill them all.
    pairingService.invalidateAll()
  },
})

let stopping = false
const stop = async (): Promise<void> => {
  if (stopping) return
  stopping = true
  await tunnel.stop() // clears the public origin first (gateway CLOSED)
  await gateway.close()
}
process.once('SIGINT', () => { void stop().then(() => { process.exitCode = 0 }) })
process.once('SIGTERM', () => { void stop().then(() => { process.exitCode = 0 }) })

try {
  const url = await tunnel.start()
  // The URL is a temporary, sensitive runtime value for the user; structured
  // logs only carry the event.
  jsonLogger.info({ event: 'quick_tunnel_ready', path: safePath(url.toString()) })
  process.stdout.write(`TUNNEL_URL=${url.toString()}\n`)
} catch (error) {
  jsonLogger.warn({ event: 'quick_tunnel_start_failed' })
  process.stdout.write(`QUICK_TUNNEL_START_FAILED=${error instanceof Error ? error.message : 'unknown'}\n`)
  await stop()
  process.exit(1)
}

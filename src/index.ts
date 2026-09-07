import { createCloudflareAccessAuthenticator, createPairingAuthenticator, createTrustedRelayAuthenticator } from './auth.js'
import type { Authenticator } from './auth.js'
import { loadConfig } from './config.js'
import { createDeviceSessionStore } from './device-session.js'
import { startGateway } from './gateway.js'
import type { GatewayDependencies } from './gateway.js'
import { jsonLogger } from './logger.js'
import { createPairingService } from './pairing.js'
import { createPairingRoutes } from './pairing-routes.js'
import type { PairingRoutes } from './pairing-routes.js'

const config = loadConfig()
let authenticator: Authenticator
let pairing: GatewayDependencies['pairing'] | undefined

if (config.auth.mode === 'cloudflare-access') {
  authenticator = createCloudflareAccessAuthenticator(config.auth)
} else if (config.auth.mode === 'trusted-relay') {
  authenticator = createTrustedRelayAuthenticator(config.auth)
} else {
  // pairing mode: state file load is fail-closed — corrupt state aborts startup.
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
  const routes: PairingRoutes = createPairingRoutes({
    pairing: pairingService,
    sessions,
    sessionTtlMs: config.auth.sessionTtlMs,
    logger: jsonLogger,
  })
  authenticator = createPairingAuthenticator({ sessions })
  pairing = { routes, pageFor: routes.pageFor }
}

const gateway = await startGateway(config, {
  authenticator,
  logger: jsonLogger,
  ...(pairing === undefined ? {} : { pairing }),
})

let stopping = false
const stop = (): void => {
  if (stopping) return
  stopping = true
  void gateway.close().then(
    () => { process.exitCode = 0 },
    () => { process.exitCode = 1 },
  )
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)

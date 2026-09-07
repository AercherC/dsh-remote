/**
 * The plugin's host runtime: gateway + device sessions + pairing + public
 * origin + Quick Tunnel, owned as one lifecycle.
 *
 * Deliberately independent of cordis: `apply` in index.ts is a thin adapter
 * that wires DSH services (webServer port, connection RPC, logger) into this
 * factory, and the tests drive the factory directly with fakes.
 *
 * Security invariants (carried from R02/R03):
 *   - the gateway and its health port bind LOOPBACK only
 *   - the public origin starts CLOSED and only opens with a validated tunnel
 *     URL; tunnel stop/crash closes it first
 *   - the tunnel targets the loopback GATEWAY, never DSH directly
 *   - every management RPC endpoint sits behind the gateway's denied public
 *     prefix, so the public entry can never reach it
 *   - the device-session state file fails closed on corruption
 *   - every unused pairing ticket dies when the tunnel stops or the URL
 *     changes
 *   - plugin load never auto-opens the network: the tunnel starts OFF and
 *     only the user's explicit "enable" gesture starts it
 */

import { mkdir } from 'node:fs/promises'

import { createPairingAuthenticator } from '../vendor/dsh-remote-web-gateway/dist/auth.js'
import type { GatewayAuthConfig, GatewayConfig } from '../vendor/dsh-remote-web-gateway/dist/config.js'
import {
  createDeviceSessionStore,
} from '../vendor/dsh-remote-web-gateway/dist/device-session.js'
import { startGateway, type RunningGateway } from '../vendor/dsh-remote-web-gateway/dist/gateway.js'
import type { GatewayLogger } from '../vendor/dsh-remote-web-gateway/dist/logger.js'
import { createPairingService, type PairingTicket } from '../vendor/dsh-remote-web-gateway/dist/pairing.js'
import { createPairingRoutes } from '../vendor/dsh-remote-web-gateway/dist/pairing-routes.js'
import { createLongPairingStore, isLongPairingCodeShape } from '../vendor/dsh-remote-web-gateway/dist/pairing-long.js'
import { createPublicOriginController } from '../vendor/dsh-remote-web-gateway/dist/public-origin.js'
import { createQuickTunnelService, type QuickTunnelService } from '../vendor/dsh-remote-web-gateway/dist/quick-tunnel.js'

import { hardenWindowsDirectory, type DirHardener } from './acl.js'
import { MANAGEMENT_RPC_CHANNEL, type PluginConfig } from './config.js'
import { pluginDirectories } from './home.js'
import { createNetworkConfigStore, type DownloadSettings, type NetworkConfigStore } from './network-config.js'
import { createUpdateService, type UpdateService, type UpdateStatusView } from './updater.js'
import type {
  CommandResult,
  DeviceRevokeAllResult,
  DeviceRevokeResult,
  DeviceSummaryView,
  DownloadSettingsView,
  PairingIssueView,
  PairingLongIssueView,
  PairingLongStatusView,
  PairingStatusView,
  RemoteErrorCode,
  RemoteStatusView,
} from './wire.js'
import { REMOTE_ERROR_CODE_SET } from './wire.js'

export type { RemoteErrorCode, RemoteStatusView, PairingIssueView, PairingLongIssueView, PairingLongStatusView, PairingStatusView, DeviceSummaryView, CommandResult }

export interface RemoteRuntimeOptions {
  /** Resolved harness home (the plugin never derives it from the checkout). */
  readonly dshHome: string
  /** DSH web server URL, always http://127.0.0.1:<port>. */
  readonly upstream: URL
  readonly config: PluginConfig
  readonly logger: GatewayLogger
  /** Installed plugin package root (reads package.json for the version). */
  readonly pluginRootDir: string
  /**
   * R07: build DSH's browser-authenticated root URL for an origin. After a
   * successful pair the phone is bounced to this instead of bare `/`, because
   * DSH's web server requires its own session cookie (minted by the `?token=`
   * launch URL). Injected by the cordis adapter over `ctx.connection.authenticatedUrl`.
   */
  readonly authRootUrl?: (origin: string) => string
  /** Test injection for the Windows ACL hardening step. */
  readonly hardenDir?: DirHardener
  /** Test injection: replace the QuickTunnelService instead of creating one. */
  readonly tunnelOverride?: QuickTunnelService
  /** Test injection: replace the UpdateService. */
  readonly updater?: UpdateService
  readonly now?: () => number
}

export interface RemoteRuntime {
  /** The actual loopback gateway port (OS-assigned when configured 0). Local diagnostics only. */
  readonly gatewayPort: number
  status(): RemoteStatusView
  tunnelStart(): Promise<CommandResult>
  tunnelStop(): Promise<CommandResult>
  /**
   * READ-ONLY pairing ticket state (R06C4B). Never creates or invalidates a
   * ticket — safe for status polling, settings remount and browser reload.
   */
  pairingStatus(): PairingStatusView
  /** Explicit mutation: generate a fresh one-time ticket (user action only). */
  pairingRotate(): PairingIssueView | RemoteErrorCode
  /**
   * D2: READ-ONLY durable long-term pairing code state. Never creates or
   * rotates — safe for the settings poll. `active` carries the plaintext only
   * when THIS process generated it; `persisted` means digests were reloaded
   * after a restart (the code still authenticates but cannot be shown again).
   */
  pairingLongStatus(): PairingLongStatusView
  /**
   * D2: Explicit mutation (user action only): mint a fresh durable long-term
   * pairing code and atomically invalidate the previous one. With no
   * argument a 9-char random code is issued; `customCode` (already a trimmed
   * string) may be any 6–12 char code over the pairing alphabet — validated
   * here (bad-request) before it ever reaches the store. Not gated on the
   * tunnel being ready: the code is origin-independent and claimable whenever
   * remote access is enabled later. Durable: resolves only after persist.
   */
  pairingLongRotate(customCode?: string): Promise<PairingLongIssueView | RemoteErrorCode>
  deviceList(): ReadonlyArray<DeviceSummaryView>
  deviceRevoke(deviceId: string): Promise<DeviceRevokeResult>
  deviceRevokeAll(): Promise<DeviceRevokeAllResult>
  updateCheck(force: boolean): Promise<UpdateStatusView>
  updateApply(): Promise<UpdateStatusView>
  /** R06C4: read/write the UI-owned download network/source settings. */
  networkConfigGet(): Promise<DownloadSettingsView>
  networkConfigSet(settings: DownloadSettingsView): Promise<CommandResult>
  dispose(): Promise<void>
}

/** The pairing auth slice of the gateway config (kept in one place). */
function pairingAuthConfig(options: RemoteRuntimeOptions, dirs: { deviceSessionFile: string }): GatewayAuthConfig {
  return {
    mode: 'pairing',
    deviceSessionFile: dirs.deviceSessionFile,
    deviceMax: options.config.deviceMax,
    sessionTtlMs: options.config.sessionTtlMs,
    ticketTtlMs: options.config.ticketTtlMs,
    ticketMax: options.config.ticketMax,
    claimRateLimit: options.config.claimRateLimit,
    claimRateWindowMs: options.config.claimRateWindowMs,
  }
}

export async function createRemoteRuntime(options: RemoteRuntimeOptions): Promise<RemoteRuntime> {
  const dirs = pluginDirectories(options.dshHome)
  await mkdir(dirs.stateDir, { recursive: true })
  await mkdir(dirs.cacheDir, { recursive: true })
  // Protect the plugin's own sensitive state directory (current user + SYSTEM
  // only); the harness home itself is never touched.
  await (options.hardenDir ?? hardenWindowsDirectory)(dirs.root)

  // R06C4: UI-owned download network/source settings. Defaults come from the
  // plugin config (cordis.patch.yml); the UI writes are persisted next to the
  // other plugin state and take effect on the next download.
  const networkConfig: NetworkConfigStore = createNetworkConfigStore({
    file: dirs.networkConfigFile,
    defaults: {
      network: options.config.downloadNetwork,
      source: options.config.downloadSource,
      ...(options.config.customProxyUrl === undefined ? {} : { customProxyUrl: options.config.customProxyUrl }),
    },
  })

  // Corrupt state fails closed HERE: the plugin reports startup-failed and
  // nothing serves, instead of silently starting with an empty device set.
  const sessions = await createDeviceSessionStore({
    file: dirs.deviceSessionFile,
    maxDevices: options.config.deviceMax,
    ttlMs: options.config.sessionTtlMs,
    ...(options.now === undefined ? {} : { now: options.now }),
  })

  // D2: durable long-term pairing code (digests only on disk). Unlike the
  // device-session file, an unreadable/corrupt file is fail-SAFE: no long
  // code is active (deny), startup continues, and the user can rotate to mint
  // a fresh one. The plaintext never touches disk — see pairing-long.ts.
  const longPairing = await createLongPairingStore({
    file: dirs.longCodeFile,
    logger: options.logger,
    ...(options.now === undefined ? {} : { now: options.now }),
  })

  const pairing = createPairingService({
    ttlMs: options.config.ticketTtlMs,
    maxTickets: options.config.ticketMax,
    claimRateLimit: options.config.claimRateLimit,
    claimRateWindowMs: options.config.claimRateWindowMs,
    ...(options.now === undefined ? {} : { now: options.now }),
  })

  const updater = options.updater ?? createUpdateService({
    pluginRootDir: options.pluginRootDir,
    stateFile: dirs.updateStateFile,
    registryPackage: 'dsh-remote-web-gateway',
    githubRepo: 'AercherC/dsh-remote',
    cliProfile: options.config.cliProfile,
    minCheckIntervalMs: options.config.updateIntervalMs,
    logger: options.logger,
    ...(options.now === undefined ? {} : { now: options.now }),
  })

  const publicOrigin = createPublicOriginController()
  const config: GatewayConfig = {
    listenHost: '127.0.0.1',
    port: options.config.gatewayPort,
    healthPort: options.config.healthPort,
    upstream: options.upstream,
    // Unused in pairing mode: the injected controller overrides the static
    // provider, so this placeholder is never read.
    publicOrigin: new URL('https://gateway.invalid'),
    auth: pairingAuthConfig(options, dirs),
    deniedPublicPaths: [MANAGEMENT_RPC_CHANNEL],
  }

  const routes = createPairingRoutes({
    pairing,
    sessions,
    sessionTtlMs: options.config.sessionTtlMs,
    logger: options.logger,
    // D2: a claim that misses every one-time ticket falls back to the durable
    // long code (shared claim budget — never a bypass).
    long: longPairing,
    // R07: bounce a freshly-paired phone to DSH's browser-authenticated root
    // (it carries the `?token=` launch token that mints DSH's own session
    // cookie). When the origin is CLOSED or the adapter supplied no resolver,
    // the pairing page falls back to bare `/` (unauthenticated → DSH index
    // 401) — the pre-fix behavior, still correct for tests.
    resolveAuthRoot: () => {
      const origin = publicOrigin.get()
      if (origin === undefined || options.authRootUrl === undefined) return undefined
      return options.authRootUrl(origin.origin)
    },
  })
  const gateway: RunningGateway = await startGateway(config, {
    authenticator: createPairingAuthenticator({ sessions }),
    logger: options.logger,
    publicOriginProvider: publicOrigin,
    pairing: { routes, pageFor: routes.pageFor },
  })

  // The tunnel targets the ACTUAL bound gateway port and stays OFF until the
  // user explicitly enables remote access.
  const createdTunnel = createQuickTunnelService({
    cacheDir: dirs.cacheDir,
    gatewayPort: gateway.port,
    startTimeoutMs: options.config.tunnelStartTimeoutMs,
    // R06C4: re-read the persisted download settings for EVERY download, so a
    // UI change (network mode, source mode, custom proxy) applies immediately.
    resolveNetwork: async () => {
      const settings = await networkConfig.get()
      return {
        network: { network: settings.network, ...(settings.customProxyUrl === undefined ? {} : { customProxyUrl: settings.customProxyUrl }) },
        source: settings.source,
      }
    },
    // Downloader local-log diagnostics (route abandonments incl. the AUTO slow
    // gate). Never user-facing; the downloader itself guarantees no credentials
    // or one-time URLs are ever emitted.
    onDiagnostic: (diagnostic) => {
      options.logger.warn({ event: 'cloudflared_download_diagnostic', cause: diagnostic })
    },
    onReady: url => {
      publicOrigin.set(url)
      // A fresh tunnel URL must never inherit tickets minted for an older
      // origin; the client re-issues a ticket when it sees the new URL.
      pairing.invalidateAll()
    },
    onClosed: () => {
      publicOrigin.clear()
      pairing.invalidateAll()
    },
  })
  const tunnel = options.tunnelOverride ?? createdTunnel

  let disposed = false

  function status(): RemoteStatusView {
    if (disposed) {
      return { available: true, enabled: false, phase: 'idle', devices: sessions.list() }
    }
    const tunnelStatus = tunnel.status()
    return {
      available: true,
      enabled: tunnelStatus.phase === 'ready',
      phase: tunnelStatus.phase,
      ...(tunnelStatus.publicUrl === undefined ? {} : { publicUrl: tunnelStatus.publicUrl }),
      ...(tunnelStatus.binarySource === undefined ? {} : { binarySource: tunnelStatus.binarySource }),
      ...(tunnelStatus.lastErrorCode === undefined ? {} : { errorCode: tunnelStatus.lastErrorCode }),
      ...(tunnelStatus.startedAt === undefined ? {} : { startedAt: tunnelStatus.startedAt }),
      ...(tunnelStatus.edgeState === undefined ? {} : { edgeState: tunnelStatus.edgeState }),
      ...(tunnelStatus.edgeDegradedSinceMs === undefined ? {} : { edgeDegradedSinceMs: tunnelStatus.edgeDegradedSinceMs }),
      ...(tunnelStatus.edgeEvents === undefined ? {} : { edgeEvents: tunnelStatus.edgeEvents }),
      ...(tunnelStatus.downloadReceivedBytes === undefined ? {} : { downloadReceivedBytes: tunnelStatus.downloadReceivedBytes }),
      ...(tunnelStatus.downloadTotalBytes === undefined ? {} : { downloadTotalBytes: tunnelStatus.downloadTotalBytes }),
      ...(tunnelStatus.downloadPercent === undefined ? {} : { downloadPercent: tunnelStatus.downloadPercent }),
      ...(tunnelStatus.downloadElapsedMs === undefined ? {} : { downloadElapsedMs: tunnelStatus.downloadElapsedMs }),
      ...(tunnelStatus.downloadSpeedBytesPerSecond === undefined ? {} : { downloadSpeedBytesPerSecond: tunnelStatus.downloadSpeedBytesPerSecond }),
      ...(tunnelStatus.downloadProxySource === undefined ? {} : { downloadProxySource: tunnelStatus.downloadProxySource }),
      ...(tunnelStatus.downloadProxyDisplay === undefined ? {} : { downloadProxyDisplay: tunnelStatus.downloadProxyDisplay }),
      ...(tunnelStatus.downloadSource === undefined ? {} : { downloadSource: tunnelStatus.downloadSource }),
      ...(tunnelStatus.downloadSourceChanging === undefined ? {} : { downloadSourceChanging: tunnelStatus.downloadSourceChanging }),
      ...(updater.status().currentVersion === '0.0.0' ? {} : { pluginVersion: updater.status().currentVersion }),
      devices: sessions.list(),
    }
  }

  function issueTicket(): PairingIssueView | RemoteErrorCode {
    if (tunnel.status().phase !== 'ready') return 'tunnel-not-ready'
    const ticket: PairingTicket = pairing.issue()
    return { secret: ticket.secret, code: ticket.code, expiresAt: ticket.expiresAt }
  }

  return {
    gatewayPort: gateway.port,

    status,

    async tunnelStart(): Promise<CommandResult> {
      try {
        const url = await tunnel.start()
        // Open the origin on the resolved URL. Idempotent with the created
        // tunnel's own onReady hook (same URL); this also covers an injected
        // test tunnel that has no hook wiring.
        publicOrigin.set(url)
        pairing.invalidateAll()
        // R06C4B first-enable flow (allowed creation action A): exactly ONE
        // initial ticket per tunnel lifecycle, issued HOST-side. A browser
        // mount / status poll / settings remount can never create a ticket —
        // the client only ever reads pairingStatus().
        if (tunnel.status().phase === 'ready') pairing.issue()
        return { ok: true, url: url.origin }
      } catch (error) {
        // Map ONLY a stable plugin code; never a raw DOMException numeric
        // `.code` (e.g. AbortError === 20) leaking into the wire. The original
        // cause stays in the local log for diagnostics — never shown raw.
        const candidate = (error as { code?: unknown } | null)?.code
        const code: RemoteErrorCode = typeof candidate === 'string' && REMOTE_ERROR_CODE_SET.has(candidate)
          ? candidate as RemoteErrorCode
          : 'internal'
        options.logger.warn({
          event: 'tunnel_start_failed',
          code,
          cause: error instanceof Error ? error.message : String(error),
        })
        return { ok: false, errorCode: code }
      }
    },

    async tunnelStop(): Promise<CommandResult> {
      await tunnel.stop()
      // R06C4B: stopping remote control IMMEDIATELY invalidates the active
      // pairing ticket (spec §13). The real tunnel also does this through its
      // onClosed hook; doing it here makes the runtime the owner regardless of
      // the tunnel implementation, so no stale ticket can survive a stop.
      pairing.invalidateAll()
      return { ok: true }
    },

    pairingStatus(): PairingStatusView {
      const state = pairing.peek()
      switch (state.state) {
        case 'none':
          return { state: 'none' }
        case 'active': {
          const { id, secret, code, expiresAt } = state.ticket
          return { state: 'active', id, secret, code, expiresAt }
        }
        case 'consumed':
          return { state: 'consumed', id: state.id, consumedAt: state.consumedAt }
        case 'expired':
          return { state: 'expired', id: state.id, expiresAt: state.expiresAt }
      }
    },

    pairingRotate(): PairingIssueView | RemoteErrorCode {
      pairing.invalidateAll() // the user asked for a fresh ticket: old ones die now
      return issueTicket()
    },

    // D2 durable long-term code. Deliberately NOT cleared by tunnelStop /
    // onClosed (unlike one-time tickets): the code is origin-independent and
    // meant to survive restarts so the user can re-connect from a new URL.
    pairingLongStatus(): PairingLongStatusView {
      const state = longPairing.state()
      if (state === undefined) return { state: 'none' }
      const revealed = longPairing.reveal()
      // revealed is available for any version-2 file (persisted plaintext,
      // D2.1) and empty only for a legacy version-1 digest file.
      return revealed === undefined
        ? { state: 'persisted', createdAt: state.createdAt }
        : { state: 'active', createdAt: state.createdAt, secret: revealed.secret, code: revealed.code }
    },

    async pairingLongRotate(customCode?: string): Promise<PairingLongIssueView | RemoteErrorCode> {
      // Host-side shape validation (D2.1 custom codes). The store re-checks
      // defensively, but a malformed custom code must never reach it.
      let normalized: string | undefined
      if (customCode !== undefined) {
        if (typeof customCode !== 'string') return 'bad-request'
        normalized = customCode.trim().toUpperCase()
        if (!isLongPairingCodeShape(normalized)) return 'bad-request'
      }
      try {
        const credential = await longPairing.rotate(normalized) // durable: only resolves after persist
        return { secret: credential.secret, code: credential.code, createdAt: credential.createdAt }
      } catch {
        return 'persist-failed'
      }
    },

    deviceList(): ReadonlyArray<DeviceSummaryView> {
      return sessions.list()
    },

    async deviceRevoke(deviceId: string) {
      if (typeof deviceId !== 'string' || deviceId.length === 0 || deviceId.length > 64) {
        return { ok: false as const, errorCode: 'bad-request' as const }
      }
      try {
        const revoked = await sessions.revoke(deviceId) // durable: resolves true only after persist
        return { ok: true, revoked }
      } catch {
        return { ok: false, errorCode: 'persist-failed' }
      }
    },

    async deviceRevokeAll() {
      try {
        await sessions.revokeAll() // durable: resolves only after persist
        return { ok: true }
      } catch {
        return { ok: false, errorCode: 'persist-failed' }
      }
    },

    async updateCheck(force: boolean): Promise<UpdateStatusView> {
      return await updater.check(force)
    },

    async updateApply(): Promise<UpdateStatusView> {
      return await updater.apply()
    },

    async networkConfigGet(): Promise<DownloadSettingsView> {
      return await networkConfig.get()
    },

    async networkConfigSet(settings: DownloadSettingsView): Promise<CommandResult> {
      // Same fail-closed rules as the plugin config: unknown modes and
      // credential-bearing custom proxy URLs are rejected (never persisted).
      if (settings.network !== 'auto' && settings.network !== 'direct' && settings.network !== 'custom') {
        return { ok: false, errorCode: 'bad-request' }
      }
      if (settings.source !== 'auto' && settings.source !== 'official' && settings.source !== 'mirror') {
        return { ok: false, errorCode: 'bad-request' }
      }
      const customProxyUrl = settings.customProxyUrl
      if (customProxyUrl !== undefined && customProxyUrl.trim() !== '') {
        let url: URL
        try {
          url = new URL(customProxyUrl.trim())
        } catch {
          return { ok: false, errorCode: 'bad-request' }
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, errorCode: 'bad-request' }
        if (url.username !== '' || url.password !== '') return { ok: false, errorCode: 'bad-request' }
      }
      try {
        const next: DownloadSettings = {
          network: settings.network,
          source: settings.source,
          ...(customProxyUrl !== undefined && customProxyUrl.trim() !== '' ? { customProxyUrl: customProxyUrl.trim() } : {}),
        }
        await networkConfig.set(next)
        return { ok: true }
      } catch {
        return { ok: false, errorCode: 'persist-failed' }
      }
    },

    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      // CLOSED first (tunnel.stop clears the origin before killing the
      // process), then the gateway, then every unused ticket.
      await tunnel.stop()
      pairing.invalidateAll()
      await gateway.close()
    },
  }
}

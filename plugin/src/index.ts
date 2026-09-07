/**
 * dsh-remote-web-gateway — host half.
 *
 * Wires DSH services into the gateway runtime:
 *   - resolves the harness home and the plugin's own state/cache dirs
 *   - starts the loopback gateway targeting THIS DSH web server
 *   - registers the loopback-only management RPC on a dedicated channel
 *     (`authority: 'loopback'`, the official DSH mechanism)
 *
 * Plugin load NEVER opens the public network: the tunnel starts OFF and only
 * a user gesture (the settings "开启远程访问" button) starts it.
 *
 * Disposal order (guaranteed): tunnel stop → origin CLOSED → gateway close →
 * unused pairing tickets cleared. No cloudflared orphan survives disposal.
 */

import type { Context } from '@deepseek-ai/cordis'
// Host service merges: ctx.connection (HostConnectionHandle) and
// ctx.webServer (WebServer). Type-only — erased before any runtime import.
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'

import type { GatewayLogger, LogFields } from '../vendor/dsh-remote-web-gateway/dist/logger.js'

import { resolvePluginConfig } from './config.js'
import { resolveDshHome } from './home.js'
import { createRpcHandler, REMOTE_RPC_CHANNEL } from './rpc.js'
import { createRemoteRuntime, type RemoteRuntime } from './runtime.js'
import { createWorkspaceBrowseHandler } from './workspace-browse.js'
import { WORKSPACE_BROWSE_CHANNEL } from './wire.js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The installed plugin package root (parent of this module's directory). */
const pluginRootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Stable cordis plugin name. */
export const name = 'dsh-remote-web-gateway'

/** Services required before this plugin mounts. */
export const inject = ['connection', 'webServer']

function safeJson(fields: LogFields): string {
  try {
    return JSON.stringify(fields)
  } catch {
    return '{}'
  }
}

/**
 * Host plugin body.
 * @param ctx - host cordis context (connection + webServer services).
 * @param config - the loader patch config; validated here, fail-closed.
 */
export function apply(ctx: Context, config?: unknown): void {
  const resolved = resolvePluginConfig(config)

  // The gateway proxies to THIS DSH web server. The webserver service is
  // injected, so its init (listen) completed and the actual port is known —
  // including an OS-assigned port.
  const upstream = new URL(`http://127.0.0.1:${String(ctx.webServer.port)}`)

  const logger: GatewayLogger = {
    info: fields => ctx.logger.info('[dsh-remote-web-gateway] %s', safeJson(fields)),
    warn: fields => ctx.logger.warn('[dsh-remote-web-gateway] %s', safeJson(fields)),
  }

  let runtime: RemoteRuntime | undefined
  let startupError: string | undefined

  // Runtime creation is async (state load, gateway bind). Failures are
  // captured, logged, and surfaced through the status RPC as
  // `startup-failed`; nothing serves publicly and the tunnel never starts.
  // Corrupt device-session state therefore fails closed WITHOUT taking the
  // whole DSH process down.
  ctx.effect(() => {
    void createRemoteRuntime({
      dshHome: resolveDshHome(),
      upstream,
      config: resolved,
      logger,
      pluginRootDir,
      // R07: after pairing, bounce the phone to the launch-token URL instead of
      // bare `/`. `authenticatedUrl` mints DSH's own browser session cookie on
      // the phone; the gateway's device-session cookie alone is NOT enough.
      authRootUrl: (origin) => ctx.connection.authenticatedUrl(origin),
    }).then((created) => {
      runtime = created
      ctx.logger.info('[dsh-remote-web-gateway] runtime ready; tunnel is OFF until the user enables remote access')
      // Automatic update check: throttled host-side to 24h; failures are
      // silent (surfaced only through the settings UI).
      void created.updateCheck(false).catch(() => {})
    }).catch((error: unknown) => {
      startupError = error instanceof Error ? error.message : String(error)
      ctx.logger.warn('[dsh-remote-web-gateway] runtime failed to start: %s', startupError)
    })

    return async () => {
      // Disposal: tunnel stop clears the origin BEFORE killing the process,
      // then the gateway closes and unused tickets are cleared.
      if (runtime !== undefined) await runtime.dispose()
    }
  }, 'dsh-remote-web-gateway: runtime')

  // Loopback-only management RPC on a DEDICATED channel. The gateway denies
  // the same channel prefix from the public entry (defense in depth).
  ctx.effect(() => {
    const handler: ConnectionRpcHandler = async (endpoint, payload) => {
      return await createRpcHandler(() => runtime)(endpoint, payload)
    }
    const dispose = ctx.connection.rpc.handle(REMOTE_RPC_CHANNEL, handler)
    ctx.logger.info('[dsh-remote-web-gateway] management RPC registered on %s (loopback-only)', REMOTE_RPC_CHANNEL)
    return dispose
  }, 'dsh-remote-web-gateway: loopback management rpc')

  // R14: mobile workspace directory browse — READ-ONLY listing for the
  // mobile workspace picker. Same loopback-authority mechanism, but on a
  // channel NOT in the gateway's deniedPublicPaths: paired phones reach it
  // through the gateway, which authenticates every public request with the
  // device session / pairing flow. The gateway rewrites Host/Origin to
  // loopback, so the loopback trust fence passes here. Only `list` exists —
  // no create/delete/modify (see workspace-browse.ts).
  ctx.effect(() => {
    const dispose = ctx.connection.rpc.handle(
      WORKSPACE_BROWSE_CHANNEL,
      createWorkspaceBrowseHandler(),
    )
    ctx.logger.info('[dsh-remote-web-gateway] workspace browse RPC registered on %s (device-session authenticated via the gateway)', WORKSPACE_BROWSE_CHANNEL)
    return dispose
  }, 'dsh-remote-web-gateway: workspace browse rpc')
}

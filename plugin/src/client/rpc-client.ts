/**
 * Typed browser client for the loopback-only management RPC.
 *
 * Calls ride `ctx.connection.rpc.call('/dsh-remote', '<endpoint>', payload)`
 * — the same official Connection transport the rest of the UI uses, on a
 * dedicated channel registered with `authority: 'loopback'`. Operational
 * failures arrive as RpcError with the stable plugin error code in
 * `message`; every method translates that back to the code.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'

import type {
  CommandResult,
  DeviceRevokeAllResult,
  DeviceRevokeResult,
  DownloadSettingsView,
  PairingIssueView,
  PairingLongIssueView,
  PairingLongStatusView,
  PairingStatusView,
  RemoteErrorCode,
  RemoteStatusView,
  UpdateStatusView,
} from '../wire.js'
import { REMOTE_ERROR_CODE_SET } from '../wire.js'

const CHANNEL = '/dsh-remote'

export interface RemoteClient {
  /** Whether this page is served from the loopback host (localhost). */
  readonly isLoopback: boolean
  status(): Promise<RemoteStatusView>
  /** READ-ONLY pairing ticket state — never creates a ticket. */
  pairingStatus(): Promise<PairingStatusView>
  tunnelStart(): Promise<CommandResult>
  tunnelStop(): Promise<CommandResult>
  /** Explicit mutation: generate a fresh one-time ticket (user action only). */
  pairingRotate(): Promise<PairingIssueView | RemoteErrorCode>
  /** D2 READ-ONLY long-term pairing code state — never creates/rotates. */
  pairingLongStatus(): Promise<PairingLongStatusView>
  /** D2 explicit mutation: mint a fresh long-term code (old one dies). */
  pairingLongRotate(customCode?: string): Promise<PairingLongIssueView | RemoteErrorCode>
  deviceRevoke(deviceId: string): Promise<DeviceRevokeResult>
  deviceRevokeAll(): Promise<DeviceRevokeAllResult>
  updateCheck(force: boolean): Promise<UpdateStatusView>
  updateApply(): Promise<UpdateStatusView>
  networkConfigGet(): Promise<DownloadSettingsView>
  networkConfigSet(settings: DownloadSettingsView): Promise<CommandResult>
}

/** Extract the plugin error code from a failed RpcResult. */
function codeOf(result: { ok: false; error: { message: string } }): RemoteErrorCode {
  const message = result.error.message
  return (REMOTE_ERROR_CODE_SET.has(message) ? message : 'internal') as RemoteErrorCode
}

export function createRemoteClient(connection: ConnectionHandle): RemoteClient {
  const call = connection.rpc.call.bind(connection.rpc)

  return {
    isLoopback: connection.isLoopback,

    async status(): Promise<RemoteStatusView> {
      const result = await call(CHANNEL, 'status', {})
      if (result.ok) return result.value as RemoteStatusView
      // Status must never throw to the UI: degrade to an unavailable view.
      return {
        available: false,
        enabled: false,
        phase: 'error',
        errorCode: codeOf(result),
        devices: [],
      }
    },

    async tunnelStart(): Promise<CommandResult> {
      const result = await call(CHANNEL, 'tunnelStart', {})
      if (result.ok) return { ok: true, ...(result.value as { url?: string }) }
      return { ok: false, errorCode: codeOf(result) }
    },

    async tunnelStop(): Promise<CommandResult> {
      const result = await call(CHANNEL, 'tunnelStop', {})
      return result.ok ? { ok: true } : { ok: false, errorCode: codeOf(result) }
    },

    async pairingStatus(): Promise<PairingStatusView> {
      const result = await call(CHANNEL, 'pairingStatus', {})
      if (result.ok) return result.value as PairingStatusView
      // Read-only degrade: report "no ticket" rather than fabricating one.
      return { state: 'none' }
    },

    async pairingRotate(): Promise<PairingIssueView | RemoteErrorCode> {
      const result = await call(CHANNEL, 'pairingRotate', {})
      if (result.ok) return result.value as PairingIssueView
      return codeOf(result)
    },

    async pairingLongStatus(): Promise<PairingLongStatusView> {
      const result = await call(CHANNEL, 'pairingLongStatus', {})
      if (result.ok) return result.value as PairingLongStatusView
      // Read-only degrade: report "no long code" rather than fabricating one.
      return { state: 'none' }
    },

    async pairingLongRotate(customCode?: string): Promise<PairingLongIssueView | RemoteErrorCode> {
      const result = await call(CHANNEL, 'pairingLongRotate', customCode === undefined ? {} : { code: customCode })
      if (result.ok) return result.value as PairingLongIssueView
      return codeOf(result)
    },

    async deviceRevoke(deviceId: string): Promise<DeviceRevokeResult> {
      const result = await call(CHANNEL, 'deviceRevoke', { deviceId })
      if (result.ok) return { ok: true, revoked: (result.value as { revoked: boolean }).revoked }
      return { ok: false, errorCode: codeOf(result) }
    },

    async deviceRevokeAll(): Promise<DeviceRevokeAllResult> {
      const result = await call(CHANNEL, 'deviceRevokeAll', {})
      return result.ok ? { ok: true } : { ok: false, errorCode: codeOf(result) }
    },

    async updateCheck(force: boolean): Promise<UpdateStatusView> {
      const result = await call(CHANNEL, 'updateCheck', { force })
      return result.ok ? result.value as UpdateStatusView : {
        currentVersion: '',
        phase: 'unavailable',
        error: codeOf(result),
      }
    },

    async updateApply(): Promise<UpdateStatusView> {
      const result = await call(CHANNEL, 'updateApply', {})
      return result.ok ? result.value as UpdateStatusView : {
        currentVersion: '',
        phase: 'failed',
        error: codeOf(result),
      }
    },

    async networkConfigGet(): Promise<DownloadSettingsView> {
      const result = await call(CHANNEL, 'networkConfigGet', {})
      if (result.ok) return result.value as DownloadSettingsView
      // Degrade to the safe defaults rather than throwing to the UI.
      return { network: 'auto', source: 'auto' }
    },

    async networkConfigSet(settings: DownloadSettingsView): Promise<CommandResult> {
      const result = await call(CHANNEL, 'networkConfigSet', { settings })
      return result.ok ? { ok: true } : { ok: false, errorCode: codeOf(result) }
    },
  }
}

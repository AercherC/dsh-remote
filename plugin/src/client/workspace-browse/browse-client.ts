/**
 * R14 — typed browser client for the workspace directory browse RPC.
 *
 * Calls ride `ctx.connection.rpc.call('/dsh-workspace-browse', 'list', …)`
 * — the same official Connection transport the rest of the UI uses, on the
 * plugin's dedicated channel. From a phone the request goes through the
 * gateway, which authenticates it with the device session / pairing flow;
 * there is no unauthenticated file-browsing surface.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'

import type { DirectoryListingView, WorkspaceBrowseErrorCode } from '../../wire.js'
import { WORKSPACE_BROWSE_CHANNEL } from '../../wire.js'

/** Typed failure of the browse surface; `code` is the stable wire code. */
export class WorkspaceBrowseError extends Error {
  constructor(readonly code: WorkspaceBrowseErrorCode) {
    super(code)
    this.name = 'WorkspaceBrowseError'
  }
}

export interface WorkspaceBrowseClient {
  /** List one directory level; an absent path lists the Host computer roots. */
  listDirectory(path?: string, signal?: AbortSignal): Promise<DirectoryListingView>
}

/** Extract the stable browse error code from a failed RpcResult. */
function codeOf(result: { ok: false; error: { message: string } }): WorkspaceBrowseErrorCode {
  return result.error.message === 'directory-unreadable' ? 'directory-unreadable' : 'internal'
}

export function createWorkspaceBrowseClient(connection: ConnectionHandle): WorkspaceBrowseClient {
  const call = connection.rpc.call.bind(connection.rpc)
  return {
    async listDirectory(path, signal) {
      const result = await call(WORKSPACE_BROWSE_CHANNEL, 'list', path === undefined ? {} : { path }, signal)
      if (result.ok) return result.value as DirectoryListingView
      throw new WorkspaceBrowseError(codeOf(result))
    },
  }
}

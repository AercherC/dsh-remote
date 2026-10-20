/**
 * Loopback-only management RPC for the plugin.
 *
 * The endpoints live on a DEDICATED logical channel (`/dsh-remote`)
 * registered through `ctx.connection.rpc.handle(..., { authority:
 * 'loopback' })` — the official DSH loopback-authority mechanism
 * (packages/client/connection — the fence refuses any non-loopback Host or
 * cross-site marker). The shared `/api` channel is deliberately NOT used:
 * its interceptor seat is a single-owner slot already claimed by a built-in
 * plugin.
 *
 * Defense in depth: the gateway ALSO denies the whole `/dsh-remote` prefix
 * from the public entry, so even a valid device session through the Quick
 * Tunnel can never reach these endpoints.
 *
 * Error encoding: the RpcError code union is closed, so operational failures
 * ride the `internal` code with the stable plugin error code as the message;
 * the client maps that code to user copy via the same table the status
 * surface uses.
 */
import type { RpcResult } from '@deepseek-ai/dsh-client-connection/client';
import type { RemoteRuntime } from './runtime.js';
/** The dedicated loopback-only RPC channel. */
export declare const REMOTE_RPC_CHANNEL = "/dsh-remote";
/** Dispatch one endpoint against the runtime, returning the wire RpcResult. */
export declare function dispatch(runtime: RemoteRuntime, endpoint: string, payload: unknown): Promise<RpcResult<unknown>>;
/** Build the connection RPC handler over a (possibly not-yet-started) runtime. */
export declare function createRpcHandler(runtimeProvider: () => RemoteRuntime | undefined): (endpoint: string, payload: unknown) => Promise<RpcResult<unknown>>;

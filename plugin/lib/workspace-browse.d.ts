/**
 * R14 — mobile workspace directory browse (host half).
 *
 * Serves the READ-ONLY directory-listing primitive for the mobile workspace
 * picker over the plugin's own connection-RPC channel (`/dsh-workspace-browse`,
 * registered in `index.ts`). Only `list` exists — no create / delete / modify
 * / upload (R14 constraints).
 *
 * Real-directory listing semantics are ADAPTED from the official DSH browse backend
 * `@deepseek-ai/dsh-host-directory-picker-browse` (MIT): opendir streaming
 * into a name-sorted bounded window with a `truncated` flag, symlink
 * enterability probes, breadcrumb ancestry, POSIX dot-prefix hidden flags,
 * a fully-qualified path fence (a wire value must never resolve against the
 * host cwd or, on Windows, its current drive), and abort-aware file reads.
 * See plugin/NOTICE for attribution. R14.3 adds only a virtual computer-root
 * first level so remote touch devices can reach the same drives the native
 * Windows picker exposes instead of being dropped into the account home.
 *
 * Security: the channel is reachable from paired touch devices ONLY through the
 * gateway, which authenticates every public request with the device session /
 * pairing flow; the fence here is defense in depth. No drive is restricted —
 * Windows ACLs are the final boundary.
 */
import type { RpcResult } from '@deepseek-ai/dsh-client-connection/client';
import type { DirectoryEntryView } from './wire.js';
/** Options with injectable host facts (deterministic tests). */
export interface WorkspaceBrowseOptions {
    /** Complete-result bound of one listing level; see {@link WorkspaceBrowseHandlerConfig}. */
    maxEntries?: number;
    /** Platform used by the fully-qualified fence (defaults to process.platform). */
    platform?: NodeJS.Platform;
    /** Home directory root (defaults to the real homedir). */
    home?: string;
    /** Injectable computer-root discovery (tests avoid probing real drives). */
    discoverRoots?: (signal: AbortSignal | undefined) => Promise<readonly DirectoryEntryView[]>;
}
/** Validated configuration of one browse handler. */
export interface WorkspaceBrowseHandlerConfig {
    readonly maxEntries: number;
    readonly platform: NodeJS.Platform;
    readonly home: string;
    readonly discoverRoots: (signal: AbortSignal | undefined) => Promise<readonly DirectoryEntryView[]>;
}
/**
 * Resolve the handler options into a validated config, fail-closed on bad
 * bounds (the Loader passes raw config through unvalidated).
 */
export declare function resolveWorkspaceBrowseConfig(options: WorkspaceBrowseOptions | undefined): WorkspaceBrowseHandlerConfig;
/** True when the path names one fixed filesystem location regardless of
 * process state: POSIX-absolute on POSIX; on Windows only drive-qualified
 * (`C:\…`) or complete UNC (`\\server\share…`) forms. */
export declare function fullyQualified(path: string, platform?: NodeJS.Platform): boolean;
/** POSIX dot-prefix hidden convention; Windows' hidden attribute is not
 * exposed by dirents (Known Limitation, same as the official browse backend).
 * The client owns whether hidden rows show. */
export declare function isHiddenEntry(name: string, platform: NodeJS.Platform): boolean;
/**
 * Build the workspace-browse connection-RPC handler (endpoint `list` only).
 * @param options - handler options (bounds + injectable host facts).
 */
export declare function createWorkspaceBrowseHandler(options?: WorkspaceBrowseOptions): (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>;

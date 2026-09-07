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

import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { basename, dirname, join, posix, resolve, win32 } from 'node:path'
import { opendir, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { RpcResult } from '@deepseek-ai/dsh-client-connection/client'

import type { DirectoryEntryView, DirectoryListingView, WorkspaceBrowseErrorCode } from './wire.js'

const execFileAsync = promisify(execFile)

/** Options with injectable host facts (deterministic tests). */
export interface WorkspaceBrowseOptions {
  /** Complete-result bound of one listing level; see {@link WorkspaceBrowseHandlerConfig}. */
  maxEntries?: number
  /** Platform used by the fully-qualified fence (defaults to process.platform). */
  platform?: NodeJS.Platform
  /** Home directory root (defaults to the real homedir). */
  home?: string
  /** Injectable computer-root discovery (tests avoid probing real drives). */
  discoverRoots?: (signal: AbortSignal | undefined) => Promise<readonly DirectoryEntryView[]>
}

/** Validated configuration of one browse handler. */
export interface WorkspaceBrowseHandlerConfig {
  readonly maxEntries: number
  readonly platform: NodeJS.Platform
  readonly home: string
  readonly discoverRoots: (signal: AbortSignal | undefined) => Promise<readonly DirectoryEntryView[]>
}

/**
 * Resolve the handler options into a validated config, fail-closed on bad
 * bounds (the Loader passes raw config through unvalidated).
 */
export function resolveWorkspaceBrowseConfig(options: WorkspaceBrowseOptions | undefined): WorkspaceBrowseHandlerConfig {
  const maxEntries = options?.maxEntries ?? 1000
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error('dsh-remote-web-gateway: workspace browse maxEntries must be a positive integer')
  }
  return {
    maxEntries,
    platform: options?.platform ?? process.platform,
    home: options?.home ?? homedir(),
    discoverRoots: options?.discoverRoots ?? createRootDiscovery(options?.platform ?? process.platform),
  }
}

/** Discover the host's top-level filesystem roots without imposing a
 * workspace allow-list. Windows probes every drive letter; POSIX has one
 * filesystem namespace rooted at `/`. */
function createRootDiscovery(platform: NodeJS.Platform): (signal: AbortSignal | undefined) => Promise<readonly DirectoryEntryView[]> {
  if (platform !== 'win32') {
    return async (signal) => {
      signal?.throwIfAborted()
      return [{ name: '/', path: '/', hidden: false }]
    }
  }
  return async (signal) => {
    // DriveInfo uses Windows' logical-drive inventory, so removable and
    // temporarily unreadable drives are still visible just as they are in
    // the native picker. The command is static (no browser/user input).
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '[IO.DriveInfo]::GetDrives().Name'],
        { encoding: 'utf8', windowsHide: true, signal },
      )
      const roots = [...new Set(stdout.match(/[A-Za-z]:\\/g) ?? [])].sort()
      if (roots.length > 0) {
        return roots.map(path => ({ name: path.slice(0, 2), path, hidden: false }))
      }
    } catch {
      if (signal?.aborted) throw asError(signal.reason)
      // Minimal-install Windows may lack powershell.exe. Fall back to safe
      // stdlib probes rather than failing the whole picker closed.
    }
    const candidates = Array.from({ length: 26 }, (_, index) => `${String.fromCharCode(65 + index)}:\\`)
    const rows = await Promise.all(candidates.map(async (path): Promise<DirectoryEntryView | null> => {
      try {
        if (!(await raceAbort(stat(path), signal)).isDirectory()) return null
        return { name: path.slice(0, 2), path, hidden: false }
      } catch {
        if (signal?.aborted) throw asError(signal.reason)
        return null
      }
    }))
    return rows.filter((row): row is DirectoryEntryView => row !== null)
  }
}

/** True when the path names one fixed filesystem location regardless of
 * process state: POSIX-absolute on POSIX; on Windows only drive-qualified
 * (`C:\…`) or complete UNC (`\\server\share…`) forms. */
export function fullyQualified(path: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
    ? win32.isAbsolute(path) && /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/]+[^\\/]+)/.test(path)
    : posix.isAbsolute(path)
}

/** Ancestor chain from the filesystem root to `target` inclusive — the
 * breadcrumb rows of a listing, every one a jump target. */
function ancestryCrumbs(target: string): DirectoryEntryView[] {
  const crumbs: DirectoryEntryView[] = []
  let current = target
  for (;;) {
    const parent = dirname(current)
    // basename of a root is '' — label the root crumb by its full path ('/', 'C:\').
    crumbs.unshift({ name: parent === current ? current : basename(current), path: current, hidden: false })
    if (parent === current) return crumbs
    current = parent
  }
}

/** One streamed listing candidate: the dirent facts a row needs, nothing else retained. */
interface ListingCandidate {
  readonly name: string
  readonly isDirectory: boolean
  readonly isSymbolicLink: boolean
}

/** Insert a streamed candidate into the name-sorted bounded window, evicting
 * the name-largest candidate when the window exceeds `keep`. Memory over an
 * arbitrarily large level stays O(keep). */
function boundedInsert(window: ListingCandidate[], candidate: ListingCandidate, keep: number): boolean {
  if (window.length === keep && candidate.name.localeCompare(window[window.length - 1]!.name) >= 0) return true
  let low = 0
  let high = window.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (candidate.name.localeCompare(window[mid]!.name) < 0) high = mid
    else low = mid + 1
  }
  window.splice(low, 0, candidate)
  if (window.length <= keep) return false
  window.pop()
  return true
}

/** Await `operation`, but reject with the signal's reason the moment it aborts. */
function raceAbort<T>(operation: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return operation
  return new Promise<T>((resolvePromise, reject) => {
    const onAbort = (): void => {
      operation.catch(() => {})
      reject(asError(signal.reason))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolvePromise(value)
      },
      (reason: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(asError(reason))
      },
    )
  })
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason))
}

/** Swallow the close failure of a handle its caller already departed. */
function swallowCloseFailure(): void {}

/** POSIX dot-prefix hidden convention; Windows' hidden attribute is not
 * exposed by dirents (Known Limitation, same as the official browse backend).
 * The client owns whether hidden rows show. */
export function isHiddenEntry(name: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' ? false : name.startsWith('.')
}

/** One listing row for a dirent, following symlinks to directories; null for
 * non-directories and broken/cyclic links (skipped silently). */
async function directoryRow(
  parent: string,
  name: string,
  isDirectory: boolean,
  isSymbolicLink: boolean,
  signal: AbortSignal | undefined,
  platform: NodeJS.Platform,
): Promise<DirectoryEntryView | null> {
  const path = join(parent, name)
  let enterable = isDirectory
  if (!enterable && isSymbolicLink) {
    try {
      enterable = (await raceAbort(stat(path), signal)).isDirectory()
    } catch {
      if (signal?.aborted) throw asError(signal.reason)
      return null
    }
  }
  if (!enterable) return null
  return { name, path, hidden: isHiddenEntry(name, platform) }
}

/** RPC error builders (same closed-code shape the management RPC uses). */
function unreadable(): { ok: false; error: { code: 'internal'; message: WorkspaceBrowseErrorCode; details: {} } } {
  return { ok: false, error: { code: 'internal', message: 'directory-unreadable', details: {} } }
}

function internalError(): { ok: false; error: { code: 'internal'; message: WorkspaceBrowseErrorCode; details: {} } } {
  return { ok: false, error: { code: 'internal', message: 'internal', details: {} } }
}

function badRequest(): { ok: false; error: { code: 'bad-request'; message: string; details: { issues: [] } } } {
  return { ok: false, error: { code: 'bad-request', message: 'bad-request', details: { issues: [] } } }
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

/** The one endpoint of the workspace browse surface: read-only directory listing. */
async function list(
  payload: unknown,
  signal: AbortSignal | undefined,
  config: WorkspaceBrowseHandlerConfig,
): Promise<RpcResult<unknown>> {
  const body = payload as { path?: unknown } | null
  if (body !== null && typeof body !== 'object') return badRequest()
  const rawPath = body === null ? undefined : body.path
  if (rawPath !== undefined && typeof rawPath !== 'string') return badRequest()
  // The seam contract takes fully qualified paths only; resolve() would
  // silently rebase a relative or empty wire value under the host process
  // cwd (or, for rooted drive-less Windows forms, its current drive).
  if (rawPath !== undefined && !fullyQualified(rawPath, config.platform)) {
    return unreadable()
  }
  if (rawPath === undefined) {
    try {
      const entries = await config.discoverRoots(signal)
      signal?.throwIfAborted()
      return ok<DirectoryListingView>({
        kind: 'computer',
        path: null,
        home: config.home,
        crumbs: [],
        entries,
        truncated: false,
      })
    } catch {
      signal?.throwIfAborted()
      return unreadable()
    }
  }
  const target = resolve(rawPath)
  const keep = config.maxEntries + 1
  const window: ListingCandidate[] = []
  let evicted = false
  try {
    const opening = opendir(target)
    const level = await raceAbort(opening, signal).catch((error: unknown) => {
      void opening.then(dir => dir.close().catch(swallowCloseFailure), () => {})
      throw error
    })
    try {
      for (;;) {
        const dirent = await raceAbort(level.read(), signal)
        if (dirent === null) break
        if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue
        const candidate: ListingCandidate = {
          name: dirent.name,
          isDirectory: dirent.isDirectory(),
          isSymbolicLink: dirent.isSymbolicLink(),
        }
        if (boundedInsert(window, candidate, keep)) evicted = true
      }
    } finally {
      const closing = level.close()
      if (signal?.aborted) {
        closing.catch(swallowCloseFailure)
      } else {
        await closing
      }
    }
  } catch (error: unknown) {
    signal?.throwIfAborted()
    return unreadable()
  }
  const entries: DirectoryEntryView[] = []
  let truncated = evicted
  for (const candidate of window) {
    signal?.throwIfAborted()
    const row = await directoryRow(target, candidate.name, candidate.isDirectory, candidate.isSymbolicLink, signal, config.platform)
    if (row === null) continue
    if (entries.length === config.maxEntries) {
      truncated = true
      break
    }
    entries.push(row)
  }
  return ok<DirectoryListingView>({
    kind: 'directory',
    path: target,
    home: config.home,
    crumbs: ancestryCrumbs(target),
    entries,
    truncated,
  })
}

/**
 * Build the workspace-browse connection-RPC handler (endpoint `list` only).
 * @param options - handler options (bounds + injectable host facts).
 */
export function createWorkspaceBrowseHandler(options?: WorkspaceBrowseOptions): (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => Promise<RpcResult<unknown>> {
  const config = resolveWorkspaceBrowseConfig(options)
  return async (endpoint, payload, signal) => {
    try {
      switch (endpoint) {
        case 'list':
          return await list(payload, signal, config)
        default:
          return badRequest()
      }
    } catch {
      return internalError()
    }
  }
}

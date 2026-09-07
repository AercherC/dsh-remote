import { execFile, spawn as nodeSpawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ProxyAgent } from 'undici'

import {
  cloudflaredAssetFor,
  CLOUDFLARED_PINNED_VERSION,
  isArchivedAsset,
  isRunnableAsset,
  managedBinaryName,
  type CloudflaredAsset,
} from './cloudflared-assets.js'
import { extractCloudflaredBinary } from './cloudflared-archive.js'
import {
  resolveDownloadSources,
  type DownloadSource,
  type DownloadSourceKind,
} from './download-sources.js'
import {
  readWinInetStaticProxy,
  resolveNetworkPaths,
  type DownloadSourceMode,
  type NetworkConfig,
  type ProxyCandidate,
  type ProxySource,
  type SystemProxyRead,
} from './proxy-resolver.js'

// Re-exported: these types are part of the public status surface (status()
// exposes downloadProxySource / downloadSource), so wire.ts imports them from
// quick-tunnel.js.
export type { DownloadSourceKind } from './download-sources.js'
export type { ProxySource } from './proxy-resolver.js'

/**
 * Cloudflare Quick Tunnel transport (R03, hardened R04).
 *
 * Responsibilities are deliberately limited to transport:
 *   - cloudflared binary discovery (PATH → managed cache → on-demand
 *     download), with the SOURCE recorded for the status surface. A PATH
 *     candidate is never executed just because a file with that name exists:
 *     it must pass an explicit trust check first (Windows: Authenticode
 *     Valid + Cloudflare signer + a sane `--version`; POSIX: a sane
 *     `--version`). An untrusted PATH candidate is IGNORED and the managed
 *     pinned binary is used instead. Full filesystem paths are never
 *     exposed on the status surface.
 *   - a reproducible supply chain: pinned version + pinned official SHA-256,
 *     verified on EVERY start for any managed binary (cache or fresh
 *     download), plus a `--version` run against the pinned version and (when
 *     present) an Authenticode check — the hash/version chain is the gate
 *   - a non-destructive preflight for an existing user Cloudflare config that
 *     could affect Quick Tunnel behavior (nothing is renamed, deleted, or
 *     edited)
 *   - spawn `cloudflared tunnel --url http://127.0.0.1:<gatewayPort>`
 *     with `--protocol http2 --no-autoupdate`
 *   - strict `https://*.trycloudflare.com` URL discovery from the process
 *     output (never trusts arbitrary log text)
 *   - TWO-PHASE readiness (R06C4D): the URL banner only means the hostname
 *     was allocated — the Cloudflare Edge may still be registering the
 *     connector, so a first request in that window returns Cloudflare Error
 *     1033. phase becomes `connecting` at hostname-acquired and only
 *     `ready` after cloudflared's own "Registered tunnel connection" log
 *     line (verified against the pinned 2026.8.2 binary). The caller's
 *     onReady + the initial pairing ticket therefore fire only at real
 *     readiness.
 *   - single-flight start / idempotent stop / crash handling
 *   - E1-A post-ready edge-link watch: the process output keeps being observed
 *     after READY and transient edge losses (`Lost connection with the edge`
 *     etc.) are recorded as diagnostics (`edgeState`/`edgeDegradedSinceMs`/
 *     `edgeEvents`) — never as a fail-closed — because cloudflared reconnects
 *     in-process to the SAME URL; only a process exit or an explicit stop
 *     clears the public origin (fail-closed semantics unchanged).
 *
 * The tunnel target is ALWAYS the loopback Gateway, never DSH directly, so
 * pairing/device-session authentication cannot be bypassed. The service
 * never sees pairing secrets, device tokens, or cookies — transport and auth
 * stay separate. It also binds nothing: cloudflared connects outbound only.
 *
 * Lifecycle safety: an unexpected cloudflared exit clears the public origin
 * immediately (onClosed → gateway CLOSED); a normal stop clears it BEFORE
 * killing the process. No stale public origin may survive a dead tunnel.
 *
 * Status hygiene: `status()` exposes only the phase, the validated public
 * URL, a stable error CODE, the binary source, and a start timestamp. Full
 * filesystem paths and raw process output never leave this service.
 */

export type QuickTunnelPhase = 'idle' | 'resolving' | 'verifying' | 'downloading' | 'starting' | 'connecting' | 'ready' | 'stopping' | 'error'

/**
 * E1-A: post-ready edge-link health of a READY tunnel. `degraded` means the
 * cloudflared process logged a transient loss of its edge connection; it is a
 * DIAGNOSTIC state only — the origin stays open while the process is alive,
 * because the process reconnects in-process to the SAME URL (measured on the
 * pinned 2026.8.2 binary: `Lost connection with the edge` → `Retrying
 * connection` → `Registered tunnel connection` with an unchanged hostname).
 */
export type QuickTunnelEdgeState = 'ok' | 'degraded'

/** One edge-link transition recorded after READY (diagnostics, never fail-closed). */
export interface QuickTunnelEdgeEvent {
  readonly kind: 'degraded' | 'regained'
  /** Epoch ms from the injected now() when the transition was recorded. */
  readonly at: number
  /** Only on `regained`: how long the degraded window lasted. */
  readonly degradedMs?: number
}

/** Stable machine-readable failure codes; the UI maps them to user copy. */
export type TunnelErrorCode =
  | 'unsupported-platform'
  | 'config-conflict'
  | 'download-failed'
  | 'proxy-invalid'
  | 'proxy-connect-failed'
  | 'source-too-slow'
  | 'checksum-mismatch'
  | 'size-mismatch'
  | 'binary-rejected'
  | 'version-mismatch'
  | 'start-timeout'
  | 'spawn-failed'
  | 'exit-before-ready'
  | 'connection-lost'
  | 'internal'

/** Where the cloudflared executable came from; full paths are never exposed. */
export type BinarySource = 'PATH' | 'managed-cache' | 'downloaded'

/**
 * Live progress of an in-flight cloudflared binary download. `totalBytes` is
 * only present when the response advertises Content-Length; `percent` is only
 * derived from a known total — the UI must never fake a percentage. The
 * route used for the CURRENT attempt is reported as `proxySource` /
 * `proxyDisplay` (redacted host:port, never credentials) and the SOURCE is
 * reported as `downloadSource` (官方源 / 备用镜像) so the UI never pretends a
 * mirror is the official source.
 */
export interface DownloadProgress {
  readonly receivedBytes: number
  readonly totalBytes?: number
  readonly percent?: number
  readonly elapsedMs: number
  readonly speedBytesPerSecond?: number
  readonly proxySource?: ProxySource
  readonly proxyDisplay?: string
  readonly downloadSource?: DownloadSourceKind
  /**
   * True while the AUTO slow-source gate is abandoning the current source and
   * the next verified mirror is about to be attempted (the UI shows the
   * switching copy; bytes shown are stale/zero during this gap).
   */
  readonly sourceChanging?: boolean
}

export interface QuickTunnelStatus {
  readonly phase: QuickTunnelPhase
  readonly publicUrl?: string
  readonly lastErrorCode?: TunnelErrorCode
  readonly binarySource?: BinarySource
  readonly startedAt?: number
  /** E1-A link health while phase === 'ready' (absent otherwise). */
  readonly edgeState?: QuickTunnelEdgeState
  /** When edgeState is 'degraded': epoch ms when the current loss was detected. */
  readonly edgeDegradedSinceMs?: number
  /** Bounded recent edge events of the current run (chronological). Diagnostics only. */
  readonly edgeEvents?: readonly QuickTunnelEdgeEvent[]
  /** Download progress while phase === 'downloading' (undefined otherwise). */
  readonly downloadReceivedBytes?: number
  readonly downloadTotalBytes?: number
  readonly downloadPercent?: number
  readonly downloadElapsedMs?: number
  readonly downloadSpeedBytesPerSecond?: number
  readonly downloadProxySource?: ProxySource
  readonly downloadProxyDisplay?: string
  readonly downloadSource?: DownloadSourceKind
  readonly downloadSourceChanging?: boolean
}

/** Minimal process handle; real ChildProcess satisfies it structurally. */
export interface ProcessLike {
  stdout?: {
    on(event: 'data', callback: (chunk: string | Buffer) => void): unknown
    off(event: 'data', callback: (chunk: string | Buffer) => void): unknown
  }
  stderr?: {
    on(event: 'data', callback: (chunk: string | Buffer) => void): unknown
    off(event: 'data', callback: (chunk: string | Buffer) => void): unknown
  }
  on(event: 'exit', callback: (code: number | null, signal: string | null) => void): unknown
  on(event: 'error', callback: (error: Error) => void): unknown
  once(event: 'exit', callback: (code: number | null, signal: string | null) => void): unknown
  once(event: 'error', callback: (error: Error) => void): unknown
  once(event: 'close', callback: () => void): unknown
  kill(signal?: string): boolean
  readonly killed?: boolean
}

export interface QuickTunnelOptions {
  /** Absolute directory for the cached binary. Injected; never hard-coded. */
  readonly cacheDir: string
  /** The loopback gateway port the tunnel forwards to (127.0.0.1:<port>). */
  readonly gatewayPort: number
  readonly startTimeoutMs?: number
  /**
   * R06C4D: how long the tunnel may sit in `connecting` (hostname acquired
   * but the Cloudflare Edge has not yet confirmed the connector route)
   * before the start attempt fails closed. Default 60s: on a healthy network
   * the registration follows the hostname within seconds; the observed worst
   * case on a flaky-DNS box was ~23s (see R06C4D report), so 60s gives
   * headroom while staying finite. Only startup, never a background poll.
   */
  readonly readyTimeoutMs?: number
  /** Test injection points. */
  readonly spawn?: (bin: string, args: string[]) => ProcessLike
  readonly verifyBinary?: (binaryPath: string) => Promise<void>
  readonly downloadBinary?: (cacheDir: string, dest: string, onProgress?: (progress: DownloadProgress) => void) => Promise<void>
  readonly configPreflight?: () => Promise<void>
  /** Test injection: resolve the PATH candidate (default: where/which). */
  readonly pathProbe?: () => Promise<string | undefined>
  /** Test injection: trust-check a PATH candidate (default: signature+version). */
  readonly verifyPathCandidate?: (binaryPath: string) => Promise<boolean>
  readonly now?: () => number
  /** Transport events wired to the public-origin controller by the caller. */
  readonly onReady?: (url: URL) => void
  readonly onClosed?: () => void
  /**
   * R06C4: download network (AUTO/DIRECT/CUSTOM) and source (AUTO/OFFICIAL/
   * MIRROR) selection. A static snapshot is fine; a dynamic resolver lets the
   * caller re-read a persisted UI setting for EVERY download.
   */
  readonly network?: NetworkConfig
  readonly source?: DownloadSourceMode
  readonly resolveNetwork?: () => Promise<{ network: NetworkConfig; source: DownloadSourceMode }>
  /** Local-log diagnostics from the downloader (never user-facing). */
  readonly onDiagnostic?: (diagnostic: string) => void
}

export interface QuickTunnelService {
  /** Single-flight; resolves with the validated tunnel URL. */
  start(): Promise<URL>
  /** Idempotent; clears the public origin BEFORE terminating the process. */
  stop(): Promise<void>
  status(): QuickTunnelStatus
}

/** Error carrying a stable machine code; the start() catch records it. */
export class TunnelStartError extends Error {
  readonly code: TunnelErrorCode
  /** Optional transport facts (e.g. receivedBytes at failure) for route switching. */
  readonly details: { readonly receivedBytes?: number } | undefined
  constructor(code: TunnelErrorCode, message: string, details?: { readonly receivedBytes?: number }) {
    super(message)
    this.name = 'TunnelStartError'
    this.code = code
    this.details = details
  }
}

export const QUICK_TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g

/**
 * Strictly validate a discovered URL. Only plain `https://*.trycloudflare.com`
 * origins pass: no userinfo, no path, no query, no hash, default HTTPS port.
 * A candidate immediately followed by `: / ? #` means the log line carried a
 * port/path/query/hash — that candidate is rejected rather than truncated.
 */
export function parseTunnelUrl(text: string): URL | undefined {
  for (const match of text.matchAll(QUICK_TUNNEL_URL_RE)) {
    const candidate = match[0]
    const next = text[match.index + candidate.length]
    if (next === ':' || next === '/' || next === '?' || next === '#') continue
    try {
      const url = new URL(candidate)
      if (url.protocol !== 'https:') continue
      if (url.username !== '' || url.password !== '') continue
      if (url.hostname === 'trycloudflare.com' || !url.hostname.endsWith('.trycloudflare.com')) continue
      if (url.port !== '' && url.port !== '443') continue
      if (url.pathname !== '/' || url.search !== '' || url.hash !== '') continue
      return url
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * R06C4D — the Edge-readiness signal from cloudflared's OWN log output.
 *
 * The quick-tunnel URL banner explicitly warns "(it may take some time to be
 * reachable)": the hostname is allocated BEFORE the Cloudflare Edge has an
 * established connector route, so a first request in that window returns
 * Cloudflare Error 1033. cloudflared then prints, once the edge really
 * registered the connector:
 *
 *   2026-08-19T14:25:11Z INF Registered tunnel connection connIndex=0
 *   connection=445bea13-568e-4fe7-9a65-22acc6d6574f ...
 *
 * (captured from the real pinned 2026.8.2 binary on Windows — see the
 * R06C4D report, section "current cloudflared log audit"). The stable,
 * version-tolerant structure is the message text `Registered tunnel
 * connection`; the timestamp / connIndex / connection UUID / location are
 * only parse context and are NOT relied upon. Any single registration line
 * (there may be several, one per connection) makes the tunnel ready exactly
 * once.
 */
const TUNNEL_READY_SIGNAL_RE = /Registered tunnel connection/i

export function hasTunnelReadySignal(text: string): boolean {
  return TUNNEL_READY_SIGNAL_RE.test(text)
}

/**
 * E1-A: classify a post-ready edge-link signal from real cloudflared output.
 *
 * The patterns are plain substrings so they match BOTH the console shape
 * (`... INF Lost connection with the edge`) and the JSON logfile shape
 * (`"level":"info",...,"message":"Lost connection with the edge"`). They were
 * captured from the pinned 2026.8.2 binary on 2026-09-07 while a real tunnel
 * was suspended to simulate a transient outage:
 *
 *   loss:    `Lost connection with the edge`
 *            `Serve tunnel error` (error="connection with edge closed")
 *            `Retrying connection in up to 1s`
 *            `Connection terminated`
 *   regain:  the existing `Registered tunnel connection` readiness line
 *
 * A chunk that carries a regain is always classified as `regained` (a regain
 * wins over loss lines that may surround it in the same output burst).
 */
const EDGE_LOST_SIGNAL_RES: readonly RegExp[] = [
  /lost connection with the edge/i,
  /serve tunnel error/i,
  /retrying connection/i,
  /connection terminated/i,
]

export function classifyEdgeLogSignal(text: string): 'lost' | 'regained' | undefined {
  if (hasTunnelReadySignal(text)) return 'regained'
  for (const re of EDGE_LOST_SIGNAL_RES) {
    if (re.test(text)) return 'lost'
  }
  return undefined
}

/** Standard locations where a user Cloudflare config could affect a Quick Tunnel. */
export function cloudflaredConfigCandidates(): string[] {
  const home = homedir()
  const paths = [
    join(home, '.cloudflared', 'config.yml'),
    join(home, '.cloudflared', 'config.yaml'),
  ]
  if (process.platform === 'win32' && process.env.APPDATA !== undefined && process.env.APPDATA !== '') {
    paths.push(join(process.env.APPDATA, 'cloudflared', 'config.yml'))
  }
  return paths
}

/**
 * Default preflight: refuse to start a Quick Tunnel while a user Cloudflare
 * config exists that could affect it. NON-DESTRUCTIVE by design — nothing is
 * renamed, deleted, or edited; the user gets a clear status error instead.
 */
export async function defaultCloudflaredConfigPreflight(): Promise<void> {
  for (const candidate of cloudflaredConfigCandidates()) {
    try {
      await access(candidate)
    } catch {
      continue // absent — fine
    }
    throw new TunnelStartError(
      'config-conflict',
      'An existing Cloudflare Tunnel configuration was detected. '
      + 'Quick Tunnel cannot start with the current configuration. '
      + 'None of your Cloudflare configuration files were modified.',
    )
  }
}

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error !== null && error !== undefined) reject(error)
      else resolve()
    })
  })
}

function execFileCapture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8' }, (error, stdout) => {
      if (error !== null && error !== undefined) reject(error)
      else resolve(String(stdout))
    })
  })
}

/**
 * Resolve the PATH candidate to an ABSOLUTE path, or undefined when no
 * `cloudflared` is on PATH. The returned path is what gets trust-checked;
 * nothing is executed by name without a check.
 */
async function resolvePathCloudflared(): Promise<string | undefined> {
  const probe = process.platform === 'win32'
    ? execFileCapture('where', ['cloudflared'])
    : execFileCapture('which', ['cloudflared'])
  try {
    const output = await probe
    const first = output.split(/\r?\n/).map(line => line.trim()).find(line => line.length > 0)
    return first ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Whether `cloudflared --version` output looks like a real cloudflared
 * version line (pure; unit-tested). Used by the PATH trust gate.
 */
export function pathCandidateVersionOk(output: string): boolean {
  return /^\s*cloudflared version \d+\.\d+\.\d+/i.test(output)
}

/**
 * The PATH trust gate: a PATH candidate is executed ONLY when it passes an
 * explicit check. PATH candidates are NOT required to match the pinned hash
 * (the user may have installed another official version), so the check is:
 *
 *   1. `cloudflared --version` runs and reports a cloudflared version — the
 *      binary actually executes as cloudflared,
 *   2. on Windows, the Authenticode signature must be STRICTLY Valid AND
 *      issued to Cloudflare. Unlike the managed chain, NotSigned does NOT
 *      pass for a PATH candidate: an unsigned file on PATH is unknown code
 *      and must never be auto-executed.
 *
 * Any failure rejects the candidate; the caller falls back to the managed
 * pinned binary instead of executing unknown code.
 */
export async function verifyPathCloudflaredCandidate(binaryPath: string): Promise<boolean> {
  let versionOutput: string
  try {
    versionOutput = await execFileCapture(binaryPath, ['--version'])
  } catch {
    return false
  }
  if (!pathCandidateVersionOk(versionOutput)) return false
  if (process.platform !== 'win32') return true // no signature infra on POSIX; version gate above
  return await pathCandidateAuthenticodeValid(binaryPath)
}

/** Strict Windows Authenticode gate for a PATH candidate (Valid + Cloudflare only). */
async function pathCandidateAuthenticodeValid(binaryPath: string): Promise<boolean> {
  const escaped = binaryPath.replace(/'/g, "''")
  const script = `$sig = Get-AuthenticodeSignature -LiteralPath '${escaped}'; `
    + `if ($sig.Status -eq 'Valid' -and $sig.SignerCertificate -and $sig.SignerCertificate.Subject -match 'Cloudflare') { exit 0 }; exit 1`
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
    return true
  } catch {
    return false // NotSigned, invalid, tampered, or not Cloudflare — rejected
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function sha256OfFile(path: string): Promise<string> {
  const { createReadStream } = await import('node:fs')
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk as Buffer))
    stream.on('error', reject)
    stream.on('end', () => { resolve() })
  })
  return hash.digest('hex')
}

/**
 * The reproducible verification chain for EVERY managed binary (fresh
 * download or cached), run before any execution:
 *
 *   1. byte size equals the pinned official size,
 *   2. SHA-256 equals the pinned official hash,
 *   3. `<binary> --version` runs and prints the pinned version,
 *   4. Windows Authenticode (when the signature is present): a Valid
 *      Cloudflare signature passes; an Invalid/tampered signature fails. A
 *      NotSigned binary still passes — the pinned hash + version are the
 *      primary gates, Authenticode is never the only one.
 *
 * For a `.tgz` (darwin) asset the file examined is the previously EXTRACTED
 * binary, whose byte size and hash are NOT the pinned values (those belong to
 * the container archive). Only the `--version` gate can apply, and it reuses
 * the identical pinned-version check.
 *
 * Any failure throws a {@link TunnelStartError} with a stable code.
 */
export async function defaultVerifyBinary(
  binaryPath: string,
  asset: CloudflaredAsset = cloudflaredAssetFor(process.platform, process.arch),
): Promise<void> {
  if (isArchivedAsset(asset)) {
    // darwin: the file is the extracted binary, not the .tgz — the pinned
    // size/SHA-256 describe the container, so the runnable gate is version-only.
    await verifyRunnableVersion(binaryPath)
    return
  }
  if (!isRunnableAsset(asset)) {
    throw new TunnelStartError(
      'unsupported-platform',
      `the ${asset.assetName} package (${asset.kind}) is not runnable on this round's verifier`,
    )
  }
  const size = (await stat(binaryPath)).size
  if (size !== asset.sizeBytes) {
    throw new TunnelStartError('size-mismatch',
      `cloudflared size mismatch: expected ${String(asset.sizeBytes)} bytes, got ${String(size)}`)
  }
  const hash = await sha256OfFile(binaryPath)
  if (hash !== asset.sha256) {
    throw new TunnelStartError('checksum-mismatch',
      'cloudflared SHA-256 does not match the pinned official checksum; the binary is rejected')
  }
  await verifyRunnableVersion(binaryPath)
  if (process.platform === 'win32') {
    await verifyAuthenticodeIfPresent(binaryPath)
  }
}

/** Run `<binary> --version` and require it to report the pinned version. */
async function verifyRunnableVersion(binaryPath: string): Promise<void> {
  let versionOutput: string
  try {
    versionOutput = await execFileCapture(binaryPath, ['--version'])
  } catch {
    throw new TunnelStartError('binary-rejected',
      'cloudflared could not be executed; the binary is rejected')
  }
  if (!versionOutput.includes(CLOUDFLARED_PINNED_VERSION)) {
    throw new TunnelStartError('version-mismatch',
      `cloudflared reported a different version than the pinned ${CLOUDFLARED_PINNED_VERSION}; the binary is rejected`)
  }
}

/**
 * Verify the RAW downloaded artifact (before any extraction/rename) against
 * the pinned trust anchor. This is the download-time gate:
 *
 *   - `tgz` (darwin): the file is the container archive — verify its size and
 *     SHA-256 only (a gzip archive cannot run `--version`); the extracted
 *     binary is gated separately by {@link defaultVerifyBinary};
 *   - `exe`/`bin`: the full runnable chain (delegates to
 *     {@link defaultVerifyBinary}).
 */
export async function defaultVerifyDownloadedAsset(
  path: string,
  asset: CloudflaredAsset = cloudflaredAssetFor(process.platform, process.arch),
): Promise<void> {
  if (isArchivedAsset(asset)) {
    const size = (await stat(path)).size
    if (size !== asset.sizeBytes) {
      throw new TunnelStartError('size-mismatch',
        `cloudflared archive size mismatch: expected ${String(asset.sizeBytes)} bytes, got ${String(size)}`)
    }
    const hash = await sha256OfFile(path)
    if (hash !== asset.sha256) {
      throw new TunnelStartError('checksum-mismatch',
        'cloudflared archive SHA-256 does not match the pinned official checksum; the archive is rejected')
    }
    return
  }
  return defaultVerifyBinary(path, asset)
}

/**
 * Windows Authenticode: fail only on a signature that is present but NOT
 * valid, or valid but not issued to Cloudflare. A NotSigned binary passes
 * (the pinned hash + version chain is the primary gate).
 */
async function verifyAuthenticodeIfPresent(binaryPath: string): Promise<void> {
  const escaped = binaryPath.replace(/'/g, "''")
  const script = `$sig = Get-AuthenticodeSignature -LiteralPath '${escaped}'; `
    + `if ($sig.Status -eq 'Valid' -and $sig.SignerCertificate -and $sig.SignerCertificate.Subject -match 'Cloudflare') { exit 0 }; `
    + `if ($sig.Status -eq 'NotSigned') { exit 0 }; `
    + `if ($sig.Status -ne 'Valid') { exit 1 }; exit 2`
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
  } catch (error) {
    const code = (error as { code?: number | string } | null)?.code
    if (code === 2) {
      throw new TunnelStartError('binary-rejected',
        'cloudflared is signed, but not by Cloudflare; the binary is rejected')
    }
    // Code 1 or a missing PowerShell: a tampered signature or an environment
    // that cannot audit the signature. The pinned hash already passed, so a
    // missing PowerShell is treated as "signature unavailable" (pass); an
    // explicit invalid status (exit 1) still fails.
    if (code === 1) {
      throw new TunnelStartError('binary-rejected',
        'cloudflared Authenticode signature is invalid; the binary is rejected')
    }
  }
}

/**
 * Download timeout model (R06C2, refined R06C4).
 *
 * A fixed wall-clock cap is the WRONG model for a 55 MB binary on a slow but
 * healthy link. Measured first-run reality on this project's acceptance
 * machine ranged from 0.37 MB/s down to 15 KB/s on a degraded day — the full
 * binary can legitimately need over an hour. The model is:
 *
 *   - FIRST-BYTE (10 s): the response arrived (200 + Content-Length) but the
 *     first body chunk never comes — the R06C3 direct case delivered 0 B in
 *     240 s. Waiting out the idle window would waste a minute per route, so
 *     the first read gets its own short deadline and the route is switched.
 *   - IDLE (60 s): if no new bytes arrive for a sustained window after the
 *     first chunk, the link is stalled — abort. Every received chunk resets
 *     the idle timer, so a slow but progressing download is NEVER cut off.
 *   - OVERALL safety cap (10 min) with a PROGRESS FLOOR (1 MiB): a pure
 *     wall-clock cap would abort a healthy 15 KB/s download at 64% (the R06C2
 *     real E2E reproduced exactly that under a fixed cap). The cap therefore
 *     only fires when the connection has ALSO delivered under 1 MiB — i.e. a
 *     pathological trickle. Anything that has genuinely transferred more than
 *     1 MiB runs to completion; later stalls are caught by the idle timeout.
 *     (R06C4 removed the previous unconditional abort-style cap that killed a
 *     healthy download the moment it crossed the wall clock, floor or not.)
 */
export const DOWNLOAD_IDLE_TIMEOUT_MS = 60_000
export const DOWNLOAD_OVERALL_TIMEOUT_MS = 600_000
export const DOWNLOAD_OVERALL_MIN_BYTES = 1_048_576
export const DOWNLOAD_FIRST_BYTE_TIMEOUT_MS = 10_000

/**
 * Slow-source gate (R06C4A). The FIRST-BYTE and IDLE timeouts cannot see the
 * real product problem: a source that delivers bytes but only at ~0.1 MB/s
 * (R06C4 real E2E B: official direct took ~8.3 min for 52.4 MB and never
 * fell back). In AUTO mode, when the CURRENT source is `official`, we sample
 * the real download speed over a window starting at the FIRST body chunk
 * (DNS/TLS/redirect/TTFB are excluded — the pre-first-byte phase stays with
 * the first-byte timeout), and if the window elapsed with the effective
 * average below the threshold, the route is abandoned (request aborted,
 * .part removed) and the next verified mirror is tried.
 *
 * These values are an IMPLEMENTATION policy, not a user-facing SLA: they are
 * tuned so the gate fires only when the official source is so slow that it
 * clearly hurts the one-click experience, never "switch because a mirror
 * might be faster". Mirrors are never slow-gated (no mirror→mirror churn).
 */
export const DOWNLOAD_SLOW_WINDOW_MS = 15_000
/** Minimum meaningful sample; if the window elapses without it, that IS slow. */
export const DOWNLOAD_SLOW_MIN_BYTES = 512 * 1024
export const DOWNLOAD_SLOW_THRESHOLD_BYTES_PER_SEC = 300 * 1024

/** Options for the R06C4 proxy/source-aware downloader. */
export interface DownloadRouteOptions {
  readonly cacheDir: string
  readonly dest: string
  readonly verify: (path: string) => Promise<void>
  readonly onProgress?: (progress: DownloadProgress) => void
  readonly timeouts?: {
    idleMs?: number
    overallMs?: number
    overallMinBytes?: number
    firstByteMs?: number
    slowWindowMs?: number
    slowMinBytes?: number
    slowThresholdBytesPerSecond?: number
  }
  /** Download network mode + custom proxy (default: auto). */
  readonly network?: NetworkConfig
  /** Download source mode (default: auto). */
  readonly source?: DownloadSourceMode
  /** Test injection: environment mapping (default: process.env). */
  readonly env?: Record<string, string | undefined>
  /** Test injection: Windows system-proxy reader (default: reg query). */
  readonly readSystemProxy?: () => Promise<SystemProxyRead>
  /** Test injection: source list (default: resolveDownloadSources(mode)). */
  readonly sources?: readonly DownloadSource[]
  /** Local-log diagnostics; never user-facing, never contain credentials. */
  readonly onDiagnostic?: (diagnostic: string) => void
  /**
   * Fired right before the route loop abandons the current route for the next
   * one (e.g. the AUTO slow-source gate switching official → mirror). Lets the
   * status surface show a sourceChanging transition instead of stale bytes.
   */
  readonly onSourceSwitch?: (next: { readonly source: DownloadSource; readonly path: ProxyCandidate }) => void
}

/**
 * R06C4: download cloudflared through ordered (network path × source) routes.
 *
 * SOURCE (which server) and NETWORK PATH (which route) are orthogonal:
 *   - paths are resolved from the network mode (auto: custom → env → system →
 *     direct; direct: direct only; custom: the configured proxy only);
 *   - sources are resolved from the source mode (auto: official → verified
 *     mirrors; official: official only; mirror: verified mirrors only).
 * Routes are tried SERIALLY — no parallel racing, no double bandwidth — and
 * every (path, source) combination at most once. A trust-chain failure
 * (checksum/size/version/signature) always skips to the next source: a mirror
 * is transport, never a trust root, and every source runs the identical
 * verification. A network failure after real progress (>= the progress floor)
 * is NOT retried — no full re-download for late jitter.
 *
 * The proxy is REQUEST-SCOPED: an undici ProxyAgent is created per attempt and
 * closed when the attempt ends. Nothing here mutates the undici global
 * dispatcher, process.env, or the Windows system proxy — DSH's own network
 * traffic (OAuth, models, updater, other plugins) is untouched.
 */
export async function downloadWithNetworkRoutes(options: DownloadRouteOptions): Promise<void> {
  const network = options.network ?? { network: 'auto' as const }
  const sourceMode = options.source ?? 'auto'
  const env = options.env ?? process.env
  const readSystem = options.readSystemProxy ?? (() => readWinInetStaticProxy())
  const resolution = await resolveNetworkPaths(network, env, readSystem)
  for (const diagnostic of resolution.diagnostics) options.onDiagnostic?.(diagnostic)
  if (resolution.candidates.length === 0) {
    throw new TunnelStartError('proxy-invalid',
      'no download network route is available for the configured mode; check the download network setting', { receivedBytes: 0 })
  }
  const sources = options.sources ?? resolveDownloadSources(sourceMode)
  if (sources.length === 0) {
    throw new TunnelStartError('proxy-invalid',
      'no download source is available for the configured mode', { receivedBytes: 0 })
  }
  const timeouts = {
    idleMs: options.timeouts?.idleMs ?? DOWNLOAD_IDLE_TIMEOUT_MS,
    overallMs: options.timeouts?.overallMs ?? DOWNLOAD_OVERALL_TIMEOUT_MS,
    overallMinBytes: options.timeouts?.overallMinBytes ?? DOWNLOAD_OVERALL_MIN_BYTES,
    firstByteMs: options.timeouts?.firstByteMs ?? DOWNLOAD_FIRST_BYTE_TIMEOUT_MS,
    slowWindowMs: options.timeouts?.slowWindowMs ?? DOWNLOAD_SLOW_WINDOW_MS,
    slowMinBytes: options.timeouts?.slowMinBytes ?? DOWNLOAD_SLOW_MIN_BYTES,
    slowThresholdBytesPerSecond: options.timeouts?.slowThresholdBytesPerSecond ?? DOWNLOAD_SLOW_THRESHOLD_BYTES_PER_SEC,
  }

  let lastError: TunnelStartError | undefined
  const attempted = new Set<string>()
  // Paths OUTER (best proxy first), sources INNER: with a working system proxy
  // the official source is fetched through it first (the E2E A case) and no
  // mirror is touched; a dead proxy moves the whole source list to the next
  // network path (e.g. direct) so proxy-less users still get mirror fallback.
  for (const path of resolution.candidates) {
    for (const source of sources) {
      const key = `${source.id}\u0000${path.source}\u0000${path.url ?? ''}`
      if (attempted.has(key)) continue
      attempted.add(key)
      try {
        await attemptDownloadRoute({ ...options, source, path, sourceMode, timeouts })
        return
      } catch (error) {
        const tunnel = error instanceof TunnelStartError
          ? error
          : new TunnelStartError('download-failed',
            `cloudflared download failed (${error instanceof Error ? error.message : String(error)}); check the network and retry`,
            { receivedBytes: 0 })
        lastError = tunnel
        if (!shouldTryNextRoute(tunnel, timeouts.overallMinBytes)) throw tunnel
        // The current route is being abandoned: announce the switch so the UI
        // can show the transition (and never present stale bytes as current).
        options.onSourceSwitch?.({ source, path })
        options.onDiagnostic?.(`download route ${source.id}@${path.source} abandoned (${tunnel.code}); trying next route`)
      }
    }
  }
  // Every route was tried. `source-too-slow` is a FALLBACK reason, never a
  // final user error: when it is all we have, surface the stable
  // download-failed model instead.
  if (lastError !== undefined && lastError.code === 'source-too-slow') {
    throw new TunnelStartError('download-failed',
      'cloudflared download failed: every available source was too slow or unreachable; check the network and retry',
      { receivedBytes: 0 })
  }
  throw lastError ?? new TunnelStartError('download-failed',
    'cloudflared download failed; check the network and retry', { receivedBytes: 0 })
}

function shouldTryNextRoute(error: TunnelStartError, overallMinBytes: number): boolean {
  switch (error.code) {
    // Connect-phase proxy failure: try the next route (next path or source).
    case 'proxy-connect-failed':
      return true
    // AUTO slow-source gate: the official source is delivering bytes but far
    // below a usable rate — abandon it and try the next verified mirror.
    case 'source-too-slow':
      return true
    // Network failure BEFORE meaningful progress (incl. first-byte timeout and
    // the pathological trickle): switching costs nothing. A failure AFTER real
    // progress (>= the floor) is not transport jitter — never re-download.
    case 'download-failed':
      return (error.details?.receivedBytes ?? 0) < overallMinBytes
    // Trust-chain failures are SOURCE-level: a source that fails size/SHA/
    // version/signature is skipped and the next source is verified with the
    // identical chain. A mirror can never become a trust root.
    case 'checksum-mismatch':
    case 'size-mismatch':
    case 'binary-rejected':
    case 'version-mismatch':
      return true
    default:
      return false
  }
}

interface RouteAttempt {
  readonly cacheDir: string
  readonly dest: string
  readonly verify: (path: string) => Promise<void>
  readonly onProgress?: (progress: DownloadProgress) => void
  readonly timeouts: {
    idleMs: number
    overallMs: number
    overallMinBytes: number
    firstByteMs: number
    slowWindowMs: number
    slowMinBytes: number
    slowThresholdBytesPerSecond: number
  }
  readonly source: DownloadSource
  readonly path: ProxyCandidate
  readonly sourceMode: DownloadSourceMode
}

/**
 * One (source × network path) download attempt: stream to `.part`, verify in
 * full, atomic rename. The proxy is REQUEST-SCOPED (undici ProxyAgent created
 * and closed around this attempt only). Every failure maps to a stable
 * TunnelStartError carrying `details.receivedBytes` so the route loop can
 * decide whether switching is worthwhile.
 */
async function attemptDownloadRoute(attempt: RouteAttempt): Promise<void> {
  await mkdir(attempt.cacheDir, { recursive: true })
  const temporary = join(attempt.cacheDir, `cloudflared.download.${String(process.pid)}.part`)
  const {
    idleMs, overallMs, overallMinBytes, firstByteMs,
    slowWindowMs, slowMinBytes, slowThresholdBytesPerSecond,
  } = attempt.timeouts
  const startedAt = Date.now()
  let receivedBytes = 0
  let totalBytes: number | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let overallTimer: ReturnType<typeof setTimeout> | undefined
  let handle: Awaited<ReturnType<typeof open>> | undefined
  let agent: ProxyAgent | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  /** Set when the FIRST body chunk arrives; the slow gate counts from here. */
  let firstChunkAt: number | undefined

  const reportProgress = (): void => {
    attempt.onProgress?.({
      receivedBytes,
      ...(totalBytes === undefined ? {} : {
        totalBytes,
        percent: totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0,
      }),
      elapsedMs: Date.now() - startedAt,
      speedBytesPerSecond: Math.max(0, Date.now() - startedAt) > 0
        ? Math.round(receivedBytes / (Math.max(1, Date.now() - startedAt) / 1000))
        : 0,
      proxySource: attempt.path.source,
      ...(attempt.path.display === undefined ? {} : { proxyDisplay: attempt.path.display }),
      downloadSource: attempt.source.kind,
    })
  }

  const clearTimers = (): void => {
    if (idleTimer !== undefined) { clearTimeout(idleTimer); idleTimer = undefined }
    if (overallTimer !== undefined) { clearTimeout(overallTimer); overallTimer = undefined }
  }

  const timerUnref = (timer: ReturnType<typeof setTimeout>): void => {
    if (typeof timer.unref === 'function') timer.unref()
  }

  try {
    let response: Response
    try {
      if (attempt.path.url === undefined) {
        // DIRECT: the default global fetch — nothing about the runtime is changed.
        response = await fetch(attempt.source.url)
      } else {
        // Request-scoped proxy: one ProxyAgent for THIS request only; the
        // global dispatcher and process env are never touched.
        agent = new ProxyAgent(attempt.path.url)
        try {
          // The dispatcher is request-scoped: @types/node's RequestInit types
          // the dispatcher against its own undici-types copy, so the agent is
          // carried through a RequestInit cast — the runtime object is the
          // undici 6 ProxyAgent itself.
          response = await fetch(attempt.source.url, { dispatcher: agent } as unknown as RequestInit)
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          throw new TunnelStartError('proxy-connect-failed',
            `cloudflared download via proxy ${attempt.path.display ?? attempt.path.source} failed (${reason}); check the proxy and retry`,
            { receivedBytes: 0 })
        }
      }
    } catch (error) {
      if (error instanceof TunnelStartError) throw error
      const reason = error instanceof Error ? error.message : String(error)
      throw new TunnelStartError('download-failed',
        `cloudflared download failed (${reason}); check the network and retry`, { receivedBytes: 0 })
    }
    if (!response.ok) {
      throw new TunnelStartError('download-failed',
        `cloudflared download failed: HTTP ${String(response.status)}`, { receivedBytes: 0 })
    }
    const contentLength = response.headers.get('content-length')
    if (contentLength !== null) {
      const parsed = Number(contentLength)
      if (Number.isFinite(parsed) && parsed >= 0) totalBytes = parsed
    }
    if (response.body === null) {
      throw new TunnelStartError('download-failed',
        'cloudflared download failed: response has no body', { receivedBytes: 0 })
    }

    // Stream the body chunk-by-chunk to the .part file. Never buffer the
    // whole 55 MB in memory. Timeouts are handled DETERMINISTICALLY per read
    // (a race, not abort-signal propagation): the FIRST read races the
    // first-byte deadline (200 + Content-Length with no body chunk = stalled
    // route), every later read races the idle window. A slow-but-progressing
    // stream is never cut because every arriving chunk starts a fresh idle
    // window. The file is a FileHandle (opened synchronously by
    // fs.promises.open) so a failed attempt always has a deterministically
    // awaited close — no async 'open' race with destroy() that could leak an
    // fd or a .part on Windows.
    handle = await open(temporary, 'wx', 0o600)
    reader = response.body.getReader()

    let firstRead = true
    const readChunk = (): Promise<{ done: boolean; value: Uint8Array | undefined }> => {
      const read = reader!.read()
      const deadlineMs = firstRead ? firstByteMs : idleMs
      firstRead = false
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (deadlineMs === firstByteMs) {
            reject(new TunnelStartError('download-failed',
              `cloudflared download received no data within ${String(firstByteMs)} ms (first-byte timeout); the route appears stalled, trying another source`,
              { receivedBytes: 0 }))
          } else {
            reject(new TunnelStartError('download-failed',
              `cloudflared download stalled: no data for ${String(idleMs)} ms; check the network and retry`,
              { receivedBytes }))
          }
        }, deadlineMs)
        timerUnref(timer)
        read.then(
          (result) => { clearTimeout(timer); resolve(result) },
          (error) => { clearTimeout(timer); reject(error) },
        )
      })
    }

    /**
     * R06C4A slow-source gate: ONLY for AUTO mode on the OFFICIAL source, and
     * only AFTER the first body chunk (DNS/TLS/redirect/TTFB are excluded —
     * the pre-first-byte phase belongs to the first-byte timeout). When the
     * window elapses with an effective average below the threshold (or with
     * less than the minimum sample — which is itself "slow"), the attempt is
     * abandoned with the internal `source-too-slow` reason and the route loop
     * tries the next verified mirror. A fast initial burst followed by a
     * normal rate never trips the gate (the average over the window decides).
     */
    const checkSlowSource = (): void => {
      if (attempt.sourceMode !== 'auto' || attempt.source.kind !== 'official') return
      if (firstChunkAt === undefined) return
      const sinceFirst = Date.now() - firstChunkAt
      if (sinceFirst < slowWindowMs) return
      const avgBytesPerSecond = receivedBytes / (sinceFirst / 1000)
      if (receivedBytes < slowMinBytes || avgBytesPerSecond < slowThresholdBytesPerSecond) {
        throw new TunnelStartError('source-too-slow',
          `official source too slow: ${String(Math.round(avgBytesPerSecond))} B/s over a ${String(slowWindowMs)} ms window (${String(receivedBytes)} bytes); switching to a backup mirror`,
          { receivedBytes })
      }
    }

    // Overall safety cap with a PROGRESS FLOOR: at expiry, only abort when the
    // connection has delivered under the floor — a pathological trickle that
    // occupies the flow without real progress. A download that has genuinely
    // transferred more is real and keeps running (later stalls are caught by
    // the per-read race). A trickle never resets the floor, so it still gets
    // cut at the cap.
    const overall = new Promise<never>((_resolve, reject) => {
      overallTimer = setTimeout(() => {
        if (receivedBytes < overallMinBytes) {
          void reader?.cancel('overall-cap').catch(() => {})
          reject(new TunnelStartError('download-failed',
            `cloudflared download made no real progress within ${String(overallMs)} ms (only ${String(receivedBytes)} of ${String(overallMinBytes)} min bytes); check the network and retry`,
            { receivedBytes }))
        }
        // else: healthy slow download — leave it running; the loop ends on its own.
      }, overallMs)
      timerUnref(overallTimer)
    })

    const downloadLoop = (async (): Promise<void> => {
      for (;;) {
        const { done, value } = await readChunk()
        if (done) break
        if (value === undefined) break
        if (firstChunkAt === undefined) firstChunkAt = Date.now()
        receivedBytes += value.byteLength
        await handle!.write(value)
        reportProgress()
        checkSlowSource()
      }
    })()

    await Promise.race([downloadLoop, overall])
    await handle.sync().catch(() => {})
    await handle.close()
    handle = undefined
    reportProgress()
    if (totalBytes !== undefined && receivedBytes !== totalBytes) {
      throw new TunnelStartError('size-mismatch',
        `cloudflared download size mismatch: expected ${String(totalBytes)} bytes, got ${String(receivedBytes)}`,
        { receivedBytes })
    }
    const asset = cloudflaredAssetFor(process.platform, process.arch)
    if (isArchivedAsset(asset)) {
      // darwin .tgz: the raw-artifact gate is archive-specific (size + SHA-256;
      // `--version` cannot run on a gzip archive), then extract, then gate the
      // RUNNABLE result (version-only — the pinned size/SHA-256 belong to the
      // .tgz). The injected verifyBinary is the RUNNABLE gate, so it is NOT
      // used on the raw archive; the archive verifier is used explicitly.
      await defaultVerifyDownloadedAsset(temporary)
      await extractCloudflaredBinary(temporary, attempt.dest)
      try {
        await defaultVerifyBinary(attempt.dest)
      } catch (error) {
        // Never leave a damaged extracted binary in the managed cache.
        await rm(attempt.dest, { force: true }).catch(() => {})
        throw error instanceof TunnelStartError
          ? error
          : new TunnelStartError('binary-rejected',
            `extracted cloudflared failed the runnable gate (${error instanceof Error ? error.message : String(error)}); the archive is rejected`,
            { receivedBytes })
      }
    } else {
      // exe/bin: the raw artifact IS the runnable binary — full chain, then
      // atomic rename.
      await attempt.verify(temporary)
      try {
        await rename(temporary, attempt.dest)
      } catch (error) {
        throw new TunnelStartError('download-failed',
          `cloudflared download could not be finalized (${error instanceof Error ? error.message : String(error)})`,
          { receivedBytes })
      }
    }
  } catch (error) {
    if (error instanceof TunnelStartError) throw error
    // A slow/dropped connection fired mid-body: this is a DOWNLOAD failure,
    // never a generic internal error. Keep the cause in the message so the
    // local log can diagnose it.
    const reason = error instanceof Error ? error.message : String(error)
    throw new TunnelStartError('download-failed',
      `cloudflared download failed (${reason}); check the network and retry`, { receivedBytes })
  } finally {
    clearTimers()
    // Deterministically close the FileHandle (if still open) BEFORE removing
    // the .part — on Windows rm() racing an open handle leaves a partial file
    // behind (R06C2 regression test caught this under parallel load).
    if (handle !== undefined) {
      await handle.close().catch(() => {})
      handle = undefined
    }
    // Abandon the request body (slow-source gate / any mid-body failure): stop
    // pulling and release the underlying connection so no orphan socket keeps
    // downloading in the background.
    if (reader !== undefined) {
      await reader.cancel('route-abandoned').catch(() => {})
      reader = undefined
    }
    // fs.rm retries transient EBUSY/EPERM (Windows keeps a handle a few ms
    // after close); the .part must never survive a failed attempt.
    await rm(temporary, { force: true, maxRetries: 5, retryDelay: 100 })
    // The request-scoped proxy agent dies with the attempt.
    if (agent !== undefined) {
      await agent.close().catch(() => {})
      agent = undefined
    }
  }
}

/**
 * Default download (backward-compatible entry): DIRECT network path, OFFICIAL
 * source only — exactly the pre-R06C4 behavior. The proxy/source-aware entry
 * point is {@link downloadWithNetworkRoutes}.
 */
export async function defaultDownloadBinary(
  cacheDir: string,
  dest: string,
  verify: (path: string) => Promise<void> = defaultVerifyDownloadedAsset,
  onProgress?: (progress: DownloadProgress) => void,
  timeouts: { idleMs?: number; overallMs?: number; overallMinBytes?: number } = {},
): Promise<void> {
  await downloadWithNetworkRoutes({
    cacheDir,
    dest,
    verify,
    ...(onProgress === undefined ? {} : { onProgress }),
    timeouts,
    network: { network: 'direct' },
    source: 'official',
  })
}

export function createQuickTunnelService(options: QuickTunnelOptions): QuickTunnelService {
  const cacheDir = options.cacheDir
  const gatewayPort = options.gatewayPort
  const startTimeoutMs = options.startTimeoutMs ?? 30_000
  const readyTimeoutMs = options.readyTimeoutMs ?? 60_000
  const now = options.now ?? (() => Date.now())
  const spawnFn = options.spawn ?? ((bin: string, args: string[]) => nodeSpawn(bin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as unknown as ProcessLike)
  const verifyBinary = options.verifyBinary ?? defaultVerifyBinary
  const downloadBinary = options.downloadBinary ?? (async (dir: string, dest: string, onProgress?: (progress: DownloadProgress) => void) => {
    // R06C4: resolve the LIVE network/source settings (a persisted UI change
    // applies to the next download without a restart), then download through
    // the proxy/source-aware router. R06C4A: a source switch (AUTO slow gate)
    // is surfaced as a sourceChanging transition, never as stale bytes.
    const resolved = options.resolveNetwork !== undefined
      ? await options.resolveNetwork()
      : {
          network: options.network ?? { network: 'auto' as const },
          source: options.source ?? ('auto' as const),
        }
    await downloadWithNetworkRoutes({
      cacheDir: dir,
      dest,
      verify: verifyBinary,
      ...(onProgress === undefined ? {} : { onProgress }),
      network: resolved.network,
      source: resolved.source,
      ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
      onSourceSwitch: (next) => {
        onProgress?.({
          receivedBytes: 0,
          elapsedMs: 0,
          proxySource: next.path.source,
          ...(next.path.display === undefined ? {} : { proxyDisplay: next.path.display }),
          downloadSource: next.source.kind,
          sourceChanging: true,
        })
      },
    })
  })
  const configPreflight = options.configPreflight ?? defaultCloudflaredConfigPreflight
  const pathProbe = options.pathProbe ?? resolvePathCloudflared
  const verifyPathCandidate = options.verifyPathCandidate ?? verifyPathCloudflaredCandidate

  let phase: QuickTunnelPhase = 'idle'
  let publicUrl: URL | undefined
  let lastErrorCode: TunnelErrorCode | undefined
  let binarySource: BinarySource | undefined
  let startedAt: number | undefined
  let downloadProgress: DownloadProgress | undefined
  let child: ProcessLike | undefined
  let exitWaiter: Promise<void> | undefined
  let startPromise: Promise<URL> | undefined
  let stopPromise: Promise<void> | undefined
  let intentionalStop = false

  // E1-A post-ready edge-link diagnostics. These are NEVER a fail-closed
  // trigger by themselves: a live process holds the same URL, so a loss is
  // expected to self-heal in-process (see classifyEdgeLogSignal).
  const EDGE_EVENT_LIMIT = 8
  let edgeState: QuickTunnelEdgeState | undefined
  let edgeDegradedSinceMs: number | undefined
  let edgeEvents: QuickTunnelEdgeEvent[] = []

  function recordEdgeEvent(event: QuickTunnelEdgeEvent): void {
    edgeEvents = [...edgeEvents.slice(-(EDGE_EVENT_LIMIT - 1)), event]
  }

  function resetEdgeDiagnostics(): void {
    edgeState = undefined
    edgeDegradedSinceMs = undefined
    edgeEvents = []
  }

  function killChild(): void {
    if (child === undefined || child.killed) return
    try { child.kill() } catch { /* already gone */ }
  }

  /** Read the live phase through a call so TS cannot narrow it across awaits. */
  function currentPhase(): QuickTunnelPhase {
    return phase
  }

  /**
   * E1-A: watch the live edge link while READY. `lost` marks the tunnel
   * degraded (once per loss window); a later `regained` ends the window and
   * records its duration. Both transitions are logged as local diagnostics so
   * a later incident has a phase/duration timeline. Fail-closed behavior is
   * untouched: this function never clears the origin or flips phase — only a
   * process exit or an explicit stop does.
   */
  function watchEdgeLog(text: string): void {
    const signal = classifyEdgeLogSignal(text)
    if (signal === 'lost') {
      if (edgeState !== 'degraded') {
        const at = now()
        edgeState = 'degraded'
        edgeDegradedSinceMs = at
        recordEdgeEvent({ kind: 'degraded', at })
        options.onDiagnostic?.(`tunnel:edge-degraded at=${String(at)}`)
      }
      return
    }
    if (signal === 'regained' && edgeState === 'degraded') {
      const at = now()
      const degradedMs = Math.max(0, at - (edgeDegradedSinceMs ?? at))
      edgeState = 'ok'
      edgeDegradedSinceMs = undefined
      recordEdgeEvent({ kind: 'regained', at, degradedMs })
      options.onDiagnostic?.(`tunnel:edge-regained degradedMs=${String(degradedMs)}`)
    }
  }

  /**
   * Resolve which binary to run and verify it BEFORE any execution. A PATH
   * candidate runs ONLY after the explicit trust gate (signature + version);
   * an untrusted PATH binary is ignored and the managed pinned binary is the
   * fallback. A cached binary is re-verified on EVERY start (size + hash +
   * version); a verification failure marks it damaged, deletes it, and falls
   * through to a fresh verified download.
   */
  async function resolveBinaryPath(): Promise<{ bin: string; source: BinarySource }> {
    const pathCandidate = await pathProbe()
    if (pathCandidate !== undefined) {
      // Never execute a PATH candidate on name alone: verify it explicitly.
      // A rejected candidate is silently ignored (the managed chain below is
      // the safe fallback) — it is NOT recorded as an error.
      phase = 'verifying'
      if (await verifyPathCandidate(pathCandidate)) {
        return { bin: pathCandidate, source: 'PATH' }
      }
    }
    const cached = join(cacheDir, managedBinaryName(process.platform))
    if (await isFile(cached)) {
      phase = 'verifying'
      try {
        await verifyBinary(cached)
        return { bin: cached, source: 'managed-cache' }
      } catch {
        lastErrorCode = 'binary-rejected'
        await rm(cached, { force: true }) // damaged/untrusted: never execute, allow a fresh download
      }
    }
    phase = 'downloading'
    downloadProgress = undefined
    await downloadBinary(cacheDir, cached, (progress) => { downloadProgress = progress })
    return { bin: cached, source: 'downloaded' }
  }

  function spawnAndDiscover(bin: string): Promise<URL> {
    return new Promise((resolve, reject) => {
      const spawned = spawnFn(bin, ['tunnel', '--url', `http://127.0.0.1:${String(gatewayPort)}`, '--protocol', 'http2', '--no-autoupdate'])
      child = spawned
      let settled = false
      let readyTimer: ReturnType<typeof setTimeout> | undefined
      let buffer = ''
      let exitResolve: (() => void) | undefined
      const exited = new Promise<void>((r) => { exitResolve = r })

      /** Terminal failure: cleanup and reject start(). The origin never
       *  opened (onReady never fired), so onClosed is NOT called here — the
       *  old "never opened → nothing to close" contract. On an intentional
       *  stop (user cancelled during startup) the state mutation is skipped
       *  entirely: stop() owns the transition back to `idle`. */
      const fail = (error: TunnelStartError): void => {
        if (settled) return
        settled = true
        if (readyTimer !== undefined) clearTimeout(readyTimer)
        spawned.stdout?.off('data', onData)
        spawned.stderr?.off('data', onData)
        if (!intentionalStop) {
          phase = 'error'
          lastErrorCode = error.code
          publicUrl = undefined
          child = undefined
        }
        reject(error)
      }

      /** Success: the Edge confirmed the connector route — READY now. */
      const finish = (url: URL): void => {
        if (settled) return
        settled = true
        if (readyTimer !== undefined) clearTimeout(readyTimer)
        // E1-A: the data listener STAYS attached after READY so the runtime can
        // watch the live edge link for transient loss → regain (watchEdgeLog
        // runs from the same onData handler once phase === 'ready'). The
        // buffer stops growing because onData no longer appends in 'ready'.
        phase = 'ready'
        publicUrl = url
        edgeState = 'ok'
        edgeDegradedSinceMs = undefined
        options.onReady?.(url)
        resolve(url)
      }

      /**
       * Two-phase startup (R06C4D):
       *   1. hostname discovery — the URL banner. At this point the Edge may
       *      still be registering the connector, so phase becomes
       *      `connecting`, NOT `ready`, and no ticket may be minted.
       *   2. edge-readiness — cloudflared's own "Registered tunnel
       *      connection" line. Only then does phase become `ready`.
       */
      const onData = (chunk: string | Buffer): void => {
        if (intentionalStop || phase === 'stopping') return
        // E1-A: once READY the process output is the live edge-link watcher.
        // A loss is recorded as diagnostics only — never a fail-closed — while
        // a later regain ends the degraded window (cloudflared reconnects
        // in-process to the same URL).
        if (phase === 'ready') {
          watchEdgeLog(String(chunk))
          return
        }
        buffer += String(chunk)
        if (publicUrl === undefined) {
          const url = parseTunnelUrl(buffer)
          if (url !== undefined) {
            publicUrl = url
            phase = 'connecting'
            options.onDiagnostic?.(`tunnel:hostname-acquired url=${url.origin} elapsedMs=${now() - (startedAt ?? now())}`)
            clearTimeout(timer)
            readyTimer = setTimeout(() => {
              killChild()
              fail(new TunnelStartError('start-timeout',
                'cloudflared did not confirm edge readiness within the timeout'))
            }, readyTimeoutMs)
            if (typeof readyTimer.unref === 'function') readyTimer.unref()
          }
          return
        }
        if (hasTunnelReadySignal(buffer)) {
          options.onDiagnostic?.(`tunnel:ready-confirmed elapsedMs=${now() - (startedAt ?? now())}`)
          finish(publicUrl)
        }
      }
      spawned.stdout?.on('data', onData)
      spawned.stderr?.on('data', onData)

      const timer = setTimeout(() => {
        killChild()
        fail(new TunnelStartError('start-timeout', 'cloudflared did not publish a tunnel URL within the timeout'))
      }, startTimeoutMs)
      if (typeof timer.unref === 'function') timer.unref()

      spawned.once('error', (error) => {
        fail(new TunnelStartError('spawn-failed', `cloudflared spawn failed: ${error.message}`))
      })
      spawned.once('exit', (code, signal) => {
        exitResolve?.()
        if (settled) return // URL already discovered (or readiness confirmed); service-level crash handling owns it
        fail(new TunnelStartError('exit-before-ready',
          `cloudflared exited (code ${String(code ?? signal ?? 'unknown')}) before confirming readiness`))
      })
      spawned.once('close', () => { exitResolve?.() })

      exitWaiter = exited
      // Crash handling: an unexpected exit after READY must close the origin now.
      spawned.on('exit', (_code) => {
        if (intentionalStop) return
        if (phase === 'ready') {
          phase = 'error'
          lastErrorCode = 'connection-lost'
          publicUrl = undefined
          child = undefined
          options.onClosed?.()
        }
      })
    })
  }

  return {
    start(): Promise<URL> {
      if (startPromise !== undefined) return startPromise
      startPromise = (async () => {
        if (stopPromise !== undefined) await stopPromise // start during stopping: no orphan
        startedAt = now()
        lastErrorCode = undefined
        binarySource = undefined
        downloadProgress = undefined
        resetEdgeDiagnostics()
        phase = 'resolving'
        try {
          await configPreflight() // non-destructive; fails closed on a conflicting config
          const resolved = await resolveBinaryPath()
          binarySource = resolved.source
          phase = 'starting'
          // Resolves only after the Edge confirmed the connector route
          // (R06C4D): hostname-acquired is `connecting`, never `ready`.
          const url = await spawnAndDiscover(resolved.bin)
          return url
        } catch (error) {
          // R06C4D stop-before-ready: stop()'s continuation may already have
          // returned the tunnel to idle (its exitWaiter resolves BEFORE the
          // start() rejection propagates here). Never stomp a clean idle back
          // to error — the user cancelled, there is no failure to show.
          if (currentPhase() !== 'idle') {
            phase = 'error'
            lastErrorCode = error instanceof TunnelStartError
              ? error.code
              : error instanceof Error && error.message.startsWith('cloudflared')
                ? 'internal'
                : 'internal'
            publicUrl = undefined
          }
          throw error
        } finally {
          startPromise = undefined
        }
      })()
      return startPromise
    },

    async stop(): Promise<void> {
      if (stopPromise !== undefined) return stopPromise
      stopPromise = (async () => {
        intentionalStop = true
        if (child !== undefined && !child.killed) {
          phase = 'stopping'
          options.onClosed?.() // CLOSED before the process dies
          killChild()
          if (exitWaiter !== undefined) {
            const killer = setTimeout(() => {
              try { child?.kill('SIGKILL') } catch { /* ignore */ }
            }, 5_000)
            if (typeof killer.unref === 'function') killer.unref()
            await exitWaiter
            clearTimeout(killer)
          }
        }
        child = undefined
        publicUrl = undefined
        binarySource = undefined
        startedAt = undefined
        downloadProgress = undefined
        phase = 'idle'
        lastErrorCode = undefined
        resetEdgeDiagnostics()
        intentionalStop = false
      })().finally(() => { stopPromise = undefined })
      return stopPromise
    },

    status(): QuickTunnelStatus {
      return {
        phase,
        ...(publicUrl === undefined ? {} : { publicUrl: publicUrl.origin }),
        ...(lastErrorCode === undefined ? {} : { lastErrorCode }),
        ...(binarySource === undefined ? {} : { binarySource }),
        ...(startedAt === undefined ? {} : { startedAt }),
        ...(edgeState === undefined ? {} : { edgeState }),
        ...(edgeDegradedSinceMs === undefined ? {} : { edgeDegradedSinceMs }),
        ...(edgeEvents.length === 0 ? {} : { edgeEvents: [...edgeEvents] }),
        ...(phase === 'downloading' && downloadProgress !== undefined ? {
          downloadReceivedBytes: downloadProgress.receivedBytes,
          ...(downloadProgress.totalBytes === undefined ? {} : { downloadTotalBytes: downloadProgress.totalBytes }),
          ...(downloadProgress.percent === undefined ? {} : { downloadPercent: downloadProgress.percent }),
          downloadElapsedMs: downloadProgress.elapsedMs,
          ...(downloadProgress.speedBytesPerSecond === undefined ? {} : { downloadSpeedBytesPerSecond: downloadProgress.speedBytesPerSecond }),
          ...(downloadProgress.proxySource === undefined ? {} : { downloadProxySource: downloadProgress.proxySource }),
          ...(downloadProgress.proxyDisplay === undefined ? {} : { downloadProxyDisplay: downloadProgress.proxyDisplay }),
          ...(downloadProgress.downloadSource === undefined ? {} : { downloadSource: downloadProgress.downloadSource }),
          ...(downloadProgress.sourceChanging === undefined ? {} : { downloadSourceChanging: downloadProgress.sourceChanging }),
        } : {}),
      }
    },
  }
}

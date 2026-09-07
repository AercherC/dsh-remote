/**
 * UpdateService (R05): check + one-click apply for the plugin itself.
 *
 * Product rules (frozen):
 *   - automatic CHECK on plugin load, but only when the last check is older
 *     than the configured interval (default 24h) — never per-render polling;
 *   - the user can force a check any time;
 *   - an available update is always SURFACED (reminder ON); background
 *     silent auto-install is OFF by default — nothing replaces code without
 *     the user pressing 立即更新;
 *   - the apply step shells out to DSH's official command
 *     `dsh plugin --profile <profile> update <package>` and verifies the
 *     installed version afterwards; a failure never reports success;
 *   - version source of truth: the npm registry `latest` (the only thing
 *     actually installable via DSH). GitHub Releases provide the human-
 *     readable notes for the matching `v<version>` tag; notes being
 *     unavailable never blocks a security fix from being offered. When npm is
 *     REACHABLE it always wins; when npm is unreachable (e.g. the China-region
 *     npm block) GitHub Releases act as a read-only fallback so the user is at
 *     least TOLD a new stable release exists, even though applying is still
 *     npm-backed;
 *   - restart: NOT auto-performed (see {@link restartBehaviorNote}) — the UI
 *     reports 更新已安装，需要重启 DSH 后生效.
 *
 * State persisted to disk is exactly `{ lastCheckedAt, lastSeenVersion }`.
 * No tokens, no URLs, no paths.
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { GatewayLogger } from '../vendor/dsh-remote-web-gateway/dist/logger.js'
import { compareVersions, isStableNewer, parseStrictSemver } from './semver.js'

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'applying'
  | 'installed-restart-required'
  | 'failed'
  | 'unavailable'

/** Stable machine-readable update status; the client maps it to user copy. */
export interface UpdateStatusView {
  readonly currentVersion: string
  readonly phase: UpdatePhase
  readonly latestVersion?: string
  /** Plain-text release notes (safe-rendered; never raw HTML). */
  readonly notes?: string
  readonly notesUnavailable?: boolean
  readonly lastCheckedAt?: number
  readonly lastSeenVersion?: string
  /** Stable error code: network | registry | cli-not-found | apply-failed | version-mismatch | in-progress. */
  readonly error?: string
}

/** What is persisted between checks: nothing but the two timestamps/versions. */
export interface UpdateStateFile {
  lastCheckedAt?: number
  lastSeenVersion?: string
}

export interface UpdateServiceOptions {
  /** Installed plugin package root (reads package.json for the current version). */
  readonly pluginRootDir: string
  /** Absolute state file (update-state.json in the plugin state dir). */
  readonly stateFile: string
  /** npm package name whose `latest` is the update source of truth. */
  readonly registryPackage: string
  /** `owner/repo` whose `v<version>` release tag carries the notes. */
  readonly githubRepo: string
  /** `dsh plugin --profile <profile> update ...` — validated by config. */
  readonly cliProfile: string
  /** Minimum time between automatic checks. */
  readonly minCheckIntervalMs: number
  readonly logger: GatewayLogger
  readonly now?: () => number
  /** Injectable network (tests use fakes; default: global fetch). */
  readonly fetchFn?: (url: string, init?: RequestInit) => Promise<Response>
  /** Injectable CLI runner; default spawns the resolved `dsh` invocation. */
  readonly runCli?: (args: string[]) => Promise<{ exitCode: number; stdout: string }>
  /** Injectable current-version reader (default: the plugin's package.json). */
  readonly readVersion?: () => string
  /** Injectable CLI resolution (default: derive from this process's argv). */
  readonly resolveCli?: () => { command: string; args: string[] } | undefined
}

export interface UpdateService {
  /** Force/throttled check; never throws (failures are surfaced as a view). */
  check(force: boolean): Promise<UpdateStatusView>
  /** Apply the latest known version; never throws. */
  apply(): Promise<UpdateStatusView>
  status(): UpdateStatusView
}

export const NPM_LATEST_URL = (pkg: string): string => `https://registry.npmjs.org/${pkg}/latest`
export const GITHUB_RELEASE_URL = (repo: string, version: string): string =>
  `https://api.github.com/repos/${repo}/releases/tags/v${version}`
/** GitHub Releases list URL (up to 30 releases) — the read-only fallback source. */
export const GITHUB_RELEASES_URL = (repo: string): string =>
  `https://api.github.com/repos/${repo}/releases?per_page=30`

const APPLY_TIMEOUT_MS = 5 * 60_000
const MAX_NOTES_LENGTH = 4_000

/**
 * Sanitize remote release-note text into SAFE PLAIN TEXT for the UI:
 * strip HTML tags, control characters, and cap the length. The client
 * renders the result with React text interpolation only — never
 * dangerouslySetInnerHTML. Unit-tested.
 */
export function sanitizeReleaseNotes(raw: string): string {
  let text = raw
    .replace(/<[^>]*>/g, ' ') // strip any HTML-ish markup
    .replace(/[^\S\r\n]+/g, ' ') // collapse whitespace (keep line breaks)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
  if (text.length > MAX_NOTES_LENGTH) text = `${text.slice(0, MAX_NOTES_LENGTH)}…`
  return text
}

/** A read-only update signal derived from a GitHub release (not installable). */
export interface GithubReleaseView {
  readonly version: string
  /** Sanitized plain-text release notes (absent when the release has no body). */
  readonly notes?: string
  /** True when the release has no usable notes body. */
  readonly notesUnavailable: boolean
}

/**
 * Extract a strict semver from a GitHub release tag. Only `v<version>` tags are
 * accepted (the author's convention); anything else — a tag without the `v`
 * prefix, a non-semver tag, or a non-string — yields `undefined`.
 */
export function githubTagVersion(tag: unknown): string | undefined {
  if (typeof tag !== 'string') return undefined
  if (!tag.startsWith('v')) return undefined
  const version = tag.slice(1)
  if (parseStrictSemver(version) === undefined) return undefined
  return version
}

/**
 * Pick the highest stable release from a GitHub Releases API array. Drafts,
 * prereleases, and non-`v<semver>` tags are skipped; among the rest the maximum
 * version wins (via {@link compareVersions}). Notes are sanitized to plain
 * text; a release with no body sets `notesUnavailable`.
 */
export function pickLatestStableRelease(items: unknown): GithubReleaseView | undefined {
  if (!Array.isArray(items)) return undefined
  let best: GithubReleaseView | undefined
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const release = item as Record<string, unknown>
    if (release.draft === true || release.prerelease === true) continue
    const version = githubTagVersion(release.tag_name)
    if (version === undefined) continue
    if (best !== undefined && compareVersions(version, best.version) <= 0) continue
    const raw = typeof release.body === 'string' ? release.body : ''
    const notes = sanitizeReleaseNotes(raw)
    best = { version, notesUnavailable: notes === '', ...(notes === '' ? {} : { notes }) }
  }
  return best
}

/**
 * Why the updater does NOT auto-restart DSH (documented decision, R05):
 * the plugin runs INSIDE the `dsh web` process, so a restart means killing
 * its own parent and respawning it with reconstructed argv — original
 * args/profile/port cannot be recovered reliably (verified on the live
 * harness process: `node --import tsx/esm apps/cli/src/bin.ts web ...`),
 * and a botched respawn takes the user's DSH down. DSH exposes no restart
 * RPC (R04 investigation). Safe + reliable wins: the update is applied and
 * verified, then the UI tells the user to restart DSH.
 */
export const restartBehaviorNote =
  'Auto-restart is NOT implemented (R05): the plugin cannot safely kill/respawn its own host process; the UI reports the installed update and asks the user to restart DSH.'

/**
 * Derive how to invoke the `dsh` CLI from the CURRENT process: prefer the
 * DSH_CLI env override, otherwise reuse the same node interpreter + entry
 * script that started this process (argv[1]) so the profile/install that
 * runs us also runs the update. Returns undefined when nothing is derivable.
 */
export function resolveCliInvocation(
  env: NodeJS.ProcessEnv,
  argv: readonly string[],
  cwd: string,
  execArgv: readonly string[] = process.execArgv,
  execPath: string = process.execPath,
): { command: string; args: string[] } | undefined {
  const fromEnv = env.DSH_CLI
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return { command: fromEnv.trim(), args: [] }
  }
  const entry = argv[1]
  if (entry === undefined || entry === '') return undefined
  return { command: execPath, args: [...execArgv, resolve(cwd, entry)] }
}

function runCliProcess(command: string, args: string[]): Promise<{ exitCode: number; stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    child.stdout?.on('data', (chunk) => {
      const text = String(chunk)
      stdout = stdout.length > 64_000 ? stdout : stdout + text
    })
    child.stderr?.on('data', () => { /* captured implicitly via close code */ })
    const killer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* ignore */ }
    }, APPLY_TIMEOUT_MS)
    if (typeof killer.unref === 'function') killer.unref()
    child.once('error', (error) => {
      clearTimeout(killer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(killer)
      resolvePromise({ exitCode: code ?? -1, stdout })
    })
  })
}

export function createUpdateService(options: UpdateServiceOptions): UpdateService {
  const now = options.now ?? (() => Date.now())
  const fetchFn = options.fetchFn ?? ((url: string, init?: RequestInit) => fetch(url, init))
  const readVersion = options.readVersion ?? (() => readPluginVersion(options.pluginRootDir))
  const resolveCli = options.resolveCli ?? (() => resolveCliInvocation(process.env, process.argv, process.cwd()))
  const runCli = options.runCli ?? (async (args: string[]) => {
    const invocation = resolveCli()
    if (invocation === undefined) {
      return { exitCode: -2, stdout: '' } // sentinel: cli-not-found
    }
    try {
      return await runCliProcess(invocation.command, [...invocation.args, ...args])
    } catch {
      return { exitCode: -3, stdout: '' } // sentinel: spawn failure
    }
  })

  /** Read-only GitHub Releases fallback; `undefined` when unavailable. */
  async function githubLatest(repo: string): Promise<GithubReleaseView | undefined> {
    try {
      const response = await fetchFn(GITHUB_RELEASES_URL(repo), {
        headers: { accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) return undefined
      return pickLatestStableRelease(await response.json())
    } catch {
      return undefined
    }
  }

  let cached: UpdateStatusView | undefined

  async function readState(): Promise<UpdateStateFile> {
    try {
      const raw = await readFile(options.stateFile, 'utf8')
      const parsed = JSON.parse(raw) as Partial<UpdateStateFile>
      const state: UpdateStateFile = {}
      if (typeof parsed.lastCheckedAt === 'number' && Number.isFinite(parsed.lastCheckedAt)) {
        state.lastCheckedAt = parsed.lastCheckedAt
      }
      if (typeof parsed.lastSeenVersion === 'string' && parseStrictSemver(parsed.lastSeenVersion) !== undefined) {
        state.lastSeenVersion = parsed.lastSeenVersion
      }
      return state
    } catch {
      return {}
    }
  }

  async function writeState(state: UpdateStateFile): Promise<void> {
    try {
      await mkdir(dirname(options.stateFile), { recursive: true })
      const temporary = `${options.stateFile}.${String(process.pid)}.tmp`
      await writeFile(temporary, JSON.stringify(state), 'utf8')
      await rename(temporary, options.stateFile)
    } catch {
      // State persistence is best-effort; a failure must not break the check.
    } finally {
      await rm(`${options.stateFile}.${String(process.pid)}.tmp`, { force: true }).catch(() => {})
    }
  }

  function view(phase: UpdatePhase, extra: Partial<UpdateStatusView> = {}): UpdateStatusView {
    const next: UpdateStatusView = {
      currentVersion: readVersion(),
      phase,
      ...extra,
    }
    cached = next
    return next
  }

  return {
    status(): UpdateStatusView {
      return cached ?? { currentVersion: readVersion(), phase: 'idle' }
    },

    async check(force: boolean): Promise<UpdateStatusView> {
      const state = await readState()
      const current = readVersion()
      // Throttle: automatic checks only when the last one is stale; manual
      // (force) checks always hit the network.
      if (!force && state.lastCheckedAt !== undefined && now() - state.lastCheckedAt < options.minCheckIntervalMs) {
        const freshEnough = state.lastSeenVersion !== undefined && isStableNewer(current, state.lastSeenVersion)
        return view(freshEnough ? 'available' : 'up-to-date', {
          ...(state.lastSeenVersion === undefined ? {} : { latestVersion: state.lastSeenVersion }),
          ...(state.lastCheckedAt === undefined ? {} : { lastCheckedAt: state.lastCheckedAt }),
          ...(state.lastSeenVersion === undefined ? {} : { lastSeenVersion: state.lastSeenVersion }),
        })
      }

      // npm registry `latest` is the source of truth — it is what DSH can
      // actually install and apply. Determine it first; ONLY when npm is
      // unreachable do we fall back to GitHub Releases as a read-only signal
      // (the China-region case where npm is blocked but GitHub still resolves).
      let registryVersion: string | undefined
      let npmFailure: 'network' | 'registry' | undefined
      try {
        const response = await fetchFn(NPM_LATEST_URL(options.registryPackage), {
          headers: { accept: 'application/vnd.npm.install-v1+json' },
          signal: AbortSignal.timeout(30_000),
        })
        if (!response.ok) {
          options.logger.warn({ event: 'update_check_registry_http', status: response.status })
          npmFailure = 'registry'
        } else {
          const body = (await response.json()) as { version?: unknown }
          if (typeof body.version !== 'string' || parseStrictSemver(body.version) === undefined) {
            options.logger.warn({ event: 'update_check_registry_invalid' })
            npmFailure = 'registry'
          } else {
            registryVersion = body.version
          }
        }
      } catch {
        options.logger.warn({ event: 'update_check_network' })
        npmFailure = 'network'
      }

      if (registryVersion !== undefined) {
        await writeState({ lastCheckedAt: now(), lastSeenVersion: registryVersion })
        const base = {
          latestVersion: registryVersion,
          lastSeenVersion: registryVersion,
          lastCheckedAt: now(),
        }
        if (!isStableNewer(current, registryVersion)) {
          return view('up-to-date', base)
        }

        // Update available. Notes are best-effort: a missing/failed notes fetch
        // never blocks the update from being offered.
        let notes: string | undefined
        let notesUnavailable = false
        try {
          const notesResponse = await fetchFn(GITHUB_RELEASE_URL(options.githubRepo, registryVersion), {
            headers: { accept: 'application/vnd.github+json' },
            signal: AbortSignal.timeout(30_000),
          })
          if (notesResponse.ok) {
            const release = (await notesResponse.json()) as { body?: unknown }
            if (typeof release.body === 'string' && release.body.trim() !== '') {
              notes = sanitizeReleaseNotes(release.body)
            } else {
              notesUnavailable = true
            }
          } else {
            notesUnavailable = true
          }
        } catch {
          notesUnavailable = true
        }
        return view('available', {
          ...base,
          ...(notes === undefined ? {} : { notes }),
          ...(notesUnavailable ? { notesUnavailable: true } : {}),
        })
      }

      // npm unreachable → GitHub Releases read-only fallback. The author keeps
      // npm and GitHub releases in sync, so a GitHub-detected version that is
      // not yet on npm merely makes a later apply() fail with apply-failed (the
      // CLI install is npm-backed) — the user is only TOLD here, which is fine.
      const github = await githubLatest(options.githubRepo)
      if (github === undefined) {
        options.logger.warn({ event: 'update_check_both_sources_unavailable' })
        return view('unavailable', { error: npmFailure ?? 'network' })
      }
      await writeState({ lastCheckedAt: now(), lastSeenVersion: github.version })
      const ghBase = {
        latestVersion: github.version,
        lastSeenVersion: github.version,
        lastCheckedAt: now(),
      }
      if (!isStableNewer(current, github.version)) {
        return view('up-to-date', ghBase)
      }
      return view('available', {
        ...ghBase,
        ...(github.notes === undefined ? {} : { notes: github.notes }),
        ...(github.notesUnavailable ? { notesUnavailable: true } : {}),
      })
    },

    async apply(): Promise<UpdateStatusView> {
      const current = readVersion()
      const state = await readState()
      const target = state.lastSeenVersion
      if (target === undefined || !isStableNewer(current, target)) {
        // Nothing to install: either never checked or already at the latest.
        return view(current === target ? 'up-to-date' : 'unavailable', {
          ...(target === undefined ? {} : { latestVersion: target }),
        })
      }
      const result = await runCli(['plugin', '--profile', options.cliProfile, 'update', `${options.registryPackage}@${target}`])
      if (result.exitCode === -2) {
        return view('failed', { error: 'cli-not-found', latestVersion: target })
      }
      if (result.exitCode === -3) {
        options.logger.warn({ event: 'update_apply_spawn_failed' })
        return view('failed', { error: 'apply-failed', latestVersion: target })
      }
      if (result.exitCode !== 0) {
        options.logger.warn({ event: 'update_apply_exit' })
        return view('failed', { error: 'apply-failed', latestVersion: target })
      }
      // Verify the installed version before claiming success: success only
      // when the installed version is AT LEAST the target.
      const installed = readVersion()
      if (compareVersions(installed, target) < 0) {
        options.logger.warn({ event: 'update_apply_version_unverified' })
        return view('failed', { error: 'version-mismatch', latestVersion: target })
      }
      options.logger.info({ event: 'update_apply_succeeded' })
      return view('installed-restart-required', { latestVersion: target })
    },
  }
}

/** Read the plugin's own package.json version (default reader). */
export function readPluginVersion(pluginRootDir: string): string {
  try {
    const raw = readFileSync(resolve(pluginRootDir, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

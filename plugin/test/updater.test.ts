/**
 * UpdateService tests (R05): check cadence, version source of truth,
 * release notes, apply flow, version verification, restart-required state,
 * and the state-file contract (exactly lastCheckedAt + lastSeenVersion).
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createUpdateService, githubTagVersion, pickLatestStableRelease, readPluginVersion, sanitizeReleaseNotes, type UpdateService } from '../src/updater.js'

const silentLogger = { info: () => {}, warn: () => {} }

interface FakeHandlers {
  registry?: 'throw' | number | { version: string }
  /** Single-tag notes fetch (GITHUB_RELEASE_URL) — used when npm succeeds. */
  github?: number | { body: string }
  /** Releases-list fetch (GITHUB_RELEASES_URL) — used as the npm fallback. */
  githubList?: number | Array<Record<string, unknown>>
}

function fakeFetch(handlers: FakeHandlers): { fetch: (url: string, init?: RequestInit) => Promise<Response>; calls: string[] } {
  const calls: string[] = []
  const fetch = async (url: string, _init?: RequestInit): Promise<Response> => {
    calls.push(url)
    if (url.includes('registry.npmjs.org')) {
      if (handlers.registry === 'throw') throw new Error('network down')
      if (handlers.registry === undefined) return new Response('not found', { status: 404 })
      if (typeof handlers.registry === 'number') return new Response('err', { status: handlers.registry })
      return new Response(JSON.stringify(handlers.registry), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/releases/tags/')) {
      if (handlers.github === undefined) return new Response('not found', { status: 404 })
      if (typeof handlers.github === 'number') return new Response('err', { status: handlers.github })
      return new Response(JSON.stringify(handlers.github), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('api.github.com')) {
      if (handlers.githubList === undefined) return new Response('not found', { status: 404 })
      if (typeof handlers.githubList === 'number') return new Response('err', { status: handlers.githubList })
      return new Response(JSON.stringify(handlers.githubList), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response('nope', { status: 404 })
  }
  return { fetch, calls }
}

function tempRoot(version = '0.2.0-rc.1'): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-updater-test-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-remote-web-gateway', version }))
  return dir
}

interface MakeOptions {
  readonly currentVersion?: string
  readonly fetchHandlers?: FakeHandlers
  readonly runCli?: (args: string[]) => Promise<{ exitCode: number; stdout: string }>
  readonly minCheckIntervalMs?: number
}

function make(options: MakeOptions = {}): {
  service: UpdateService
  stateFile: string
  calls: string[]
  setCurrent: (version: string) => void
} {
  const root = tempRoot(options.currentVersion ?? '0.2.0-rc.1')
  const stateFile = join(root, 'state', 'update-state.json')
  let current = options.currentVersion ?? '0.2.0-rc.1'
  const { fetch, calls } = fakeFetch(options.fetchHandlers ?? {})
  const service = createUpdateService({
    pluginRootDir: root,
    stateFile,
    registryPackage: 'dsh-remote-web-gateway',
    githubRepo: 'AercherC/dsh-remote',
    cliProfile: 'web',
    minCheckIntervalMs: options.minCheckIntervalMs ?? 24 * 60 * 60_000,
    logger: silentLogger,
    fetchFn: fetch,
    readVersion: () => current,
    runCli: options.runCli ?? (async () => ({ exitCode: 0, stdout: '' })),
  })
  return { service, stateFile, calls, setCurrent: (version) => { current = version } }
}

function readState(stateFile: string): Record<string, unknown> {
  return JSON.parse(readFileSync(stateFile, 'utf8')) as Record<string, unknown>
}

describe('update check', () => {
  it('reports up-to-date and persists only the two allowed keys', async () => {
    const { service, stateFile, calls } = make({ fetchHandlers: { registry: { version: '0.2.0-rc.1' } } })
    const view = await service.check(false)
    expect(view.phase).toBe('up-to-date')
    expect(view.currentVersion).toBe('0.2.0-rc.1')
    const state = readState(stateFile)
    expect(Object.keys(state).sort()).toEqual(['lastCheckedAt', 'lastSeenVersion'])
    expect(state.lastSeenVersion).toBe('0.2.0-rc.1')
    expect(calls.length).toBe(1) // no GitHub call when there is no update
  })

  it('offers a newer stable version with sanitized notes', async () => {
    const { service } = make({
      fetchHandlers: {
        registry: { version: '0.2.0' },
        github: { body: '✨ 新功能\n- 一键更新\n🔐 安全\n- 修复注入' },
      },
    })
    const view = await service.check(true)
    expect(view.phase).toBe('available')
    expect(view.latestVersion).toBe('0.2.0')
    expect(view.notes).toContain('一键更新')
    expect(view.notesUnavailable).toBeUndefined()
  })

  it('ignores prerelease candidates on the stable channel', async () => {
    const { service, calls } = make({ fetchHandlers: { registry: { version: '0.2.0-rc.1' } } })
    const view = await service.check(true)
    expect(view.phase).toBe('up-to-date')
    expect(calls.length).toBe(1)
  })

  it('still offers the update when release notes cannot load', async () => {
    const { service } = make({ fetchHandlers: { registry: { version: '0.2.0' }, github: 404 } })
    const view = await service.check(true)
    expect(view.phase).toBe('available')
    expect(view.notesUnavailable).toBe(true)
    expect(view.notes).toBeUndefined()
  })

  it('surfaces network and registry failures without throwing', async () => {
    const offline = make({ fetchHandlers: { registry: 'throw' } })
    const network = await offline.service.check(true)
    expect(network.phase).toBe('unavailable')
    expect(network.error).toBe('network')

    const garbage = make({ fetchHandlers: { registry: { version: 'not-semver' } } })
    const invalid = await garbage.service.check(true)
    expect(invalid.phase).toBe('unavailable')
    expect(invalid.error).toBe('registry')
  })

  it('throttles automatic checks but lets manual checks bypass', async () => {
    const { service, calls } = make({ fetchHandlers: { registry: { version: '0.1.0' } } })
    await service.check(false)
    await service.check(false) // within 24h → no network
    expect(calls.length).toBe(1)
    await service.check(true) // manual → network
    expect(calls.length).toBe(2)
  })
})

describe('GitHub Releases fallback (npm unreachable)', () => {
  const gh = (tag: string, body?: string, flags: Partial<{ draft: boolean; prerelease: boolean }> = {}): Record<string, unknown> => ({
    tag_name: tag,
    draft: false,
    prerelease: false,
    ...(body === undefined ? {} : { body }),
    ...flags,
  })

  it('offers a newer stable release from GitHub when npm is down', async () => {
    const { service } = make({
      fetchHandlers: {
        registry: 'throw',
        githubList: [gh('v0.2.0-rc.2', '', { prerelease: true }), gh('release-0.1.9'), gh('v0.2.0', '✨ 一键更新\n- 修复注入')],
      },
    })
    const view = await service.check(true)
    expect(view.phase).toBe('available')
    expect(view.latestVersion).toBe('0.2.0')
    expect(view.notes).toContain('一键更新')
    expect(view.notesUnavailable).toBeUndefined()
  })

  it('reports up-to-date when the GitHub fallback is not newer', async () => {
    const { service } = make({
      currentVersion: '0.2.0',
      fetchHandlers: { registry: 'throw', githubList: [gh('v0.2.0')] },
    })
    const view = await service.check(true)
    expect(view.phase).toBe('up-to-date')
  })

  it('preserves the npm error code when both sources are down', async () => {
    const network = make({ fetchHandlers: { registry: 'throw' } })
    const networkView = await network.service.check(true)
    expect(networkView.phase).toBe('unavailable')
    expect(networkView.error).toBe('network')

    const registry = make({ fetchHandlers: { registry: 500 } })
    const registryView = await registry.service.check(true)
    expect(registryView.phase).toBe('unavailable')
    expect(registryView.error).toBe('registry')
  })
})

describe('pure GitHub release helpers', () => {
  it('accepts only v-prefixed strict-semver tags', () => {
    expect(githubTagVersion('v0.2.0')).toBe('0.2.0')
    expect(githubTagVersion('v1.2.3-rc.1')).toBe('1.2.3-rc.1')
    expect(githubTagVersion('0.2.0')).toBeUndefined()
    expect(githubTagVersion('vfoo')).toBeUndefined()
    expect(githubTagVersion(123)).toBeUndefined()
  })

  it('picks the max STABLE release from a list, skipping drafts/prereleases/non-v tags', () => {
    const picked = pickLatestStableRelease([
      ghRelease('v0.2.0-rc.2', { prerelease: true }),
      ghRelease('release-0.1.9'),
      ghRelease('v0.1.0'),
      ghRelease('v0.2.0', { body: '新版本' }),
    ])
    expect(picked?.version).toBe('0.2.0')
    expect(picked?.notes).toBe('新版本')
  })

  it('returns undefined for an empty or non-array list', () => {
    expect(pickLatestStableRelease([])).toBeUndefined()
    expect(pickLatestStableRelease('nope')).toBeUndefined()
    expect(pickLatestStableRelease({})).toBeUndefined()
  })

  it('flags a body-less release as notesUnavailable', () => {
    const picked = pickLatestStableRelease([ghRelease('v0.2.0', { body: '   ' })])
    expect(picked?.version).toBe('0.2.0')
    expect(picked?.notesUnavailable).toBe(true)
    expect(picked?.notes).toBeUndefined()
  })
})

const ghRelease = (
  tag: string,
  flags: Partial<{ body: string; draft: boolean; prerelease: boolean }> = {},
): Record<string, unknown> => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  body: '',
  ...flags,
})

describe('update apply', () => {
  it('applies via the CLI and reports restart-required only after version verify', async () => {
    const { service, setCurrent } = make({
      fetchHandlers: { registry: { version: '0.2.0' } },
      runCli: async (args) => {
        expect(args.join(' ')).toBe('plugin --profile web update dsh-remote-web-gateway@0.2.0')
        setCurrent('0.2.0') // the CLI really replaced the package
        return { exitCode: 0, stdout: 'done' }
      },
    })
    await service.check(true)
    const view = await service.apply()
    expect(view.phase).toBe('installed-restart-required')
    expect(view.latestVersion).toBe('0.2.0')
  })

  it('never reports success on a failing CLI run', async () => {
    const { service } = make({
      fetchHandlers: { registry: { version: '0.2.0' } },
      runCli: async () => ({ exitCode: 1, stdout: 'pnpm error' }),
    })
    await service.check(true)
    const view = await service.apply()
    expect(view.phase).toBe('failed')
    expect(view.error).toBe('apply-failed')
  })

  it('fails when the installed version did not actually change', async () => {
    const { service } = make({
      fetchHandlers: { registry: { version: '0.2.0' } },
      runCli: async () => ({ exitCode: 0, stdout: 'no-op' }), // version stays 0.2.0-rc.1
    })
    await service.check(true)
    const view = await service.apply()
    expect(view.phase).toBe('failed')
    expect(view.error).toBe('version-mismatch')
  })

  it('reports cli-not-found when the dsh CLI cannot be resolved', async () => {
    const { service } = make({
      fetchHandlers: { registry: { version: '0.2.0' } },
      runCli: async () => ({ exitCode: -2, stdout: '' }),
    })
    await service.check(true)
    const view = await service.apply()
    expect(view.phase).toBe('failed')
    expect(view.error).toBe('cli-not-found')
  })

  it('refuses to apply when nothing is newer (no phantom update)', async () => {
    const { service } = make({ fetchHandlers: { registry: { version: '0.1.0' } } })
    await service.check(true)
    const view = await service.apply()
    expect(['up-to-date', 'unavailable']).toContain(view.phase)
  })
})

describe('release note sanitization', () => {
  it('strips markup and control characters, keeps plain text', () => {
    const cleaned = sanitizeReleaseNotes('<script>alert(1)</script>\n✨ 新功能 <b>加粗</b>\n<a href="x">链接</a>')
    expect(cleaned).not.toContain('<')
    expect(cleaned).not.toContain('>')
    expect(cleaned).toContain('✨ 新功能')
    expect(cleaned).toContain('加粗')
    expect(cleaned).toContain('链接')
  })

  it('caps very long notes', () => {
    const long = 'x'.repeat(10_000)
    expect(sanitizeReleaseNotes(long).length).toBeLessThan(4_100)
  })

  it('collapses runaway blank lines', () => {
    expect(sanitizeReleaseNotes('a\n\n\n\n\nb')).toBe('a\n\nb')
  })
})

describe('readPluginVersion', () => {
  it('reads the installed package.json version', () => {
    expect(readPluginVersion(tempRoot('1.2.3'))).toBe('1.2.3')
    expect(readPluginVersion(mkdtempSync(join(tmpdir(), 'dsh-empty-root-')))).toBe('0.0.0')
  })
})

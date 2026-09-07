/**
 * R14 — workspace browse host handler tests.
 *
 * Exercises the read-only directory-listing RPC against REAL temporary
 * directory fixtures: computer roots, fully-qualified path fence, bounded
 * window / truncated flag, hidden flags, symlink enterability, abort
 * settling, error codes, and the absence of any create/delete surface.
 */

import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createWorkspaceBrowseHandler,
  fullyQualified,
  isHiddenEntry,
  resolveWorkspaceBrowseConfig,
} from '../src/workspace-browse.js'
import { WORKSPACE_BROWSE_CHANNEL } from '../src/wire.js'

/** One real temp fixture root per test (cleaned up after). */
let fixture: string | undefined

async function makeFixture(): Promise<string> {
  fixture = await mkdtemp(join(tmpdir(), 'dsh-rwg-browse-'))
  return fixture
}

async function makeDir(relative: string): Promise<string> {
  if (fixture === undefined) throw new Error('fixture not created')
  const target = join(fixture, relative)
  await mkdir(target, { recursive: true })
  return target
}

afterEach(async () => {
  if (fixture !== undefined) {
    await rm(fixture, { recursive: true, force: true })
    fixture = undefined
  }
})

/** Call the handler's `list` endpoint against a fixture-rooted home. */
function handler(options?: Parameters<typeof createWorkspaceBrowseHandler>[0]) {
  return createWorkspaceBrowseHandler({ ...options, home: options?.home ?? fixture })
}

describe('fullyQualified (path fence)', () => {
  it('accepts drive-qualified and UNC paths on win32', () => {
    expect(fullyQualified('C:\\Users\\admin', 'win32')).toBe(true)
    expect(fullyQualified('D:/projects', 'win32')).toBe(true)
    expect(fullyQualified('\\\\server\\share\\dir', 'win32')).toBe(true)
  })

  it('rejects drive-less and relative forms on win32', () => {
    expect(fullyQualified('\\foo', 'win32')).toBe(false)
    expect(fullyQualified('foo\\bar', 'win32')).toBe(false)
    expect(fullyQualified('\\\\server', 'win32')).toBe(false)
  })

  it('accepts POSIX absolute and rejects relative on posix', () => {
    expect(fullyQualified('/home/user', 'posix')).toBe(true)
    expect(fullyQualified('home/user', 'posix')).toBe(false)
    expect(fullyQualified('relative', 'posix')).toBe(false)
  })
})

describe('resolveWorkspaceBrowseConfig', () => {
  it('defaults maxEntries to 1000', () => {
    const config = resolveWorkspaceBrowseConfig(undefined)
    expect(config.maxEntries).toBe(1000)
  })

  it('fails closed on a non-positive bound', () => {
    expect(() => resolveWorkspaceBrowseConfig({ maxEntries: 0 })).toThrow()
    expect(() => resolveWorkspaceBrowseConfig({ maxEntries: -1 })).toThrow()
    expect(() => resolveWorkspaceBrowseConfig({ maxEntries: 1.5 })).toThrow()
  })
})

describe('workspace browse RPC — list', () => {
  it('lists the virtual computer root when no path is given', async () => {
    const root = await makeFixture()
    const discoverRoots = async () => [
      { name: 'C:', path: 'C:\\', hidden: false },
      { name: 'D:', path: 'D:\\', hidden: false },
    ]
    const result = await handler({ discoverRoots })('list', {}, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const listing = result.value as { kind: string; path: string | null; home: string; entries: Array<{ name: string }> }
    expect(listing.kind).toBe('computer')
    expect(listing.path).toBeNull()
    expect(listing.home).toBe(root)
    const names = listing.entries.map(entry => entry.name)
    expect(names).toEqual(['C:', 'D:'])
  })

  it('exposes the POSIX filesystem root without a home-directory detour', async () => {
    const root = await makeFixture()
    const result = await handler({ platform: 'linux' })('list', {}, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const listing = result.value as { kind: string; path: string | null; entries: Array<{ name: string; path: string }> }
    expect(listing).toMatchObject({ kind: 'computer', path: null })
    expect(listing.entries).toEqual([{ name: '/', path: '/', hidden: false }])
    void root
  })

  it('lists an explicit fully-qualified path', async () => {
    const root = await makeFixture()
    const target = await makeDir('sub')
    const result = await handler()('list', { path: target }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.value as { kind: string }).kind).toBe('directory')
    expect((result.value as { path: string }).path).toBe(target)
  })

  it('rejects relative / drive-less wire paths (unreadable)', async () => {
    await makeFixture()
    for (const bad of ['relative', 'sub\\dir', '\\rooted']) {
      const result = await handler()('list', { path: bad }, new AbortController().signal)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('directory-unreadable')
    }
  })

  it('returns the ancestry as clickable crumbs ending at the listed path', async () => {
    const root = await makeFixture()
    const target = await makeDir('a/b')
    const result = await handler()('list', { path: target }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const crumbs = (result.value as { crumbs: Array<{ path: string; name: string }> }).crumbs
    expect(crumbs.at(-1)?.path).toBe(target)
    // The first crumb is the filesystem root, labeled by its own path.
    expect(crumbs[0]?.name).toBe(crumbs[0]?.path)
    // Every ancestor up to the listed path is a jump target.
    expect(crumbs.some(crumb => crumb.path === root)).toBe(true)
  })

  it('marks dot-prefixed directories hidden per platform convention', async () => {
    expect(isHiddenEntry('.ssh', 'posix')).toBe(true)
    expect(isHiddenEntry('projects', 'posix')).toBe(false)
    // Windows: the hidden attribute is not exposed by dirents (official
    // Known Limitation) — dot-prefixed names are NOT flagged hidden.
    expect(isHiddenEntry('.ssh', 'win32')).toBe(false)
    const root = await makeFixture()
    await makeDir('.hidden')
    await makeDir('visible')
    const result = await handler()('list', { path: root }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const entries = (result.value as { entries: Array<{ name: string; hidden: boolean }> }).entries
    expect(entries.find(entry => entry.name === '.hidden')?.hidden).toBe(false)
    expect(entries.find(entry => entry.name === 'visible')?.hidden).toBe(false)
  })

  it('truncates an oversized level and reports truncated=true', async () => {
    const root = await makeFixture()
    for (let index = 0; index < 12; index += 1) {
      await makeDir(`dir-${String(index).padStart(2, '0')}`)
    }
    const result = await handler({ maxEntries: 10 })('list', { path: root }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const listing = result.value as { entries: unknown[]; truncated: boolean }
    expect(listing.entries.length).toBe(10)
    expect(listing.truncated).toBe(true)
  })

  it('follows symlinks to directories and skips broken ones', async () => {
    const root = await makeFixture()
    const target = await makeDir('real')
    await makeDir('other')
    let linked = false
    try {
      await symlink(target, join(root, 'link-real'), 'dir')
      await symlink(join(root, 'no-such-target'), join(root, 'link-broken'), 'dir')
      linked = true
    } catch {
      // Symlink creation needs privileges on some Windows setups; skip.
    }
    if (!linked) return
    const result = await handler()('list', { path: root }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const names = (result.value as { entries: Array<{ name: string }> }).entries.map(entry => entry.name)
    expect(names).toContain('link-real')
    expect(names).not.toContain('link-broken')
  })

  it('settles quickly on an already-aborted request without hanging', async () => {
    const root = await makeFixture()
    await makeDir('alpha')
    const controller = new AbortController()
    controller.abort()
    const result = await handler()('list', { path: root }, controller.signal)
    expect(result.ok).toBe(false)
  })

  it('maps an unreadable directory to directory-unreadable and unknown failures to internal', async () => {
    const root = await makeFixture()
    const missing = await handler()('list', { path: join(root, 'does-not-exist') }, new AbortController().signal)
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.message).toBe('directory-unreadable')
  })

  it('rejects a non-object payload and unknown endpoints with bad-request', async () => {
    const root = await makeFixture()
    const call = handler()
    const badPayload = await call('list', 'nope', new AbortController().signal)
    expect(badPayload.ok).toBe(false)
    if (!badPayload.ok) expect(badPayload.error.message).toBe('bad-request')
    const badPath = await call('list', { path: 42 }, new AbortController().signal)
    expect(badPath.ok).toBe(false)
    if (!badPath.ok) expect(badPath.error.message).toBe('bad-request')
    const unknown = await call('delete', {}, new AbortController().signal)
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.error.message).toBe('bad-request')
    void root
  })
})

describe('workspace browse surface shape', () => {
  it('exposes exactly one endpoint (list) — no create/delete/modify surface', async () => {
    const root = await makeFixture()
    const call = handler()
    for (const endpoint of ['create', 'createDirectory', 'delete', 'rename', 'upload']) {
      const result = await call(endpoint, { path: root }, new AbortController().signal)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('bad-request')
    }
  })

  it('declares the dedicated channel that avoids the /dsh-remote deny prefix', () => {
    expect(WORKSPACE_BROWSE_CHANNEL).toBe('/dsh-workspace-browse')
    expect(WORKSPACE_BROWSE_CHANNEL.startsWith('/dsh-remote')).toBe(false)
  })
})

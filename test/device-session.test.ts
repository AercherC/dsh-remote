import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDeviceSessionStore,
  deviceTokenFromCookie,
  DEVICE_TOKEN_BYTES,
  DeviceSessionError,
} from '../src/device-session.js'

const directories: string[] = []

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-device-session-test-'))
  directories.push(dir)
  return join(dir, 'state.json')
}

afterEach(() => {
  for (const dir of directories.splice(0)) {
    try { writeFileSync(join(dir, 'state.json'), '') } catch { /* ignore */ }
  }
})

let current = 1_700_000_000_000
const now = (): number => current

async function store(file: string, overrides: Record<string, unknown> = {}) {
  return await createDeviceSessionStore({ file, now, ...overrides })
}

describe('DeviceSessionStore', () => {
  it('mints a 256-bit token and persists only its SHA-256 hash', async () => {
    const file = tempFile()
    const sessions = await store(file)
    const created = await sessions.create('phone', 'Mozilla/5.0 test')

    expect(created.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(created.rawToken, 'base64url').byteLength).toBe(DEVICE_TOKEN_BYTES)

    const persisted = readFileSync(file, 'utf8')
    expect(persisted).not.toContain(created.rawToken)
    const expectedHash = createHash('sha256').update(created.rawToken, 'utf8').digest('hex')
    expect(persisted).toContain(expectedHash)
  })

  it('verifies a live session and rejects unknown or malformed tokens', async () => {
    const sessions = await store(tempFile())
    const created = await sessions.create('phone', 'ua')

    expect((await sessions.verify(created.rawToken))?.id).toBe(created.deviceId)
    expect(await sessions.verify('not-a-token')).toBeUndefined()
    expect(await sessions.verify('A'.repeat(43))).toBeUndefined()
  })

  it('extracts exactly one device token from a Cookie header', async () => {
    const token = 'A'.repeat(43)
    expect(deviceTokenFromCookie(`dsh_remote_device=${token}; other=1`)).toBe(token)
    expect(deviceTokenFromCookie(undefined)).toBeUndefined()
    expect(deviceTokenFromCookie('other=1')).toBeUndefined()
    // Duplicate same-name cookies are rejected as ambiguous.
    expect(deviceTokenFromCookie(`dsh_remote_device=${token}; dsh_remote_device=${token}`)).toBeUndefined()
  })

  it('expires sessions and persists the lazy cleanup', async () => {
    const file = tempFile()
    const sessions = await store(file, { ttlMs: 60_000 })
    const created = await sessions.create('phone')

    current += 61_000
    expect(await sessions.verify(created.rawToken)).toBeUndefined()
    // Cleanup is persisted: a fresh store over the same file sees no devices.
    const reloaded = await store(file, { ttlMs: 60_000 })
    expect(reloaded.list()).toHaveLength(0)
  })

  it('revokes a single device and revokeAll', async () => {
    const sessions = await store(tempFile())
    const first = await sessions.create('a')
    const second = await sessions.create('b')

    expect(await sessions.revoke(first.deviceId)).toBe(true)
    expect(await sessions.revoke(first.deviceId)).toBe(false)
    expect(await sessions.verify(first.rawToken)).toBeUndefined()
    expect((await sessions.verify(second.rawToken))?.id).toBe(second.deviceId)

    await sessions.revokeAll()
    expect(sessions.list()).toHaveLength(0)
    expect(await sessions.verify(second.rawToken)).toBeUndefined()
  })

  it('survives a restart through the persisted token hash', async () => {
    const file = tempFile()
    const first = await store(file)
    const created = await first.create('phone', 'ua')

    const reloaded = await store(file)
    expect((await reloaded.verify(created.rawToken))?.id).toBe(created.deviceId)
    expect(reloaded.list()[0]?.name).toBe('phone')
  })

  it('refuses new devices past the hard limit instead of evicting silently', async () => {
    const sessions = await store(tempFile(), { maxDevices: 2 })
    await sessions.create('a')
    await sessions.create('b')
    await expect(sessions.create('c')).rejects.toMatchObject({ code: 'device-limit' })
    expect(sessions.list()).toHaveLength(2)
  })

  it('rolls back the in-memory device when persisting the creation fails', async () => {
    // A regular file occupying the directory path forces mkdir to fail on both platforms.
    const dir = mkdtempSync(join(tmpdir(), 'dsh-device-session-rollback-'))
    directories.push(dir)
    writeFileSync(join(dir, 'blocker'), 'x', 'utf8')
    const sessions = await createDeviceSessionStore({ file: join(dir, 'blocker', 'state.json'), now })
    await expect(sessions.create('phone')).rejects.toThrow()
    expect(sessions.list()).toHaveLength(0)
  })

  it.each([
    ['not json', 'not json'],
    ['json array', '[1,2,3]'],
    ['wrong version', JSON.stringify({ version: 2, devices: [] })],
    ['missing devices', JSON.stringify({ version: 1 })],
    ['bad token hash', JSON.stringify({ version: 1, devices: [{ id: 'a'.repeat(32), tokenHash: 'zz', createdAt: 1, expiresAt: 2 }] })],
    ['bad device id', JSON.stringify({ version: 1, devices: [{ id: 'nope', tokenHash: 'a'.repeat(64), createdAt: 1, expiresAt: 2 }] })],
    ['bad date', JSON.stringify({ version: 1, devices: [{ id: 'a'.repeat(32), tokenHash: 'a'.repeat(64), createdAt: 'x', expiresAt: 2 }] })],
    ['duplicate device id', JSON.stringify({
      version: 1,
      devices: [
        { id: 'a'.repeat(32), tokenHash: 'a'.repeat(64), createdAt: 1, expiresAt: 2 },
        { id: 'a'.repeat(32), tokenHash: 'b'.repeat(64), createdAt: 1, expiresAt: 2 },
      ],
    })],
    ['duplicate token hash', JSON.stringify({
      version: 1,
      devices: [
        { id: 'a'.repeat(32), tokenHash: 'a'.repeat(64), createdAt: 1, expiresAt: 2 },
        { id: 'b'.repeat(32), tokenHash: 'a'.repeat(64), createdAt: 1, expiresAt: 2 },
      ],
    })],
  ])('fails closed on corrupt state (%s)', async (_label, contents) => {
    const file = tempFile()
    writeFileSync(file, contents, 'utf8')
    await expect(store(file)).rejects.toBeInstanceOf(DeviceSessionError)
  })

  it('writes the state file with mode 0600 on POSIX', async () => {
    if (process.platform === 'win32') return
    const file = tempFile()
    await store(file).then(sessions => sessions.create('phone'))
    const mode = statSync(file).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('revoke is durable: a failed persist rejects and a retry really revokes', async () => {
    const file = tempFile()
    let failNext = false
    const sessions = await createDeviceSessionStore({
      file,
      now,
      writeFileImpl: async (path, data) => {
        if (failNext) {
          failNext = false
          throw new Error('injected persist failure')
        }
        await writeFile(path, data, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      },
    })
    const created = await sessions.create('phone')

    failNext = true
    await expect(sessions.revoke(created.deviceId)).rejects.toThrow('injected persist failure')
    // Memory stayed coherent: the device is still valid.
    expect((await sessions.verify(created.rawToken))?.id).toBe(created.deviceId)
    // Disk stayed coherent: the token hash is still persisted.
    expect(readFileSync(file, 'utf8')).toContain(
      createHash('sha256').update(created.rawToken, 'utf8').digest('hex'),
    )

    // After storage recovers, the retry performs the real, durable revocation.
    expect(await sessions.revoke(created.deviceId)).toBe(true)
    expect(await sessions.verify(created.rawToken)).toBeUndefined()

    // A restart must not resurrect the revoked device.
    const reloaded = await store(file)
    expect(await reloaded.verify(created.rawToken)).toBeUndefined()
    expect(reloaded.list()).toHaveLength(0)
  })

  it('revokeAll is durable: a failed persist rejects and a retry clears everything', async () => {
    const file = tempFile()
    let failNext = false
    const sessions = await createDeviceSessionStore({
      file,
      now,
      writeFileImpl: async (path, data) => {
        if (failNext) {
          failNext = false
          throw new Error('injected persist failure')
        }
        await writeFile(path, data, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      },
    })
    const first = await sessions.create('a')
    const second = await sessions.create('b')

    failNext = true
    await expect(sessions.revokeAll()).rejects.toThrow('injected persist failure')
    expect(sessions.list()).toHaveLength(2)
    expect((await sessions.verify(first.rawToken))?.id).toBe(first.deviceId)

    await sessions.revokeAll()
    expect(sessions.list()).toHaveLength(0)

    const reloaded = await store(file)
    expect(reloaded.list()).toHaveLength(0)
    expect(await reloaded.verify(second.rawToken)).toBeUndefined()
  })

  it('serializes concurrent mutations so no stale snapshot overwrites newer state', async () => {
    const file = tempFile()
    const sessions = await store(file)

    // Concurrent creates: both must survive on disk.
    const [first, second] = await Promise.all([
      sessions.create('a'),
      sessions.create('b'),
    ])
    expect(sessions.list()).toHaveLength(2)
    expect((await sessions.verify(first.rawToken))?.id).toBe(first.deviceId)
    expect((await sessions.verify(second.rawToken))?.id).toBe(second.deviceId)

    // Concurrent create + revoke: the final persisted state matches the final
    // in-memory state exactly (one device remains).
    await Promise.all([
      sessions.revoke(first.deviceId),
      sessions.create('c'),
    ])
    expect(sessions.list()).toHaveLength(2)

    const reloaded = await store(file)
    expect(reloaded.list()).toHaveLength(2)
    expect(await reloaded.verify(first.rawToken)).toBeUndefined()
    expect((await reloaded.verify(second.rawToken))?.id).toBe(second.deviceId)
  })
})

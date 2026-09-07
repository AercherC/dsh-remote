import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PAIRING_CODE_ALPHABET, PAIRING_SECRET_BYTES } from '../src/pairing.js'
import {
  LONG_PAIRING_CODE_LENGTH,
  LONG_PAIRING_CODE_MAX,
  LONG_PAIRING_CODE_MIN,
  createLongPairingStore,
} from '../src/pairing-long.js'
import { capturedLogs, type CapturedLogs } from './helpers.js'

let current = 1_700_000_000_000
const now = (): number => current

const tempDirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pairing-long-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  current = 1_700_000_000_000
  await Promise.all(tempDirs.splice(0).map(async (dir) => { await rm(dir, { recursive: true, force: true }) }))
})

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

async function makeStore(logs: CapturedLogs = capturedLogs()) {
  const dir = await tempDir()
  const file = join(dir, 'pairing-long.json')
  const store = await createLongPairingStore({ file, logger: logs.logger, now })
  return { store, file, dir }
}

describe('LongPairingStore', () => {
  it('rotates a fresh 9-char code plus a 256-bit secret and reports metadata', async () => {
    const { store } = await makeStore()
    expect(store.state()).toBeUndefined()
    expect(store.reveal()).toBeUndefined()

    const credential = await store.rotate()
    expect(credential.code).toHaveLength(LONG_PAIRING_CODE_LENGTH)
    for (const char of credential.code) expect(PAIRING_CODE_ALPHABET).toContain(char)
    expect(Buffer.from(credential.secret, 'base64url').byteLength).toBe(PAIRING_SECRET_BYTES)
    expect(credential.secret).not.toBe(credential.code)
    expect(credential.createdAt).toBe(current)
    expect(store.state()).toEqual({ createdAt: current })
    expect(store.reveal()).toEqual(credential)
  })

  it('persists the PLAINTEXT (version 2) so the code can be re-read after a restart', async () => {
    const { store, file } = await makeStore()
    const credential = await store.rotate()

    const persisted: unknown = JSON.parse(await readFile(file, 'utf8'))
    expect(persisted).toMatchObject({
      version: 2,
      createdAt: current,
      code: credential.code,
      secret: credential.secret,
    })
  })

  it('accepts a custom code within the 6–12 bounds (letters A–Z + digits 0–9) and rejects malformed ones', async () => {
    const { store } = await makeStore()
    const custom = await store.rotate('Ab3Xy9') // mixed case → stored upper
    expect(custom.code).toBe('AB3XY9')
    expect(store.match('AB3XY9')).toBe(true)
    expect(store.reveal()).toEqual(custom)

    const { store: other } = await makeStore()
    await expect(other.rotate('AB1')).rejects.toThrow('invalid-long-code') // too short
    await expect(other.rotate('ABC-12')).rejects.toThrow('invalid-long-code') // hyphen not allowed
    await expect(other.rotate('AB CD')).rejects.toThrow('invalid-long-code') // space not allowed
    await expect(other.rotate('A'.repeat(LONG_PAIRING_CODE_MAX + 1))).rejects.toThrow('invalid-long-code')
    // All-digit codes (incl. 0/1) and I/L/O letters are fine — deliberately
    // permissive for memorable custom codes.
    const digits = await other.rotate('012345')
    expect(digits.code).toBe('012345')
    const bound = await other.rotate('A'.repeat(LONG_PAIRING_CODE_MIN))
    expect(bound.code).toHaveLength(LONG_PAIRING_CODE_MIN)
    const max = await other.rotate('A'.repeat(LONG_PAIRING_CODE_MAX))
    expect(max.code).toHaveLength(LONG_PAIRING_CODE_MAX)
  })

  it('matches the code and the secret, and rejects unknowns', async () => {
    const { store } = await makeStore()
    const credential = await store.rotate()
    expect(store.match(credential.code)).toBe(true)
    expect(store.match(credential.secret)).toBe(true)
    expect(store.match('ABCDEFGHI')).toBe(false)
    expect(store.match('')).toBe(false)
    // The /pair page upper-cases manual codes before claiming; secrets stay raw.
    expect(store.match(credential.code.toLowerCase())).toBe(false)
  })

  it('survives a restart with the plaintext intact and matching (version 2)', async () => {
    const { store, file } = await makeStore()
    const credential = await store.rotate()

    const restarted = await createLongPairingStore({ file, logger: capturedLogs().logger, now })
    expect(restarted.state()).toEqual({ createdAt: current })
    expect(restarted.reveal()).toEqual(credential) // D2.1: re-readable after restart
    expect(restarted.match(credential.code)).toBe(true)
    expect(restarted.match(credential.secret)).toBe(true)
  })

  it('rotate atomically replaces the credential so the old one stops matching (and its plaintext is gone)', async () => {
    const { store, file } = await makeStore()
    const first = await store.rotate()
    const second = await store.rotate()

    expect(second.code).not.toBe(first.code)
    expect(store.match(first.code)).toBe(false)
    expect(store.match(first.secret)).toBe(false)
    expect(store.match(second.code)).toBe(true)
    expect(store.reveal()).toEqual(second)
    const raw = await readFile(file, 'utf8')
    expect(raw).not.toContain(first.code)
    expect(raw).not.toContain(first.secret)
  })

  it('a failed persist leaves the previous credential live (durable-before-live)', async () => {
    const { store, file } = await makeStore()
    const first = await store.rotate()

    // Turn the state file path into a directory so the atomic rename fails.
    await rm(file, { force: true })
    await mkdir(file)

    await expect(store.rotate()).rejects.toThrow()
    expect(store.match(first.code)).toBe(true)
    expect(store.match(first.secret)).toBe(true)
  })

  it('treats a missing or corrupt state file as "no long code" (fail-safe), then recovers on rotate', async () => {
    const logs = capturedLogs()
    const { file } = await makeStore(logs)
    // Unparsable payload → unreadable event.
    await writeFile(file, 'not-json{{{', 'utf8')

    const corrupt = await createLongPairingStore({ file, logger: logs.logger, now })
    expect(corrupt.state()).toBeUndefined()
    expect(corrupt.match('whatever')).toBe(false)
    expect(logs.warn.some((fields) => fields.event === 'pairing_long_unreadable')).toBe(true)

    // Parseable but schema-invalid payload → corrupt event.
    await writeFile(file, JSON.stringify({ version: 2, createdAt: now() }), 'utf8')
    const badSchema = await createLongPairingStore({ file, logger: logs.logger, now })
    expect(badSchema.state()).toBeUndefined()
    expect(badSchema.match('whatever')).toBe(false)
    expect(logs.warn.some((fields) => fields.event === 'pairing_long_corrupt')).toBe(true)

    const credential = await corrupt.rotate()
    expect(corrupt.match(credential.code)).toBe(true)
  })

  it('reads a legacy version-1 digest file: claims still work, plaintext is not revealable, rotate upgrades to v2', async () => {
    const dir = await tempDir()
    const file = join(dir, 'pairing-long.json')
    const legacyCode = 'LEGACY123' // 9 chars, in-alphabet
    const legacySecret = 'legacy-secret-32-bytes-base64url-value-0000'
    await writeFile(file, JSON.stringify({
      version: 1,
      createdAt: current - 5_000,
      codeSha256: sha256Hex(legacyCode),
      secretSha256: sha256Hex(legacySecret),
    }), 'utf8')

    const legacy = await createLongPairingStore({ file, logger: capturedLogs().logger, now })
    expect(legacy.state()).toEqual({ createdAt: current - 5_000 })
    expect(legacy.reveal()).toBeUndefined() // digests only — cannot display
    expect(legacy.match(legacyCode)).toBe(true)
    expect(legacy.match(legacySecret)).toBe(true)
    expect(legacy.match('ABCDEFGHI')).toBe(false)

    // First rotate upgrades the file to version 2 with fresh plaintext.
    const fresh = await legacy.rotate()
    const raw = JSON.parse(await readFile(file, 'utf8')) as { version: number; code: string }
    expect(raw.version).toBe(2)
    expect(raw.code).toBe(fresh.code)
    expect(legacy.match(legacyCode)).toBe(false) // old code died with the rotate
    expect(legacy.reveal()).toEqual(fresh)
  })
})

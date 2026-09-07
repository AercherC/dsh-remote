import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Browser device sessions for the pairing gateway.
 *
 * Security model (R02 correction over naive token persistence):
 *   - The raw 256-bit device token lives ONLY in the browser cookie.
 *   - The server persists only `sha256(rawToken)` — a one-way digest. The
 *     state file therefore never contains a value that can authenticate by
 *     itself: an attacker who steals the state file cannot derive a usable
 *     cookie, and an attacker who steals a cookie cannot recover the hash
 *     from the file.
 *   - No password hashing: the token is already ≥256-bit CSPRNG entropy, so
 *     a plain SHA-256 digest is the right tool (no low-entropy stretching).
 *
 * Persistence is fail-closed: an unreadable, malformed, schema-invalid or
 * duplicate-laden state file aborts startup instead of silently starting
 * with an empty (or partially loaded) device set. Expired devices are a
 * valid state (removed lazily on verify), not a corruption.
 *
 * Mutations are transactional and serialized (R03):
 *   - Every mutating operation runs inside a single internal write queue
 *     (a Promise chain — no third-party mutex), so two concurrent mutations
 *     can never interleave their disk writes and let an older snapshot
 *     overwrite a newer one.
 *   - Each mutation follows derive-next-state → atomic persist → commit. A
 *     failed persist rejects the operation and leaves BOTH memory and disk
 *     on the previous state, so "revoke succeeded" means "revoke is durable":
 *     a crash or restart cannot resurrect a revoked device. Retrying after
 *     storage recovers performs the real revocation.
 *
 * The file path is an explicit absolute path (DEVICE_SESSION_FILE); the
 * gateway never defaults to a path inside the Git checkout. Writes are
 * atomic (same-pid tmp file + rename) with mode 0600 on POSIX. On Windows,
 * Node creates files inheriting the directory ACL, so the directory ACL must
 * be enforced by the deployer/plugin using the same two-principal pattern V1
 * applies to `.private` (current user + SYSTEM, inheritance disabled).
 */

export const DEVICE_SESSION_COOKIE = 'dsh_remote_device'
export const DEVICE_TOKEN_BYTES = 32
export const DEVICE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
export const DEFAULT_DEVICE_MAX = 20
export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60_000
const TOKEN_HASH_RE = /^[0-9a-f]{64}$/
const DEVICE_ID_RE = /^[0-9a-f]{32}$/

export interface DeviceSessionOptions {
  /** Absolute path to the state file. Required; never derived from the checkout. */
  readonly file: string
  readonly maxDevices?: number
  readonly ttlMs?: number
  readonly now?: () => number
  /**
   * Test-only injection for the state-file write. Lets tests force a persist
   * failure and verify transactional semantics without touching the disk.
   */
  readonly writeFileImpl?: (path: string, data: string) => Promise<void>
}

/** What is persisted on disk. Raw tokens never appear here. */
export interface PersistedDevice {
  readonly id: string
  readonly tokenHash: string
  readonly createdAt: number
  readonly expiresAt: number
  readonly name?: string
  readonly ua?: string
  readonly lastSeen?: number
}

/** Non-secret view for management/tests. */
export interface DeviceSummary {
  readonly id: string
  readonly createdAt: number
  readonly expiresAt: number
  readonly name?: string
  readonly ua?: string
  readonly lastSeen?: number
}

export interface CreatedDeviceSession {
  readonly deviceId: string
  /** The only place the raw token exists: the caller sets it in the cookie. */
  readonly rawToken: string
}

export interface DeviceSessionStore {
  create(name?: string, ua?: string): Promise<CreatedDeviceSession>
  /** Returns undefined for unknown, malformed, revoked, or expired tokens. */
  verify(rawToken: string): Promise<PersistedDevice | undefined>
  /** Resolves true only after the revocation is durably persisted. */
  revoke(deviceId: string): Promise<boolean>
  revokeAll(): Promise<void>
  list(): ReadonlyArray<DeviceSummary>
}

export class DeviceSessionError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'DeviceSessionError'
    this.code = code
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * Read the device token from a Cookie header. Duplicate same-name cookies
 * are rejected (mirrors the single-value rule V1 applies to security headers).
 */
export function deviceTokenFromCookie(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) return undefined
  let found: string | undefined
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    const equals = trimmed.indexOf('=')
    if (equals < 0) continue
    if (trimmed.slice(0, equals).trim() !== DEVICE_SESSION_COOKIE) continue
    if (found !== undefined) return undefined
    found = trimmed.slice(equals + 1)
  }
  return found
}

interface PersistedState {
  readonly version: 1
  readonly devices: PersistedDevice[]
}

function validateState(raw: string, file: string): Map<string, PersistedDevice> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new DeviceSessionError('corrupt', `device session state is not valid JSON: ${file}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new DeviceSessionError('corrupt', `device session state must be an object: ${file}`)
  }
  const record = parsed as Record<string, unknown>
  if (record.version !== 1 || !Array.isArray(record.devices)) {
    throw new DeviceSessionError('corrupt', `device session state has an unsupported schema: ${file}`)
  }
  const devices = new Map<string, PersistedDevice>()
  const ids = new Set<string>()
  for (const entry of record.devices as unknown[]) {
    if (typeof entry !== 'object' || entry === null) {
      throw new DeviceSessionError('corrupt', `device session state contains a non-object device: ${file}`)
    }
    const device = entry as Record<string, unknown>
    if (typeof device.id !== 'string' || !DEVICE_ID_RE.test(device.id)) {
      throw new DeviceSessionError('corrupt', `device session state contains an invalid device id: ${file}`)
    }
    if (typeof device.tokenHash !== 'string' || !TOKEN_HASH_RE.test(device.tokenHash)) {
      throw new DeviceSessionError('corrupt', `device session state contains an invalid token hash: ${file}`)
    }
    if (typeof device.createdAt !== 'number' || !Number.isFinite(device.createdAt)
      || typeof device.expiresAt !== 'number' || !Number.isFinite(device.expiresAt)) {
      throw new DeviceSessionError('corrupt', `device session state contains an invalid date: ${file}`)
    }
    if (ids.has(device.id) || devices.has(device.tokenHash)) {
      throw new DeviceSessionError('corrupt', `device session state contains a duplicate device: ${file}`)
    }
    ids.add(device.id)
    const name = typeof device.name === 'string' ? device.name : undefined
    const ua = typeof device.ua === 'string' ? device.ua : undefined
    const lastSeen = typeof device.lastSeen === 'number' && Number.isFinite(device.lastSeen)
      ? device.lastSeen
      : undefined
    const validated: PersistedDevice = {
      id: device.id,
      tokenHash: device.tokenHash,
      createdAt: device.createdAt,
      expiresAt: device.expiresAt,
      ...(name === undefined ? {} : { name }),
      ...(ua === undefined ? {} : { ua }),
      ...(lastSeen === undefined ? {} : { lastSeen }),
    }
    devices.set(validated.tokenHash, validated)
  }
  return devices
}

/** Serialize a device map exactly like the loader expects. */
function serializeState(devices: Map<string, PersistedDevice>): string {
  const state: PersistedState = { version: 1, devices: [...devices.values()] }
  return JSON.stringify(state)
}

export async function createDeviceSessionStore(options: DeviceSessionOptions): Promise<DeviceSessionStore> {
  const maxDevices = options.maxDevices ?? DEFAULT_DEVICE_MAX
  const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS
  const now = options.now ?? (() => Date.now())
  const writeFileImpl = options.writeFileImpl

  let devices: Map<string, PersistedDevice>
  try {
    devices = validateState(await readFile(options.file, 'utf8'), options.file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      devices = new Map()
    } else if (error instanceof DeviceSessionError) {
      throw error
    } else {
      throw new DeviceSessionError('unreadable', `device session state could not be read: ${options.file}`)
    }
  }

  /** device id -> token hash, rebuilt on every commit. */
  function buildIds(map: Map<string, PersistedDevice>): Map<string, string> {
    const ids = new Map<string, string>()
    for (const device of map.values()) ids.set(device.id, device.tokenHash)
    return ids
  }
  let ids = buildIds(devices)

  async function persist(map: Map<string, PersistedDevice>): Promise<void> {
    await mkdir(dirname(options.file), { recursive: true })
    const temporary = `${options.file}.${String(process.pid)}.${randomUUID()}.tmp`
    const payload = serializeState(map)
    if (writeFileImpl !== undefined) {
      await writeFileImpl(temporary, payload)
    } else {
      await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    }
    try { await rename(temporary, options.file) }
    finally { await rm(temporary, { force: true }) }
  }

  function commit(map: Map<string, PersistedDevice>): void {
    devices = map
    ids = buildIds(map)
  }

  // Serialized mutation queue: every mutating operation derives the next
  // state from the CURRENT committed state, persists it, and only then
  // commits to memory. Older snapshots can never overwrite newer ones.
  let queue: Promise<unknown> = Promise.resolve()
  async function mutate<T>(
    fn: (current: Map<string, PersistedDevice>) => { next: Map<string, PersistedDevice>; result: T },
  ): Promise<T> {
    const run = queue.then(async () => {
      const outcome = fn(devices)
      await persist(outcome.next)
      commit(outcome.next)
      return outcome.result
    })
    queue = run.then(() => undefined, () => undefined)
    return await run
  }

  return {
    async create(name?: string, ua?: string): Promise<CreatedDeviceSession> {
      return await mutate(current => {
        if (current.size >= maxDevices) {
          throw new DeviceSessionError('device-limit',
            `device session limit of ${String(maxDevices)} reached; revoke an existing device first`)
        }
        const rawToken = randomBytes(DEVICE_TOKEN_BYTES).toString('base64url')
        const tokenHash = sha256Hex(rawToken)
        const timestamp = now()
        const device: PersistedDevice = {
          id: randomBytes(16).toString('hex'),
          tokenHash,
          createdAt: timestamp,
          expiresAt: timestamp + ttlMs,
          ...(name === undefined || name === '' ? {} : { name: name.slice(0, 40) }),
          ...(ua === undefined ? {} : { ua: ua.slice(0, 160) }),
          lastSeen: timestamp,
        }
        const next = new Map(current)
        next.set(tokenHash, device)
        return { next, result: { deviceId: device.id, rawToken } }
      })
    },

    async verify(rawToken: string): Promise<PersistedDevice | undefined> {
      if (!DEVICE_TOKEN_RE.test(rawToken)) return undefined
      const tokenHash = sha256Hex(rawToken)
      const device = devices.get(tokenHash)
      if (device === undefined) return undefined
      const timestamp = now()
      if (device.expiresAt <= timestamp) {
        // Expiry cleanup is a mutation; a failed persist is harmless (the
        // expired device stays in memory and is cleaned on the next attempt),
        // so the failure is swallowed deliberately. We still await it so that
        // a returned "expired" verdict is backed by a persisted cleanup.
        const cleanup = mutate(_current => {
          const next = new Map(_current)
          next.delete(tokenHash)
          return { next, result: undefined }
        })
        await cleanup.catch(() => {})
        return undefined
      }
      devices.set(tokenHash, { ...device, lastSeen: timestamp })
      return device
    },

    async revoke(deviceId: string): Promise<boolean> {
      return await mutate(current => {
        const tokenHash = ids.get(deviceId)
        if (tokenHash === undefined) return { next: current, result: false }
        const next = new Map(current)
        next.delete(tokenHash)
        return { next, result: true }
      })
    },

    async revokeAll(): Promise<void> {
      await mutate(_current => ({ next: new Map(), result: undefined }))
    },

    list(): ReadonlyArray<DeviceSummary> {
      return [...devices.values()].map(device => ({
        id: device.id,
        createdAt: device.createdAt,
        expiresAt: device.expiresAt,
        ...(device.name === undefined ? {} : { name: device.name }),
        ...(device.ua === undefined ? {} : { ua: device.ua }),
        ...(device.lastSeen === undefined ? {} : { lastSeen: device.lastSeen }),
      }))
    },
  }
}

import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { issueAlphabetCode, issuePairingSecret } from './pairing.js'
import type { GatewayLogger } from './logger.js'

/**
 * Durable long-term pairing credential (D2, ToDesk-style).
 *
 * One long-term credential is the permanent counterpart of a one-time
 * pairing ticket: a single `code` (manual entry) plus a high-entropy
 * `secret` (the QR / deep-link half). Both redeem the SAME long-term
 * identity and both stay valid until the user rotates ("换一组" / sets a
 * custom code), which atomically replaces the stored credential so every old
 * code and old QR stops working at once.
 *
 * D2.1 (user decision, 2026-09-07): the code is a STANDING credential the
 * user must be able to RE-READ and re-scan after a restart (ToDesk-like), so
 * the state file (version 2) persists the PLAINTEXT `code`/`secret` under
 * the ACL-protected plugin state directory — the same trust domain as the
 * device-session file. Rotating overwrites the file atomically, so the old
 * plaintext dies with the old credential (no history is kept).
 *
 * Legacy version 1 files (SHA-256 digests only, from the first D2 build) are
 * still READ: claims keep authenticating against the digests, but the code
 * cannot be displayed (`reveal()` is empty → host reports `persisted`); the
 * first rotate/custom-code write upgrades the file to version 2.
 *
 * The default code is 9 random characters; a CUSTOM code (6–12 characters:
 * letters A–Z and digits 0–9, case-insensitive — deliberately permissive so a
 * memorable code like "888888" or "MyCode2026" just works) can be supplied by
 * the host, which validates the shape before calling rotate(). One-time ticket
 * codes are drawn from the narrower confusion-reduced alphabet and remain a
 * subset of the custom-code alphabet. Matching is constant-time over whatever
 * is stored (plaintext pair, or the legacy digest pair), and claims run under
 * the SAME global short-window budget as one-time tickets.
 *
 * Fail-safe: an unreadable / malformed state file means "no long code"
 * (deny); startup is NOT aborted and the user can simply generate a fresh
 * one. Writes are atomic (same-pid tmp + rename); the directory ACL is the
 * plugin's job.
 */

/** Default random code length (also what the UI suggests). */
export const LONG_PAIRING_CODE_LENGTH = 9
/** Custom code bounds (user-facing, enforced host-side on rotate). */
export const LONG_PAIRING_CODE_MIN = 6
export const LONG_PAIRING_CODE_MAX = 12
/** Manual/custom long-code alphabet: plain letters + digits (upper-cased first). */
export const PAIRING_CODE_FORMAT_SOURCE = 'A-Z0-9'

export const PAIRING_CODE_FORMAT_RE = new RegExp(
  `^[${PAIRING_CODE_FORMAT_SOURCE}]{${String(LONG_PAIRING_CODE_MIN)},${String(LONG_PAIRING_CODE_MAX)}}$`,
)

/** Non-secret metadata. */
export interface LongPairingState {
  readonly createdAt: number
}

/** Plaintext credential, available whenever a version-2 file (or a rotate) provides it. */
export interface LongPairingCredential {
  readonly secret: string
  readonly code: string
  readonly createdAt: number
}

export interface LongPairingStore {
  /** Non-secret metadata when a long code is set, undefined otherwise. */
  state(): LongPairingState | undefined
  /**
   * Constant-time verification of a raw credential (either the manual code or
   * the QR secret). Never consumes, never expires — until the user rotates.
   */
  match(credential: string): boolean
  /**
   * Rotate: replace the current credential atomically. With no argument a
   * fresh 9-char random code is issued; with `code` the caller-provided
   * custom code is used (the caller MUST have validated its shape first; the
   * store re-checks defensively). The secret is always a fresh 256-bit draw.
   * Durable: resolves only after the new state is persisted.
   */
  rotate(customCode?: string): Promise<LongPairingCredential>
  /**
   * The plaintext credential whenever it is available (version-2 file after
   * load, or just rotated). Undefined only for a legacy version-1 digest file
   * — such a code still authenticates but can no longer be displayed.
   */
  reveal(): LongPairingCredential | undefined
}

interface PersistedLongPairingV2 {
  readonly version: 2
  readonly createdAt: number
  readonly code: string
  readonly secret: string
}

/** Legacy first-D2 format: digests only. Still readable for claims. */
interface PersistedLongPairingV1 {
  readonly version: 1
  readonly createdAt: number
  readonly secretSha256: string
  readonly codeSha256: string
}

const HEX_64_RE = /^[0-9a-f]{64}$/

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

function isV2(value: unknown): value is PersistedLongPairingV2 {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.version === 2
    && typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    && typeof record.code === 'string' && record.code.length >= LONG_PAIRING_CODE_MIN
    && record.code.length <= LONG_PAIRING_CODE_MAX
    && PAIRING_CODE_FORMAT_RE.test(record.code)
    && typeof record.secret === 'string' && record.secret.length > 0 && record.secret.length <= 128
}

function isV1(value: unknown): value is PersistedLongPairingV1 {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.version === 1
    && typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    && typeof record.secretSha256 === 'string' && HEX_64_RE.test(record.secretSha256)
    && typeof record.codeSha256 === 'string' && HEX_64_RE.test(record.codeSha256)
}

/** True when `code` is a usable custom long code (length bounds + alphabet). */
export function isLongPairingCodeShape(code: string): boolean {
  return PAIRING_CODE_FORMAT_RE.test(code)
}

export async function createLongPairingStore(options: {
  readonly file: string
  readonly logger: GatewayLogger
  readonly now?: () => number
}): Promise<LongPairingStore> {
  const now = options.now ?? (() => Date.now())

  // version-2 plaintext state (may also be loaded from disk across restarts).
  let createdAt: number | undefined
  let code: string | undefined
  let secret: string | undefined
  // Legacy version-1 digests (claims only, never displayable).
  let codeSha256: string | undefined
  let secretSha256: string | undefined

  try {
    const raw = await readFile(options.file, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (isV2(parsed)) {
      createdAt = parsed.createdAt
      code = parsed.code
      secret = parsed.secret
    } else if (isV1(parsed)) {
      createdAt = parsed.createdAt
      codeSha256 = parsed.codeSha256
      secretSha256 = parsed.secretSha256
    } else {
      options.logger.warn({ event: 'pairing_long_corrupt', path: options.file })
    }
  } catch (error) {
    // ENOENT = never generated (the normal case). Anything else is also
    // fail-safe: no long code is active until the user rotates.
    const errno = (error as NodeJS.ErrnoException | null)?.code
    if (errno !== 'ENOENT') {
      options.logger.warn({ event: 'pairing_long_unreadable', path: options.file, ...(errno === undefined ? {} : { code: errno }) })
    }
  }

  function plaintextAvailable(): boolean {
    return createdAt !== undefined && code !== undefined && secret !== undefined
  }

  async function persistV2(next: PersistedLongPairingV2): Promise<void> {
    await mkdir(dirname(options.file), { recursive: true })
    const temporary = `${options.file}.tmp`
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    await rename(temporary, options.file)
  }

  return {
    state(): LongPairingState | undefined {
      return createdAt === undefined ? undefined : { createdAt }
    },

    match(credential: string): boolean {
      if (plaintextAvailable()) {
        const codeHit = safeEqualHex(sha256Hex(credential), sha256Hex(code!))
        const secretHit = safeEqualHex(sha256Hex(credential), sha256Hex(secret!))
        return codeHit || secretHit
      }
      if (codeSha256 === undefined || secretSha256 === undefined) return false
      const candidate = sha256Hex(credential)
      const codeHit = safeEqualHex(candidate, codeSha256)
      const secretHit = safeEqualHex(candidate, secretSha256)
      return codeHit || secretHit
    },

    async rotate(customCode?: string): Promise<LongPairingCredential> {
      const issuedAt = now()
      const finalCode = customCode === undefined
        ? issueAlphabetCode(LONG_PAIRING_CODE_LENGTH)
        : customCode.toUpperCase()
      // Defense in depth: the caller validates; refuse to persist a malformed
      // custom code (would brick manual claims for a file-only error).
      if (!isLongPairingCodeShape(finalCode)) throw new Error('invalid-long-code')
      const credential: LongPairingCredential = {
        secret: issuePairingSecret(),
        code: finalCode,
        createdAt: issuedAt,
      }
      const persisted: PersistedLongPairingV2 = {
        version: 2,
        createdAt: issuedAt,
        code: credential.code,
        secret: credential.secret,
      }
      // Durable BEFORE the new credential is live: a failed persist leaves the
      // old state untouched, so a code shown earlier keeps working.
      await persistV2(persisted)
      createdAt = issuedAt
      code = credential.code
      secret = credential.secret
      codeSha256 = undefined
      secretSha256 = undefined
      return credential
    },

    reveal(): LongPairingCredential | undefined {
      return plaintextAvailable()
        ? { secret: secret!, code: code!, createdAt: createdAt! }
        : undefined
    },
  }
}

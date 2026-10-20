import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { issueAlphabetCode, issuePairingSecret } from './pairing.js';
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
export const LONG_PAIRING_CODE_LENGTH = 9;
/** Custom code bounds (user-facing, enforced host-side on rotate). */
export const LONG_PAIRING_CODE_MIN = 6;
export const LONG_PAIRING_CODE_MAX = 12;
/** Manual/custom long-code alphabet: plain letters + digits (upper-cased first). */
export const PAIRING_CODE_FORMAT_SOURCE = 'A-Z0-9';
export const PAIRING_CODE_FORMAT_RE = new RegExp(`^[${PAIRING_CODE_FORMAT_SOURCE}]{${String(LONG_PAIRING_CODE_MIN)},${String(LONG_PAIRING_CODE_MAX)}}$`);
const HEX_64_RE = /^[0-9a-f]{64}$/;
function sha256Hex(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
function safeEqualHex(a, b) {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
}
function isV2(value) {
    if (value === null || typeof value !== 'object')
        return false;
    const record = value;
    return record.version === 2
        && typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        && typeof record.code === 'string' && record.code.length >= LONG_PAIRING_CODE_MIN
        && record.code.length <= LONG_PAIRING_CODE_MAX
        && PAIRING_CODE_FORMAT_RE.test(record.code)
        && typeof record.secret === 'string' && record.secret.length > 0 && record.secret.length <= 128;
}
function isV1(value) {
    if (value === null || typeof value !== 'object')
        return false;
    const record = value;
    return record.version === 1
        && typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        && typeof record.secretSha256 === 'string' && HEX_64_RE.test(record.secretSha256)
        && typeof record.codeSha256 === 'string' && HEX_64_RE.test(record.codeSha256);
}
/** True when `code` is a usable custom long code (length bounds + alphabet). */
export function isLongPairingCodeShape(code) {
    return PAIRING_CODE_FORMAT_RE.test(code);
}
export async function createLongPairingStore(options) {
    const now = options.now ?? (() => Date.now());
    // version-2 plaintext state (may also be loaded from disk across restarts).
    let createdAt;
    let code;
    let secret;
    // Legacy version-1 digests (claims only, never displayable).
    let codeSha256;
    let secretSha256;
    try {
        const raw = await readFile(options.file, 'utf8');
        const parsed = JSON.parse(raw);
        if (isV2(parsed)) {
            createdAt = parsed.createdAt;
            code = parsed.code;
            secret = parsed.secret;
        }
        else if (isV1(parsed)) {
            createdAt = parsed.createdAt;
            codeSha256 = parsed.codeSha256;
            secretSha256 = parsed.secretSha256;
        }
        else {
            options.logger.warn({ event: 'pairing_long_corrupt', path: options.file });
        }
    }
    catch (error) {
        // ENOENT = never generated (the normal case). Anything else is also
        // fail-safe: no long code is active until the user rotates.
        const errno = error?.code;
        if (errno !== 'ENOENT') {
            options.logger.warn({ event: 'pairing_long_unreadable', path: options.file, ...(errno === undefined ? {} : { code: errno }) });
        }
    }
    function plaintextAvailable() {
        return createdAt !== undefined && code !== undefined && secret !== undefined;
    }
    async function persistV2(next) {
        await mkdir(dirname(options.file), { recursive: true });
        const temporary = `${options.file}.tmp`;
        await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
        await rename(temporary, options.file);
    }
    return {
        state() {
            return createdAt === undefined ? undefined : { createdAt };
        },
        match(credential) {
            if (plaintextAvailable()) {
                const codeHit = safeEqualHex(sha256Hex(credential), sha256Hex(code));
                const secretHit = safeEqualHex(sha256Hex(credential), sha256Hex(secret));
                return codeHit || secretHit;
            }
            if (codeSha256 === undefined || secretSha256 === undefined)
                return false;
            const candidate = sha256Hex(credential);
            const codeHit = safeEqualHex(candidate, codeSha256);
            const secretHit = safeEqualHex(candidate, secretSha256);
            return codeHit || secretHit;
        },
        async rotate(customCode) {
            const issuedAt = now();
            const finalCode = customCode === undefined
                ? issueAlphabetCode(LONG_PAIRING_CODE_LENGTH)
                : customCode.toUpperCase();
            // Defense in depth: the caller validates; refuse to persist a malformed
            // custom code (would brick manual claims for a file-only error).
            if (!isLongPairingCodeShape(finalCode))
                throw new Error('invalid-long-code');
            const credential = {
                secret: issuePairingSecret(),
                code: finalCode,
                createdAt: issuedAt,
            };
            const persisted = {
                version: 2,
                createdAt: issuedAt,
                code: credential.code,
                secret: credential.secret,
            };
            // Durable BEFORE the new credential is live: a failed persist leaves the
            // old state untouched, so a code shown earlier keeps working.
            await persistV2(persisted);
            createdAt = issuedAt;
            code = credential.code;
            secret = credential.secret;
            codeSha256 = undefined;
            secretSha256 = undefined;
            return credential;
        },
        reveal() {
            return plaintextAvailable()
                ? { secret: secret, code: code, createdAt: createdAt }
                : undefined;
        },
    };
}
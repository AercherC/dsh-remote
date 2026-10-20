import { randomBytes, timingSafeEqual } from 'node:crypto';
/**
 * Short-lived one-time pairing tickets.
 *
 * One ticket carries two equivalent credentials derived from a single 256-bit
 * random draw:
 *   - a high-entropy `secret` (base64url, 32 random bytes) intended for QR /
 *     deep-link delivery; and
 *   - a short `code` (8 characters from a confusion-reduced alphabet) for
 *     manual entry.
 *
 * Both redeem the SAME ticket: claiming with either consumes the ticket, so
 * there is exactly one authentication system, not two.
 *
 * Claim is deliberately synchronous: Node's event loop makes a synchronous
 * match-and-delete atomic, so one ticket can never be consumed twice. The
 * loopback gateway runs one process, so this holds for the whole service.
 *
 * Brute-force protection:
 *   - The QR secret is 256-bit CSPRNG entropy: online guessing is impossible,
 *     so it needs no source-based lockout.
 *   - The manual code has entropy ≈ 8 * log2(31) ≈ 39.6 bits. Guessing it
 *     online is bounded by the GLOBAL short-window claim rate limit, which is
 *     deliberately shared by every source. Per-source locking was removed:
 *     behind a Quick Tunnel every public request arrives from the local
 *     cloudflared peer, so a per-source 5-failure lock would let five wrong
 *     guesses by anyone lock out the real user for 15 minutes. A single
 *     global budget avoids that while keeping the code impractical to brute
 *     force (31^8 combinations at ~60 attempts/minute).
 *   - Forwarded headers are never trusted for any security decision.
 */
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_SECRET_BYTES = 32;
// The alphabet has 31 characters (23 letters minus I/L/O plus 8 digits minus
// 0/1), so a raw byte mod 31 would be biased (256 = 8*31 + 8). Rejection
// sampling over the exact multiple 248 keeps the distribution uniform.
export const PAIRING_ALPHABET_LENGTH = 31;
export const PAIRING_REJECTION_LIMIT = 248;
const ALPHABET_LENGTH = PAIRING_ALPHABET_LENGTH;
const REJECTION_LIMIT = PAIRING_REJECTION_LIMIT;
export const DEFAULT_TICKET_TTL_MS = 5 * 60_000;
export const DEFAULT_MAX_TICKETS = 100;
export const DEFAULT_CLAIM_RATE_LIMIT = 60;
export const DEFAULT_CLAIM_RATE_WINDOW_MS = 60_000;
function safeEqual(a, b) {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
}
/** One unbiased index into the 31-character alphabet via rejection sampling. */
function uniformAlphabetIndex() {
    for (;;) {
        const byte = randomBytes(1)[0] ?? 0;
        if (byte < REJECTION_LIMIT)
            return byte % ALPHABET_LENGTH;
    }
}
function issueCode() {
    return issueAlphabetCode(PAIRING_CODE_LENGTH);
}
/** Unbiased random code of the given length over the pairing alphabet. */
export function issueAlphabetCode(length) {
    let code = '';
    while (code.length < length) {
        code += PAIRING_CODE_ALPHABET[uniformAlphabetIndex()];
    }
    return code;
}
/** High-entropy base64url secret (the QR / deep-link half of a credential pair). */
export function issuePairingSecret() {
    return randomBytes(PAIRING_SECRET_BYTES).toString('base64url');
}
export function createPairingService(options = {}) {
    const ttlMs = options.ttlMs ?? DEFAULT_TICKET_TTL_MS;
    const maxTickets = options.maxTickets ?? DEFAULT_MAX_TICKETS;
    const claimRateLimit = options.claimRateLimit ?? DEFAULT_CLAIM_RATE_LIMIT;
    const claimRateWindowMs = options.claimRateWindowMs ?? DEFAULT_CLAIM_RATE_WINDOW_MS;
    const now = options.now ?? (() => Date.now());
    const tickets = new Map();
    let claimCount = 0;
    let claimWindowStart = 0;
    // R06C4B lifecycle bookkeeping for the CURRENT ticket. Only non-sensitive
    // metadata survives consumption/expiry — the secret and code are deleted
    // from the map and are never retained here.
    let currentId;
    let consumedId;
    let consumedAt;
    let expiredId;
    let expiredAt;
    function dropOldestTicket() {
        const oldest = tickets.keys().next();
        if (!oldest.done && oldest.value !== undefined)
            tickets.delete(oldest.value);
    }
    /** Lazily drop expired tickets; record expiry metadata for the current one. */
    function sweepExpired(current) {
        for (const [id, ticket] of tickets) {
            if (ticket.expiresAt > current)
                continue;
            tickets.delete(id);
            if (id === currentId && consumedId === undefined) {
                expiredId = id;
                expiredAt = ticket.expiresAt;
            }
        }
    }
    /** Compare against every live ticket without early exit; lazily drop expired ones. */
    function match(credential, current) {
        const codeUpper = credential.toUpperCase();
        let found;
        for (const ticket of tickets.values()) {
            if (ticket.expiresAt <= current) {
                tickets.delete(ticket.id);
                if (ticket.id === currentId && consumedId === undefined) {
                    expiredId = ticket.id;
                    expiredAt = ticket.expiresAt;
                }
                continue;
            }
            if (safeEqual(credential, ticket.secret) || safeEqual(codeUpper, ticket.code)) {
                // Keep scanning so comparison time does not reveal the ticket position.
                found ??= ticket;
            }
        }
        return found;
    }
    return {
        issue() {
            const createdAt = now();
            const ticket = {
                id: randomBytes(16).toString('hex'),
                secret: issuePairingSecret(),
                code: issueCode(),
                createdAt,
                expiresAt: createdAt + ttlMs,
            };
            if (tickets.size >= maxTickets)
                dropOldestTicket();
            tickets.set(ticket.id, ticket);
            currentId = ticket.id;
            consumedId = undefined;
            consumedAt = undefined;
            expiredId = undefined;
            expiredAt = undefined;
            return ticket;
        },
        claim(credential) {
            const current = now();
            // Global short-window claim budget; it bounds every source at once.
            if (current - claimWindowStart >= claimRateWindowMs) {
                claimWindowStart = current;
                claimCount = 0;
            }
            claimCount += 1;
            if (claimCount > claimRateLimit)
                return { ok: false, reason: 'rate-limited' };
            const ticket = match(credential, current);
            if (ticket === undefined)
                return { ok: false, reason: 'rejected' };
            // One-time: delete before reporting success.
            tickets.delete(ticket.id);
            if (ticket.id === currentId) {
                consumedId = ticket.id;
                consumedAt = current;
                expiredId = undefined;
                expiredAt = undefined;
            }
            return { ok: true, ticket };
        },
        peek() {
            if (currentId === undefined)
                return { state: 'none' };
            const current = now();
            sweepExpired(current);
            const ticket = tickets.get(currentId);
            if (ticket !== undefined)
                return { state: 'active', ticket };
            if (consumedId !== undefined && consumedAt !== undefined) {
                return { state: 'consumed', id: consumedId, consumedAt };
            }
            if (expiredId !== undefined && expiredAt !== undefined) {
                return { state: 'expired', id: expiredId, expiresAt: expiredAt };
            }
            return { state: 'none' };
        },
        ticketCount() {
            sweepExpired(now());
            return tickets.size;
        },
        invalidateAll() {
            tickets.clear();
            currentId = undefined;
            consumedId = undefined;
            consumedAt = undefined;
            expiredId = undefined;
            expiredAt = undefined;
        },
    };
}
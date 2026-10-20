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
export declare const PAIRING_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export declare const PAIRING_CODE_LENGTH = 8;
export declare const PAIRING_SECRET_BYTES = 32;
export declare const PAIRING_ALPHABET_LENGTH = 31;
export declare const PAIRING_REJECTION_LIMIT = 248;
export declare const DEFAULT_TICKET_TTL_MS: number;
export declare const DEFAULT_MAX_TICKETS = 100;
export declare const DEFAULT_CLAIM_RATE_LIMIT = 60;
export declare const DEFAULT_CLAIM_RATE_WINDOW_MS = 60000;
export interface PairingTicket {
    /** Internal identifier only; never a credential. */
    readonly id: string;
    /** 32 random bytes, base64url. One-half of the single credential pair. */
    readonly secret: string;
    /** 8-character manual code. The other half of the same credential pair. */
    readonly code: string;
    readonly createdAt: number;
    readonly expiresAt: number;
}
/**
 * Host-authoritative lifecycle state of the CURRENT pairing ticket (R06C4B).
 *
 * `peek()` is a pure read: it never creates or invalidates anything, so a
 * status poll / settings remount / browser reload can never mint a ticket.
 * The four states mirror the product state machine:
 *
 *   - `none`     no ticket exists (tunnel off, or everything was invalidated)
 *   - `active`   a live ticket with its FULL credential pair (QR secret +
 *                manual code); only this state ever carries credentials
 *   - `consumed` the current ticket was successfully claimed by ONE device;
 *                the secret/code are deleted from memory, only the
 *                non-sensitive id + timestamp remain
 *   - `expired`  the current ticket reached its expiresAt; the secret/code
 *                are deleted, only the non-sensitive id + expiresAt remain
 *
 * Security invariants: consumed and expired states NEVER return the secret
 * or the manual code; a consumed ticket can never be revived (it was deleted
 * from the live map at claim time); `invalidateAll` (tunnel stop / restart /
 * URL change) always resets to `none`.
 */
export type PairingTicketState = {
    readonly state: 'none';
} | {
    readonly state: 'active';
    readonly ticket: PairingTicket;
} | {
    readonly state: 'consumed';
    readonly id: string;
    readonly consumedAt: number;
} | {
    readonly state: 'expired';
    readonly id: string;
    readonly expiresAt: number;
};
export interface PairingServiceOptions {
    readonly ttlMs?: number;
    readonly maxTickets?: number;
    readonly claimRateLimit?: number;
    readonly claimRateWindowMs?: number;
    readonly now?: () => number;
}
export type ClaimOutcome = {
    readonly ok: true;
    readonly ticket: PairingTicket;
} | {
    readonly ok: false;
    readonly reason: 'rejected' | 'rate-limited';
};
export interface PairingService {
    /** Issue a fresh one-time ticket (becomes the CURRENT ticket). */
    issue(): PairingTicket;
    /**
     * Atomically redeem a ticket by either its secret or its code.
     * Synchronous on purpose: there is no await between match and delete, so a
     * single ticket cannot be claimed twice even by concurrent requests.
     */
    claim(credential: string): ClaimOutcome;
    /**
     * Read the lifecycle state of the current ticket. NEVER creates, consumes
     * or invalidates anything — safe to call from any poll/read path.
     */
    peek(): PairingTicketState;
    /**
     * Invalidate every live ticket at once. Used when the public origin stops
     * or changes: a ticket minted for one origin must not remain claimable
     * against another, and unused tickets must not survive a tunnel teardown.
     */
    invalidateAll(): void;
    /** Number of live (non-expired) tickets; used by tests and diagnostics. */
    ticketCount(): number;
}
/** Unbiased random code of the given length over the pairing alphabet. */
export declare function issueAlphabetCode(length: number): string;
/** High-entropy base64url secret (the QR / deep-link half of a credential pair). */
export declare function issuePairingSecret(): string;
export declare function createPairingService(options?: PairingServiceOptions): PairingService;

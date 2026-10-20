import type { GatewayLogger } from './logger.js';
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
export declare const LONG_PAIRING_CODE_LENGTH = 9;
/** Custom code bounds (user-facing, enforced host-side on rotate). */
export declare const LONG_PAIRING_CODE_MIN = 6;
export declare const LONG_PAIRING_CODE_MAX = 12;
/** Manual/custom long-code alphabet: plain letters + digits (upper-cased first). */
export declare const PAIRING_CODE_FORMAT_SOURCE = "A-Z0-9";
export declare const PAIRING_CODE_FORMAT_RE: RegExp;
/** Non-secret metadata. */
export interface LongPairingState {
    readonly createdAt: number;
}
/** Plaintext credential, available whenever a version-2 file (or a rotate) provides it. */
export interface LongPairingCredential {
    readonly secret: string;
    readonly code: string;
    readonly createdAt: number;
}
export interface LongPairingStore {
    /** Non-secret metadata when a long code is set, undefined otherwise. */
    state(): LongPairingState | undefined;
    /**
     * Constant-time verification of a raw credential (either the manual code or
     * the QR secret). Never consumes, never expires — until the user rotates.
     */
    match(credential: string): boolean;
    /**
     * Rotate: replace the current credential atomically. With no argument a
     * fresh 9-char random code is issued; with `code` the caller-provided
     * custom code is used (the caller MUST have validated its shape first; the
     * store re-checks defensively). The secret is always a fresh 256-bit draw.
     * Durable: resolves only after the new state is persisted.
     */
    rotate(customCode?: string): Promise<LongPairingCredential>;
    /**
     * The plaintext credential whenever it is available (version-2 file after
     * load, or just rotated). Undefined only for a legacy version-1 digest file
     * — such a code still authenticates but can no longer be displayed.
     */
    reveal(): LongPairingCredential | undefined;
}
/** True when `code` is a usable custom long code (length bounds + alphabet). */
export declare function isLongPairingCodeShape(code: string): boolean;
export declare function createLongPairingStore(options: {
    readonly file: string;
    readonly logger: GatewayLogger;
    readonly now?: () => number;
}): Promise<LongPairingStore>;

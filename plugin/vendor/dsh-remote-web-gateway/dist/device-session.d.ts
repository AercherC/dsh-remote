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
export declare const DEVICE_SESSION_COOKIE = "dsh_remote_device";
export declare const DEVICE_TOKEN_BYTES = 32;
export declare const DEVICE_TOKEN_RE: RegExp;
export declare const DEFAULT_DEVICE_MAX = 20;
export declare const DEFAULT_SESSION_TTL_MS: number;
export interface DeviceSessionOptions {
    /** Absolute path to the state file. Required; never derived from the checkout. */
    readonly file: string;
    readonly maxDevices?: number;
    readonly ttlMs?: number;
    readonly now?: () => number;
    /**
     * Test-only injection for the state-file write. Lets tests force a persist
     * failure and verify transactional semantics without touching the disk.
     */
    readonly writeFileImpl?: (path: string, data: string) => Promise<void>;
}
/** What is persisted on disk. Raw tokens never appear here. */
export interface PersistedDevice {
    readonly id: string;
    readonly tokenHash: string;
    readonly createdAt: number;
    readonly expiresAt: number;
    readonly name?: string;
    readonly ua?: string;
    readonly lastSeen?: number;
}
/** Non-secret view for management/tests. */
export interface DeviceSummary {
    readonly id: string;
    readonly createdAt: number;
    readonly expiresAt: number;
    readonly name?: string;
    readonly ua?: string;
    readonly lastSeen?: number;
}
export interface CreatedDeviceSession {
    readonly deviceId: string;
    /** The only place the raw token exists: the caller sets it in the cookie. */
    readonly rawToken: string;
}
export interface DeviceSessionStore {
    create(name?: string, ua?: string): Promise<CreatedDeviceSession>;
    /** Returns undefined for unknown, malformed, revoked, or expired tokens. */
    verify(rawToken: string): Promise<PersistedDevice | undefined>;
    /** Resolves true only after the revocation is durably persisted. */
    revoke(deviceId: string): Promise<boolean>;
    revokeAll(): Promise<void>;
    list(): ReadonlyArray<DeviceSummary>;
}
export declare class DeviceSessionError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/**
 * Read the device token from a Cookie header. Duplicate same-name cookies
 * are rejected (mirrors the single-value rule V1 applies to security headers).
 */
export declare function deviceTokenFromCookie(cookieHeader: string | undefined): string | undefined;
export declare function createDeviceSessionStore(options: DeviceSessionOptions): Promise<DeviceSessionStore>;

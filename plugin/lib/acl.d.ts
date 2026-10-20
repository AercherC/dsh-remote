/**
 * Windows ACL hardening for the plugin's own data directory.
 *
 * Reuses the exact two-principal model V1 applies to `.private`: inheritance
 * disabled, only the current Windows user and SYSTEM get FullControl. Only
 * the plugin's own directory tree is touched — the harness home as a whole
 * is never modified.
 *
 * The check is fail-closed: a directory that cannot be hardened this way
 * aborts plugin startup rather than leaving the sensitive state directory
 * readable by other local accounts. Tests inject a no-op.
 */
export interface DirHardener {
    (dir: string): Promise<void>;
}
/**
 * Harden a directory on Windows: disable inheritance, grant only the current
 * user and SYSTEM FullControl (objects and containers). No-op on POSIX.
 */
export declare const hardenWindowsDirectory: DirHardener;

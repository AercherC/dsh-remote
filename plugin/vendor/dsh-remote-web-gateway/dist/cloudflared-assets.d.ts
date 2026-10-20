/**
 * Pinned cloudflared supply chain (R04).
 *
 * The managed binary is NOT fetched from `releases/latest/download/...`:
 * that endpoint is unreproducible and (as R03 proved on this machine) can
 * deliver a truncated or intercepted file that still claims HTTP 200. Every
 * managed asset is pinned three ways:
 *
 *   - exact release tag,
 *   - exact asset name for the host platform/architecture (fail closed for
 *     anything the official release does not publish), and
 *   - the official SHA-256 and byte size published in that release's notes.
 *
 * The values below were copied verbatim from the official Cloudflare
 * cloudflared GitHub release notes for the pinned tag (2026-08-14) and the
 * release asset metadata. Re-pinning a new version means replacing this whole
 * table from that release's notes and re-running the real smoke test.
 *
 * Only `win32-x64` is end-to-end verified in this round (the smoke test in
 * the R04 report). Every other mapping below points at a REAL official asset
 * with its REAL official hash; downloading and verifying those is generic.
 * A darwin `.tgz` is extracted (via `src/cloudflared-archive.ts`) into the
 * single `cloudflared` executable, then gated by `--version` (the pinned
 * size/SHA-256 belong to the container archive, not the extracted binary).
 * Nothing in the code or UI claims an unvalidated platform is supported:
 * `validated: true` is set ONLY for the platform that passed a real public
 * smoke test, and {@link isPlatformValidated} is the single source of truth
 * the status surface/report wording uses.
 */
export declare const CLOUDFLARED_PINNED_VERSION = "2026.8.2";
export interface CloudflaredAsset {
    /** Exact release-asset filename. */
    readonly assetName: string;
    /** Official SHA-256 from the release notes. */
    readonly sha256: string;
    /** Official release-asset size in bytes. */
    readonly sizeBytes: number;
    /** Asset packaging: a plain executable, or a tarball needing extraction. */
    readonly kind: 'exe' | 'bin' | 'tgz';
    /**
     * True ONLY for platforms that passed a REAL end-to-end public smoke test
     * (binary verified → tunnel started → pairing → DSH served). Everything
     * else is `false`: the resolver is prepared, the platform is NOT validated.
     */
    readonly validated: boolean;
}
/** Official asset table for the pinned version (release notes 2026-08-14). */
export declare const CLOUDFLARED_ASSETS: Readonly<Record<string, CloudflaredAsset>>;
/**
 * Whether a host platform/arch passed a REAL end-to-end public smoke test.
 *
 * `true` only for win32-x64 (R04). `false` means "resolver prepared / not
 * validated" — the mapping exists and downloads/verifies generically, but no
 * real-device or real-public proof exists yet, so no UI or report wording may
 * claim support.
 */
export declare function isPlatformValidated(platform: string, arch: string): boolean;
/**
 * Map a host platform/arch pair to a REAL official asset.
 *
 * Unknown combinations fail closed: this function throws rather than guessing
 * a filename, so no code path can ever download a made-up asset.
 *
 * @param platform - `process.platform` value.
 * @param arch - `process.arch` value.
 * @returns the pinned asset for this host.
 */
export declare function cloudflaredAssetFor(platform: string, arch: string): CloudflaredAsset;
/**
 * Whether a packaged asset can be run as a plain executable without extra
 * extraction steps. Only the plain `exe`/`bin` kinds are runnable; a `.tgz`
 * (darwin) is NOT directly runnable — it is extracted first (see
 * {@link isArchivedAsset}).
 */
export declare function isRunnableAsset(asset: CloudflaredAsset): boolean;
/**
 * Whether a packaged asset is a tarball that must be extracted into a plain
 * executable before it can run. Only the darwin `.tgz` assets are archived.
 */
export declare function isArchivedAsset(asset: CloudflaredAsset): boolean;
/** Managed cache filename for the host platform (no extension on POSIX). */
export declare function managedBinaryName(platform: string): string;
/** Official download URL for the pinned version's exact asset. */
export declare function pinnedDownloadUrl(asset: CloudflaredAsset): string;

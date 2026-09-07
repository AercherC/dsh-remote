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

export const CLOUDFLARED_PINNED_VERSION = '2026.8.2'

export interface CloudflaredAsset {
  /** Exact release-asset filename. */
  readonly assetName: string
  /** Official SHA-256 from the release notes. */
  readonly sha256: string
  /** Official release-asset size in bytes. */
  readonly sizeBytes: number
  /** Asset packaging: a plain executable, or a tarball needing extraction. */
  readonly kind: 'exe' | 'bin' | 'tgz'
  /**
   * True ONLY for platforms that passed a REAL end-to-end public smoke test
   * (binary verified → tunnel started → pairing → DSH served). Everything
   * else is `false`: the resolver is prepared, the platform is NOT validated.
   */
  readonly validated: boolean
}

/** Official asset table for the pinned version (release notes 2026-08-14). */
export const CLOUDFLARED_ASSETS: Readonly<Record<string, CloudflaredAsset>> = {
  'win32-x64': {
    assetName: 'cloudflared-windows-amd64.exe',
    sha256: 'c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5',
    sizeBytes: 54_893_480,
    kind: 'exe',
    // REAL public smoke test (R04 report): binary verified → tunnel started →
    // pairing → DSH served → management denied. The ONLY validated platform.
    validated: true,
  },
  'win32-ia32': {
    assetName: 'cloudflared-windows-386.exe',
    sha256: '6acb072357618fa16c53c43e05438ed728aacd47119f1c6c3aa1a668c3299b43',
    sizeBytes: 37_369_480,
    kind: 'exe',
    validated: false,
  },
  'darwin-x64': {
    assetName: 'cloudflared-darwin-amd64.tgz',
    sha256: 'b0f770e1e0b281399a57219b840fd8eef1cc25387a404124248157ea2073727a',
    sizeBytes: 21_116_242,
    kind: 'tgz',
    validated: false,
  },
  'darwin-arm64': {
    assetName: 'cloudflared-darwin-arm64.tgz',
    sha256: 'b61054d3d6326ea558cb49826eebf5676e0d0a36d51b546975096ca3e0e3c89d',
    sizeBytes: 19_214_189,
    kind: 'tgz',
    validated: false,
  },
  'linux-x64': {
    assetName: 'cloudflared-linux-amd64',
    sha256: 'fcfb02b575a52ca1af2e3267af4e1517bcdeb30ac48c834c69abaed3c0576ad2',
    sizeBytes: 39_799_316,
    kind: 'bin',
    validated: false,
  },
  'linux-ia32': {
    assetName: 'cloudflared-linux-386',
    sha256: '39845d980a4b74b9c84530a28d8fea1fe6c476de26460275602162b349f1cbef',
    sizeBytes: 37_102_345,
    kind: 'bin',
    validated: false,
  },
  'linux-arm': {
    assetName: 'cloudflared-linux-arm',
    sha256: '19809425f60a6261241dfa66a42b4115bab07c295396a3c4d5d7c247fc4e1412',
    sizeBytes: 36_288_720,
    kind: 'bin',
    validated: false,
  },
  'linux-arm64': {
    assetName: 'cloudflared-linux-arm64',
    sha256: '7747d94570fb390cf47dcb4f9555c193c6355cda9793f0d878d9049e5d6a7790',
    sizeBytes: 37_404_344,
    kind: 'bin',
    validated: false,
  },
}

/**
 * Whether a host platform/arch passed a REAL end-to-end public smoke test.
 *
 * `true` only for win32-x64 (R04). `false` means "resolver prepared / not
 * validated" — the mapping exists and downloads/verifies generically, but no
 * real-device or real-public proof exists yet, so no UI or report wording may
 * claim support.
 */
export function isPlatformValidated(platform: string, arch: string): boolean {
  const asset = CLOUDFLARED_ASSETS[`${platform}-${arch}`]
  return asset?.validated === true
}

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
export function cloudflaredAssetFor(platform: string, arch: string): CloudflaredAsset {
  const asset = CLOUDFLARED_ASSETS[`${platform}-${arch}`]
  if (asset === undefined) {
    throw new Error(
      `cloudflared does not publish a pinned ${platform}-${arch} asset; this platform is not supported yet`,
    )
  }
  return asset
}

/**
 * Whether a packaged asset can be run as a plain executable without extra
 * extraction steps. Only the plain `exe`/`bin` kinds are runnable; a `.tgz`
 * (darwin) is NOT directly runnable — it is extracted first (see
 * {@link isArchivedAsset}).
 */
export function isRunnableAsset(asset: CloudflaredAsset): boolean {
  return asset.kind === 'exe' || asset.kind === 'bin'
}

/**
 * Whether a packaged asset is a tarball that must be extracted into a plain
 * executable before it can run. Only the darwin `.tgz` assets are archived.
 */
export function isArchivedAsset(asset: CloudflaredAsset): boolean {
  return asset.kind === 'tgz'
}

/** Managed cache filename for the host platform (no extension on POSIX). */
export function managedBinaryName(platform: string): string {
  return platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
}

/** Official download URL for the pinned version's exact asset. */
export function pinnedDownloadUrl(asset: CloudflaredAsset): string {
  return `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_PINNED_VERSION}/${asset.assetName}`
}

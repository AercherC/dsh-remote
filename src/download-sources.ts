/**
 * R06C4 — cloudflared download SOURCES (orthogonal to the network path).
 *
 * The SOURCE answers "which server do we fetch from"; the NETWORK path
 * (proxy-resolver) answers "which route do we use to reach it". A mirror is
 * ONLY ever a transport: every source goes through the exact same trust chain
 * (pinned size + SHA-256 + --version + Authenticode + Cloudflare signer) and
 * a failed verification skips to the next source — a mirror can never become
 * a trust root.
 *
 * The mirror table below contains ONLY mirrors that passed this round's real
 * availability audit (R06C4 report §…): HTTPS reachable, the PINNED version
 * asset downloadable, byte size == pinned, SHA-256 == pinned, Authenticode
 * Valid, signer == Cloudflare. Anything not re-verified here is not listed.
 */

import { cloudflaredAssetFor, pinnedDownloadUrl, type CloudflaredAsset } from './cloudflared-assets.js'
import type { DownloadSourceMode } from './proxy-resolver.js'

export type { DownloadSourceMode } from './proxy-resolver.js'

/** Whether a source is the official Cloudflare GitHub release or a mirror. */
export type DownloadSourceKind = 'official' | 'mirror'

export interface DownloadSource {
  readonly id: string
  readonly kind: DownloadSourceKind
  /** Full URL for the host platform's pinned asset. */
  readonly url: string
}

/**
 * Mirrors verified by the R06C4 real audit (each entry = one audit PASS with
 * pinned SHA + Authenticode + signer evidence; see the R06C4 report §…). Both
 * audits were DIRECT (no proxy) downloads of the PINNED version:
 *
 *   - gh.ddlc.top    : 54,893,480 B in 23.9 s (~2.3 MB/s), SHA == pinned,
 *                      Authenticode Valid, signer Cloudflare, Inc.
 *   - gh-proxy.com   : 54,893,480 B in 185 s (~296 KB/s), SHA == pinned,
 *                      Authenticode Valid, signer Cloudflare, Inc.
 *
 * ghproxy.net was audited but its direct download dropped the connection
 * (undici `terminated` after ~1.2 MB) and it is NOT listed. Anything not
 * re-verified here is never added — an unverified mirror is not a product
 * feature. `baseUrl` is prepended to the official pinned-version URL (the
 * exact pattern the audited service served).
 */
export const VERIFIED_CLOUDFLARED_MIRRORS: readonly { readonly id: string; readonly baseUrl: string }[] = [
  { id: 'mirror-gh-ddlc-top', baseUrl: 'https://gh.ddlc.top/' },
  { id: 'mirror-gh-proxy-com', baseUrl: 'https://gh-proxy.com/' },
]

export function officialCloudflaredSource(asset: CloudflaredAsset): DownloadSource {
  return { id: 'official', kind: 'official', url: pinnedDownloadUrl(asset) }
}

export function mirrorCloudflaredSource(id: string, baseUrl: string, asset: CloudflaredAsset): DownloadSource {
  return { id, kind: 'mirror', url: `${baseUrl}${pinnedDownloadUrl(asset)}` }
}

/**
 * Resolve the source list for the configured mode:
 *   - auto     : official → verified mirrors (only verified ones; empty = official)
 *   - official : official only
 *   - mirror   : verified mirrors only (user explicitly opted into mirrors)
 */
export function resolveDownloadSources(mode: DownloadSourceMode): DownloadSource[] {
  const asset = cloudflaredAssetFor(process.platform, process.arch)
  if (mode === 'official') return [officialCloudflaredSource(asset)]
  const mirrors = VERIFIED_CLOUDFLARED_MIRRORS.map(mirror => mirrorCloudflaredSource(mirror.id, mirror.baseUrl, asset))
  if (mode === 'mirror') return mirrors
  return [officialCloudflaredSource(asset), ...mirrors]
}

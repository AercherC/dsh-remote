/**
 * R06C4 — download SOURCE resolution tests (official vs verified mirrors).
 */
import { describe, expect, it } from 'vitest'
import {
  mirrorCloudflaredSource,
  officialCloudflaredSource,
  resolveDownloadSources,
  VERIFIED_CLOUDFLARED_MIRRORS,
} from '../src/download-sources.js'
import { cloudflaredAssetFor } from '../src/cloudflared-assets.js'

const asset = cloudflaredAssetFor(process.platform, process.arch)

describe('download sources (R06C4)', () => {
  it('the official source is the pinned-version GitHub URL', () => {
    const source = officialCloudflaredSource(asset)
    expect(source.kind).toBe('official')
    expect(source.url).toContain('/releases/download/')
    expect(source.url).toContain(asset.assetName)
  })

  it('a mirror source is the official URL prefixed by the mirror base (transport only)', () => {
    const source = mirrorCloudflaredSource('mirror-x', 'https://mirror.example/', asset)
    expect(source.kind).toBe('mirror')
    expect(source.url).toBe(`https://mirror.example/${officialCloudflaredSource(asset).url}`)
  })

  it('auto mode lists the official source FIRST, then any verified mirrors', () => {
    const sources = resolveDownloadSources('auto')
    expect(sources[0]!.kind).toBe('official')
    expect(sources.slice(1).every(s => s.kind === 'mirror')).toBe(true)
    expect(sources.length).toBe(1 + VERIFIED_CLOUDFLARED_MIRRORS.length)
  })

  it('official mode is official only; mirror mode is mirrors only', () => {
    const official = resolveDownloadSources('official')
    expect(official).toHaveLength(1)
    expect(official[0]!.kind).toBe('official')
    const mirrors = resolveDownloadSources('mirror')
    expect(mirrors.every(s => s.kind === 'mirror')).toBe(true)
  })
})

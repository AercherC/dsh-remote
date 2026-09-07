/**
 * CloudflaredArchive — darwin .tgz extraction (v0.2.2).
 *
 * Only the RAW archive is trusted (size + SHA-256, verified by
 * defaultVerifyDownloadedAsset before extraction). This module must extract
 * exactly one regular file named `cloudflared` and refuse every untrusted
 * structure: traversal, absolute paths, symlinks, directories, pax/GNU
 * long-name headers, and archives with zero/multiple entries.
 *
 * The archives are built in-memory so each hostile case is explicit and
 * deterministic — never a fixture file that could silently drift.
 */

import { mkdtempSync, writeFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { cloudflaredAssetFor, isArchivedAsset } from '../src/cloudflared-assets.js'
import { extractCloudflaredBinary, ARCHIVED_BINARY_NAME } from '../src/cloudflared-archive.js'
import { defaultVerifyDownloadedAsset } from '../src/quick-tunnel.js'

interface TarSpec {
  name: string
  typeflag: string
  mode: string
  content: Buffer
}

/** Build a single-entry (or multi-entry) gzipped ustar archive. */
function buildTgz(entries: TarSpec[]): Buffer {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 'utf8')
    header.write(entry.mode.padStart(7, '0'), 100, 'ascii')
    header.write('00000000000\0', 108, 'ascii') // uid
    header.write('00000000000\0', 116, 'ascii') // gid
    const size = entry.content.length.toString(8).padStart(11, '0') + '\0'
    header.write(size, 124, 'ascii')
    header.write('00000000000\0', 136, 'ascii') // mtime
    header.write(entry.typeflag, 156, 'ascii')
    header.write('ustar\0', 257, 'ascii')
    header.write('00', 263, 'ascii') // ustar version
    if (entry.typeflag === '2') header.write('target', 157, 'ascii') // symlink target
    // Compute the checksum (u-star "6 octal + NUL + space").
    header.fill(32, 148, 156)
    let sum = 0
    for (let i = 0; i < 512; i += 1) sum += header[i]!
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii')
    blocks.push(header, entry.content)
    const pad = (512 - (entry.content.length % 512)) % 512
    if (pad > 0) blocks.push(Buffer.alloc(pad))
  }
  blocks.push(Buffer.alloc(512), Buffer.alloc(512)) // end-of-archive
  return gzipSync(Buffer.concat(blocks))
}

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-cloudflared-archive-'))
}

async function writeTgz(dir: string, entries: TarSpec[]): Promise<string> {
  const path = join(dir, 'cloudflared-darwin-arm64.tgz')
  await writeFileSync(path, buildTgz(entries))
  return path
}

function contentOf(bytes: number): Buffer {
  return Buffer.alloc(bytes, 0x61) // 0x61 = 'a'
}

describe('extractCloudflaredBinary', () => {
  it('extracts the lone cloudflared binary and sets the exec bit on POSIX', async () => {
    const dir = tmpDir()
    const payload = contentOf(4096)
    const tgz = await writeTgz(dir, [{ name: ARCHIVED_BINARY_NAME, typeflag: '0', mode: '0755', content: payload }])
    const dest = join(dir, 'cloudflared')
    await extractCloudflaredBinary(tgz, dest)
    const extracted = await statSync(dest)
    expect(extracted.size).toBe(payload.length)
    if (process.platform !== 'win32') {
      expect(extracted.mode & 0o111).toBe(0o111)
    }
  })

  it('refuses an archive whose only entry is a traversal path', async () => {
    const dir = tmpDir()
    const tgz = await writeTgz(dir, [{ name: '../evil', typeflag: '0', mode: '0755', content: contentOf(8) }])
    await expect(extractCloudflaredBinary(tgz, join(dir, 'cloudflared'))).rejects.toMatchObject({ code: 'binary-rejected' })
  })

  it('refuses an absolute path entry', async () => {
    const dir = tmpDir()
    const tgz = await writeTgz(dir, [{ name: '/etc/evil', typeflag: '0', mode: '0755', content: contentOf(8) }])
    await expect(extractCloudflaredBinary(tgz, join(dir, 'cloudflared'))).rejects.toMatchObject({ code: 'binary-rejected' })
  })

  it('refuses a symlink entry', async () => {
    const dir = tmpDir()
    const tgz = await writeTgz(dir, [{ name: ARCHIVED_BINARY_NAME, typeflag: '2', mode: '0777', content: contentOf(8) }])
    await expect(extractCloudflaredBinary(tgz, join(dir, 'cloudflared'))).rejects.toMatchObject({ code: 'binary-rejected' })
  })

  it('refuses a directory entry', async () => {
    const dir = tmpDir()
    const tgz = await writeTgz(dir, [{ name: 'cloudflared/', typeflag: '5', mode: '0755', content: Buffer.alloc(0) }])
    await expect(extractCloudflaredBinary(tgz, join(dir, 'cloudflared'))).rejects.toMatchObject({ code: 'binary-rejected' })
  })

  it('refuses an archive with multiple entries', async () => {
    const dir = tmpDir()
    const tgz = await writeTgz(dir, [
      { name: ARCHIVED_BINARY_NAME, typeflag: '0', mode: '0755', content: contentOf(4) },
      { name: 'extra', typeflag: '0', mode: '0755', content: contentOf(4) },
    ])
    await expect(extractCloudflaredBinary(tgz, join(dir, 'cloudflared'))).rejects.toMatchObject({ code: 'binary-rejected' })
  })

  it('refuses a wrong-named entry even when it is the only one', async () => {
    const dir = tmpDir()
    const tgz = await writeTgz(dir, [{ name: 'not-cloudflared', typeflag: '0', mode: '0755', content: contentOf(4) }])
    await expect(extractCloudflaredBinary(tgz, join(dir, 'cloudflared'))).rejects.toMatchObject({ code: 'binary-rejected' })
  })
})

describe('isArchivedAsset', () => {
  it('is true only for the darwin .tgz assets', () => {
    expect(isArchivedAsset(cloudflaredAssetFor('darwin', 'arm64'))).toBe(true)
    expect(isArchivedAsset(cloudflaredAssetFor('darwin', 'x64'))).toBe(true)
    expect(isArchivedAsset(cloudflaredAssetFor('win32', 'x64'))).toBe(false)
    expect(isArchivedAsset(cloudflaredAssetFor('linux', 'arm64'))).toBe(false)
  })
})

describe('defaultVerifyDownloadedAsset (raw-archive gate)', () => {
  it('passes a .tgz whose size + SHA-256 match a fabricated archive asset', async () => {
    const dir = tmpDir()
    const payload = contentOf(2048)
    const tgz = await writeTgz(dir, [{ name: ARCHIVED_BINARY_NAME, typeflag: '0', mode: '0755', content: payload }])
    const raw = await (await import('node:fs/promises')).readFile(tgz)
    const asset = {
      ...cloudflaredAssetFor('darwin', 'arm64'),
      sizeBytes: raw.length,
      sha256: createHash('sha256').update(raw).digest('hex'),
    }
    await expect(defaultVerifyDownloadedAsset(tgz, asset)).resolves.toBeUndefined()
  })

  it('rejects a .tgz with a size mismatch', async () => {
    const dir = tmpDir()
    const tgz = await writeTgz(dir, [{ name: ARCHIVED_BINARY_NAME, typeflag: '0', mode: '0755', content: contentOf(2048) }])
    const raw = await (await import('node:fs/promises')).readFile(tgz)
    const asset = {
      ...cloudflaredAssetFor('darwin', 'arm64'),
      sizeBytes: raw.length + 1,
      sha256: createHash('sha256').update(raw).digest('hex'),
    }
    await expect(defaultVerifyDownloadedAsset(tgz, asset)).rejects.toMatchObject({ code: 'size-mismatch' })
  })

  it('rejects a .tgz with a checksum mismatch', async () => {
    const dir = tmpDir()
    const tgz = await writeTgz(dir, [{ name: ARCHIVED_BINARY_NAME, typeflag: '0', mode: '0755', content: contentOf(2048) }])
    const raw = await (await import('node:fs/promises')).readFile(tgz)
    const asset = {
      ...cloudflaredAssetFor('darwin', 'arm64'),
      sizeBytes: raw.length,
      sha256: '0'.repeat(64),
    }
    await expect(defaultVerifyDownloadedAsset(tgz, asset)).rejects.toMatchObject({ code: 'checksum-mismatch' })
  })
})

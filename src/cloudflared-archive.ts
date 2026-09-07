/**
 * Deterministic extraction of the darwin cloudflared `.tgz` into the managed
 * binary.
 *
 * The pinned supply-chain trust anchor (exact release tag + SHA-256 + byte
 * size) belongs to the CONTAINER archive, not the extracted executable — the
 * extracted `cloudflared` is a different byte size and hash (it is the
 * uncompressed payload). Verification is therefore two-stage: the raw `.tgz`
 * is verified (size + SHA-256) BEFORE extraction; this module only extracts,
 * and the runnable `--version` gate is applied separately by the verifier in
 * quick-tunnel.ts.
 *
 * The archive is treated as fully untrusted even though it just passed a hash
 * check: only a single regular file named exactly `cloudflared` is accepted.
 * Traversal (`../`), absolute paths, symlinks, directory entries, pax/GNU
 * long-name headers and any archive with zero or multiple entries are
 * rejected with `binary-rejected`. The extracted payload is written with the
 * executable bit (0755) — the archive's own claimed mode is never trusted.
 */

import { createReadStream } from 'node:fs'
import { chmod, rename, writeFile } from 'node:fs/promises'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import { TunnelStartError } from './quick-tunnel.js'

/** The single executable a valid darwin cloudflared archive must contain. */
export const ARCHIVED_BINARY_NAME = 'cloudflared'

const USTAR_BLOCK = 512

/** Gunzip a `.tgz` file into a single in-memory tar buffer (compressed bytes
 *  are streamed away, so peak memory is the ~39 MB uncompressed tar). */
function gunzipToBuffer(tgzPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const collector = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
    })
    pipeline(createReadStream(tgzPath), createGunzip(), collector)
      .then(() => resolve(Buffer.concat(chunks)))
      .catch(reject)
  })
}

function readOctal(header: Buffer, offset: number, length: number): number {
  const text = header.toString('ascii', offset, offset + length).replace(/\0.*$/, '').trim()
  if (text === '') return 0
  const value = Number.parseInt(text, 8)
  if (Number.isNaN(value) || value < 0) {
    throw new TunnelStartError('binary-rejected',
      'cloudflared archive has a malformed numeric header field; rejecting')
  }
  return value
}

interface TarEntry {
  readonly name: string
  readonly typeflag: string
  readonly data: Buffer
}

/** Iterate ustar blocks, returning every entry. Does not bounds-trust a header. */
function parseTarEntries(tar: Buffer): TarEntry[] {
  const entries: TarEntry[] = []
  let offset = 0
  while (offset + USTAR_BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + USTAR_BLOCK)
    if (header.every(byte => byte === 0)) break // end-of-archive padding
    const size = readOctal(header, 124, 12)
    const dataStart = offset + USTAR_BLOCK
    const dataEnd = dataStart + size
    if (dataEnd > tar.length) {
      throw new TunnelStartError('binary-rejected',
        'cloudflared archive is truncated or claims an out-of-range file size; rejecting')
    }
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '').trim()
    entries.push({
      name,
      typeflag: String.fromCharCode(header[156] ?? 0),
      data: tar.subarray(dataStart, dataEnd),
    })
    offset = dataEnd + (((USTAR_BLOCK - (size % USTAR_BLOCK)) % USTAR_BLOCK))
  }
  return entries
}

function requireLoneCloudflared(tar: Buffer): { data: Buffer } {
  const entries = parseTarEntries(tar)
  if (entries.length !== 1) {
    throw new TunnelStartError('binary-rejected',
      `cloudflared archive must contain exactly one file (found ${String(entries.length)}); rejecting`)
  }
  const entry = entries[0]!
  // Only a plain regular file ("0" = POSIX, NUL = old tar). Symlinks,
  // directories, hardlinks, devices, FIFOs, pax ("x"/"g") and GNU long-name
  // ("L"/"K") headers are all rejected.
  if (entry.typeflag !== '0' && entry.typeflag !== String.fromCharCode(0)) {
    throw new TunnelStartError('binary-rejected',
      `cloudflared archive entry is not a regular file (type=${JSON.stringify(entry.typeflag)}); rejecting`)
  }
  // Exact-name match. Requiring the bare basename "cloudflared" forbids any
  // absolute or `../` traversal by construction (neither can equal this name).
  if (entry.name !== ARCHIVED_BINARY_NAME) {
    throw new TunnelStartError('binary-rejected',
      `cloudflared archive must contain a single "${ARCHIVED_BINARY_NAME}" file, got "${entry.name}"; rejecting`)
  }
  return { data: entry.data }
}

/**
 * Extract the single `cloudflared` executable from a verified `.tgz` into
 * `destPath`, atomically (temp + rename) and with the executable bit set.
 *
 * @throws {TunnelStartError} with `binary-rejected` on any untrusted structure.
 */
export async function extractCloudflaredBinary(tgzPath: string, destPath: string): Promise<void> {
  const tar = await gunzipToBuffer(tgzPath)
  const { data } = requireLoneCloudflared(tar)
  const temporary = `${destPath}.${String(process.pid)}.extract`
  await writeFile(temporary, data, { mode: 0o755 })
  await rename(temporary, destPath)
  // POSIX exec bit if writeFile did not apply it via umask; a no-op on Windows.
  await chmod(destPath, 0o755).catch(() => { /* best-effort */ })
}

/**
 * R06C4 — persisted download network/source settings (UI-owned state).
 *
 * The default user needs NO configuration: the store starts from the plugin
 * config defaults (downloadNetwork/downloadSource/customProxyUrl from
 * cordis.patch.yml) and the UI writes are persisted here so a setting change
 * applies to the NEXT download without a restart. The file holds only
 * non-secret values: custom proxy URLs with credentials are REJECTED at
 * input, so nothing credential-bearing is ever written to disk.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DownloadNetworkMode, DownloadSourceMode } from '../vendor/dsh-remote-web-gateway/dist/proxy-resolver.js'

export interface DownloadSettings {
  readonly network: DownloadNetworkMode
  readonly source: DownloadSourceMode
  /** Custom proxy URL (http/https, NO credentials). Optional. */
  readonly customProxyUrl?: string
}

export interface NetworkConfigStore {
  get(): Promise<DownloadSettings>
  set(settings: DownloadSettings): Promise<void>
}

export function createNetworkConfigStore(options: {
  readonly file: string
  readonly defaults: DownloadSettings
}): NetworkConfigStore {
  let cached: DownloadSettings | undefined

  async function read(): Promise<DownloadSettings> {
    if (cached !== undefined) return cached
    try {
      const raw = await readFile(options.file, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const value = parsed as Record<string, unknown>
        const network = value.network
        const source = value.source
        if ((network === 'auto' || network === 'direct' || network === 'custom')
          && (source === 'auto' || source === 'official' || source === 'mirror')) {
          const customProxyUrl = typeof value.customProxyUrl === 'string' && value.customProxyUrl.trim() !== ''
            ? value.customProxyUrl.trim()
            : undefined
          cached = {
            network,
            source,
            ...(customProxyUrl === undefined ? {} : { customProxyUrl }),
          }
          return cached
        }
      }
    } catch {
      // missing or corrupt file — fall through to defaults (never crash)
    }
    cached = options.defaults
    return cached
  }

  async function persist(settings: DownloadSettings): Promise<void> {
    await mkdir(dirname(options.file), { recursive: true })
    const temporary = `${options.file}.tmp`
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    await rename(temporary, options.file)
    cached = settings
  }

  return {
    async get() { return await read() },
    async set(settings) { await persist(settings) },
  }
}

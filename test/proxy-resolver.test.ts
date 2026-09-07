/**
 * R06C4 — download network routing tests (proxy-resolver).
 *
 * Covers the AUTO/DIRECT/CUSTOM candidate matrix, Windows system-proxy parsing
 * (simple, scheme list, disabled, malformed), environment proxies, credential
 * redaction, and candidate dedup. Everything here is pure — the registry
 * reader and env are injected, nothing touches the real registry or process
 * env.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  hasEnvProxySet,
  parseProxyServer,
  parseProxyUrl,
  readEnvProxy,
  readWinInetStaticProxy,
  resolveNetworkPaths,
  type SystemProxyRead,
} from '../src/proxy-resolver.js'

const envOf = (values: Record<string, string | undefined>): Record<string, string | undefined> => values

describe('parseProxyUrl', () => {
  it('accepts a plain http proxy URL', () => {
    const parsed = parseProxyUrl('http://127.0.0.1:7890')
    expect(parsed).toMatchObject({ url: 'http://127.0.0.1:7890', display: '127.0.0.1:7890', hasCredentials: false })
  })

  it('detects credentials but keeps them out of the display', () => {
    const parsed = parseProxyUrl('http://user:secret@proxy.example:3128')
    expect(parsed).not.toBeUndefined()
    expect(parsed!.hasCredentials).toBe(true)
    expect(parsed!.url).not.toContain('user')
    expect(parsed!.url).not.toContain('secret')
    expect(parsed!.display).toBe('proxy.example:3128')
  })

  it('rejects non-http(s), path-bearing, or unparseable URLs', () => {
    expect(parseProxyUrl('socks5://127.0.0.1:1080')).toBeUndefined()
    expect(parseProxyUrl('http://127.0.0.1:7890/path')).toBeUndefined()
    expect(parseProxyUrl('not a url')).toBeUndefined()
    expect(parseProxyUrl('http://')).toBeUndefined()
  })
})

describe('readEnvProxy', () => {
  it('prefers HTTPS_PROXY over HTTP_PROXY', () => {
    const candidate = readEnvProxy(envOf({ HTTPS_PROXY: 'http://h:1', HTTP_PROXY: 'http://h:2' }))
    expect(candidate).toMatchObject({ source: 'environment', url: 'http://h:1', display: 'h:1' })
  })

  it('returns undefined when nothing is set', () => {
    expect(readEnvProxy(envOf({}))).toBeUndefined()
    expect(hasEnvProxySet(envOf({}))).toBe(false)
  })
})

describe('parseProxyServer (WinINET ProxyServer values)', () => {
  it('parses the simple host:port form', () => {
    const parsed = parseProxyServer('127.0.0.1:7890')
    expect(parsed).toMatchObject({ url: 'http://127.0.0.1:7890', display: '127.0.0.1:7890' })
  })

  it('prefers the https entry in the scheme list form', () => {
    const parsed = parseProxyServer('http=10.0.0.1:8080;https=127.0.0.1:7890')
    expect(parsed).toMatchObject({ url: 'http://127.0.0.1:7890', display: '127.0.0.1:7890' })
  })

  it('falls back to the http entry when no https entry exists', () => {
    const parsed = parseProxyServer('http=10.0.0.1:8080')
    expect(parsed).toMatchObject({ url: 'http://10.0.0.1:8080' })
  })

  it('returns undefined for malformed values (never throws)', () => {
    expect(parseProxyServer('')).toBeUndefined()
    expect(parseProxyServer('user:pass@host:1')).toBeUndefined()
    expect(parseProxyServer('http://host:1/path')).toBeUndefined()
    expect(parseProxyServer('host')).toBeUndefined()
    expect(parseProxyServer('host:99999')).toBeUndefined()
    expect(parseProxyServer('garbage===;;;')).toBeUndefined()
  })
})

describe('readWinInetStaticProxy', () => {
  const query = (lines: string[]): (() => Promise<string>) => vi.fn(async () => lines.join('\n'))

  it('reads an enabled simple proxy (ProxyEnable=0x1)', async () => {
    const probe = query([
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '    ProxyEnable    REG_DWORD    0x1',
      '    ProxyServer    REG_SZ    127.0.0.1:7890',
    ])
    const result = await readWinInetStaticProxy(probe)
    expect(result).toMatchObject({ url: 'http://127.0.0.1:7890', display: '127.0.0.1:7890' })
  })

  it('ignores a disabled proxy (ProxyEnable=0x0)', async () => {
    const probe = query([
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '    ProxyEnable    REG_DWORD    0x0',
      '    ProxyServer    REG_SZ    127.0.0.1:7890',
    ])
    expect(await readWinInetStaticProxy(probe)).toBeUndefined()
  })

  it('reports unsupported for a malformed ProxyServer (fail-safe, never crashes)', async () => {
    const probe = query([
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '    ProxyEnable    REG_DWORD    0x1',
      '    ProxyServer    REG_SZ    nonsense',
    ])
    const result = await readWinInetStaticProxy(probe)
    expect(result).toMatchObject({ unsupported: true })
  })

  it('returns undefined when reg is unavailable (treats as no proxy)', async () => {
    const failing = vi.fn(async () => { throw new Error('reg not found') })
    expect(await readWinInetStaticProxy(failing)).toBeUndefined()
  })
})

describe('resolveNetworkPaths (AUTO/DIRECT/CUSTOM)', () => {
  const system = (value: SystemProxyRead): () => Promise<SystemProxyRead> => async () => value

  it('AUTO with only an env proxy → [environment, direct]', async () => {
    const resolution = await resolveNetworkPaths(
      { network: 'auto' },
      envOf({ HTTPS_PROXY: 'http://127.0.0.1:7890' }),
      system(undefined),
    )
    expect(resolution.candidates.map(c => c.source)).toEqual(['environment', 'direct'])
  })

  it('AUTO with no env but a WinINET static proxy → [system, direct]', async () => {
    const resolution = await resolveNetworkPaths(
      { network: 'auto' },
      envOf({}),
      system({ url: 'http://127.0.0.1:7890', display: '127.0.0.1:7890' }),
    )
    expect(resolution.candidates.map(c => c.source)).toEqual(['system', 'direct'])
  })

  it('AUTO with nothing → [direct]', async () => {
    const resolution = await resolveNetworkPaths({ network: 'auto' }, envOf({}), system(undefined))
    expect(resolution.candidates.map(c => c.source)).toEqual(['direct'])
  })

  it('AUTO applies the configured custom proxy FIRST', async () => {
    const resolution = await resolveNetworkPaths(
      { network: 'auto', customProxyUrl: 'http://custom:8888' },
      envOf({ HTTPS_PROXY: 'http://env:9999' }),
      system({ url: 'http://sys:7777', display: 'sys:7777' }),
    )
    expect(resolution.candidates.map(c => c.source)).toEqual(['custom', 'environment', 'system', 'direct'])
  })

  it('CUSTOM → only the custom proxy, no silent direct fallback', async () => {
    const resolution = await resolveNetworkPaths(
      { network: 'custom', customProxyUrl: 'http://127.0.0.1:7890' },
      envOf({ HTTPS_PROXY: 'http://env:1' }),
      system({ url: 'http://sys:2', display: 'sys:2' }),
    )
    expect(resolution.candidates).toHaveLength(1)
    expect(resolution.candidates[0]).toMatchObject({ source: 'custom', url: 'http://127.0.0.1:7890' })
  })

  it('CUSTOM with a credential URL is REJECTED (empty candidates + diagnostic)', async () => {
    const resolution = await resolveNetworkPaths(
      { network: 'custom', customProxyUrl: 'http://user:pass@127.0.0.1:7890' },
      envOf({}),
      system(undefined),
    )
    expect(resolution.candidates).toHaveLength(0)
    expect(resolution.diagnostics).toContain('custom-proxy-credentials')
  })

  it('CUSTOM without a URL → empty candidates (the caller maps it to proxy-invalid)', async () => {
    const resolution = await resolveNetworkPaths({ network: 'custom' }, envOf({}), system(undefined))
    expect(resolution.candidates).toHaveLength(0)
    expect(resolution.diagnostics).toContain('custom-proxy-missing')
  })

  it('DIRECT → [direct] and NEVER reads the system proxy or env', async () => {
    const readSystem = vi.fn(async () => { throw new Error('must not be called') })
    const resolution = await resolveNetworkPaths(
      { network: 'direct' },
      envOf({ HTTPS_PROXY: 'http://env:1' }),
      readSystem as () => Promise<SystemProxyRead>,
    )
    expect(resolution.candidates.map(c => c.source)).toEqual(['direct'])
    expect(readSystem).not.toHaveBeenCalled()
  })

  it('malformed ProxyServer → diagnostic system-proxy-unsupported, still ends with direct', async () => {
    const resolution = await resolveNetworkPaths({ network: 'auto' }, envOf({}), system({ unsupported: true }))
    expect(resolution.candidates.map(c => c.source)).toEqual(['direct'])
    expect(resolution.diagnostics).toContain('system-proxy-unsupported')
  })

  it('dedups identical proxy URLs across sources (custom == env == system)', async () => {
    const resolution = await resolveNetworkPaths(
      { network: 'auto', customProxyUrl: 'http://127.0.0.1:7890' },
      envOf({ HTTPS_PROXY: 'http://127.0.0.1:7890' }),
      system({ url: 'http://127.0.0.1:7890', display: '127.0.0.1:7890' }),
    )
    const urls = resolution.candidates.filter(c => c.url !== undefined).map(c => c.url)
    expect(urls).toEqual(['http://127.0.0.1:7890'])
    expect(resolution.candidates.map(c => c.source)).toEqual(['custom', 'direct'])
  })

  it('a malformed env proxy is recorded as a diagnostic and skipped', async () => {
    const resolution = await resolveNetworkPaths(
      { network: 'auto' },
      envOf({ HTTPS_PROXY: 'not a proxy' }),
      system(undefined),
    )
    expect(resolution.candidates.map(c => c.source)).toEqual(['direct'])
    expect(resolution.diagnostics).toContain('env-proxy-invalid')
  })
})

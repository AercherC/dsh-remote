/**
 * Config validation + home/directory derivation + the mobile CSS breakpoint
 * contract.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePluginConfig } from '../src/config.js'
import { pluginDirectories, resolveDshHome } from '../src/home.js'
import { MOBILE_CSS } from '../src/client/mobile/mobile.css.js'

describe('resolvePluginConfig', () => {
  it('applies safe defaults', () => {
    const config = resolvePluginConfig(undefined)
    expect(config.gatewayPort).toBe(0) // OS-assigned loopback port
    expect(config.healthPort).toBe(0)
    expect(config.deviceMax).toBe(20)
    expect(config.sessionTtlMs).toBe(30 * 24 * 60 * 60_000)
    expect(config.ticketTtlMs).toBe(5 * 60_000)
    expect(config.tunnelStartTimeoutMs).toBe(30_000)
  })

  it('accepts explicit values and rejects out-of-range ones', () => {
    expect(resolvePluginConfig({ deviceMax: 3 }).deviceMax).toBe(3)
    expect(resolvePluginConfig({ ticketTtlMs: 60_000 }).ticketTtlMs).toBe(60_000)
    expect(() => resolvePluginConfig({ deviceMax: 0 })).toThrow()
    expect(() => resolvePluginConfig({ ticketTtlMs: 10_000 })).toThrow()
    expect(() => resolvePluginConfig('nope')).toThrow()
    expect(() => resolvePluginConfig({ gatewayPort: -1 })).toThrow()
  })

  it('validates the update config (R05)', () => {
    expect(resolvePluginConfig(undefined).updateIntervalMs).toBe(24 * 60 * 60_000)
    expect(resolvePluginConfig(undefined).cliProfile).toBe('web')
    expect(resolvePluginConfig({ updateIntervalMs: 3_600_000 }).updateIntervalMs).toBe(3_600_000)
    expect(() => resolvePluginConfig({ updateIntervalMs: 1_000 })).toThrow()
    expect(() => resolvePluginConfig({ cliProfile: 'bad profile!' })).toThrow()
    expect(resolvePluginConfig({ cliProfile: 'work' }).cliProfile).toBe('work')
    // GitHub config fields are REMOVED (product decision 2026-09-07): unknown
    // keys are ignored instead of validated.
    expect(() => resolvePluginConfig({ githubClientId: 'Iv1.abc', githubAllowedUserIds: [1] })).not.toThrow()
  })

  it('R06C4: download network/source modes default to auto and validate strictly', () => {
    expect(resolvePluginConfig(undefined).downloadNetwork).toBe('auto')
    expect(resolvePluginConfig(undefined).downloadSource).toBe('auto')
    expect(resolvePluginConfig({ downloadNetwork: 'direct' }).downloadNetwork).toBe('direct')
    expect(resolvePluginConfig({ downloadNetwork: 'custom' }).downloadNetwork).toBe('custom')
    expect(resolvePluginConfig({ downloadSource: 'official' }).downloadSource).toBe('official')
    expect(resolvePluginConfig({ downloadSource: 'mirror' }).downloadSource).toBe('mirror')
    expect(() => resolvePluginConfig({ downloadNetwork: 'turbo' })).toThrow()
    expect(() => resolvePluginConfig({ downloadSource: 'auto!' })).toThrow()
  })

  it('R06C4: customProxyUrl accepts http(s) and REJECTS credentials and other schemes', () => {
    expect(resolvePluginConfig({ customProxyUrl: 'http://127.0.0.1:7890' }).customProxyUrl).toBe('http://127.0.0.1:7890')
    expect(resolvePluginConfig({ customProxyUrl: 'https://proxy.example:8443' }).customProxyUrl).toBe('https://proxy.example:8443')
    expect(resolvePluginConfig(undefined).customProxyUrl).toBeUndefined()
    expect(() => resolvePluginConfig({ customProxyUrl: 'http://user:pass@127.0.0.1:7890' })).toThrow()
    expect(() => resolvePluginConfig({ customProxyUrl: 'socks5://127.0.0.1:1080' })).toThrow()
    expect(() => resolvePluginConfig({ customProxyUrl: 'not a url' })).toThrow()
    expect(() => resolvePluginConfig({ customProxyUrl: '' })).toThrow()
  })
})

describe('home + directories', () => {
  it('resolves $DSH_HOME > ~/.dsh with tilde expansion', () => {
    expect(resolveDshHome({ DSH_HOME: '~/custom-dsh' })).toBe(join(homedir(), 'custom-dsh'))
    expect(resolveDshHome({ DSH_HOME: '   ' })).toBe(join(homedir(), '.dsh'))
    expect(resolveDshHome({})).toBe(join(homedir(), '.dsh'))
  })

  it('keeps state and binary cache apart under the plugin root', () => {
    const dirs = pluginDirectories('/dsh-home')
    expect(dirs.stateDir).toBe(join('/dsh-home', 'plugins', 'dsh-remote-web-gateway', 'state'))
    expect(dirs.cacheDir).toBe(join('/dsh-home', 'plugins', 'dsh-remote-web-gateway', 'bin', 'cache'))
    expect(dirs.deviceSessionFile).toBe(join('/dsh-home', 'plugins', 'dsh-remote-web-gateway', 'state', 'devices.json'))
  })
})

describe('mobile CSS breakpoint contract', () => {
  it('contains the phone, tablet, and desktop guards', () => {
    expect(MOBILE_CSS).toContain('@media (max-width: 1023px)')
    expect(MOBILE_CSS).toContain('@media (min-width: 768px) and (max-width: 1023px)')
    expect(MOBILE_CSS).toContain('@media (min-width: 1024px)')
  })

  it('the desktop guard only hides mobile controls (never restyles DSH)', () => {
    const desktopBlock = MOBILE_CSS.slice(MOBILE_CSS.indexOf('@media (min-width: 1024px)'))
    expect(desktopBlock).toMatch(/data-dsh-remote-mobile="fab"/)
    expect(desktopBlock).toMatch(/data-dsh-remote-mobile="backdrop"/)
    // No DSH layout selectors may appear in the desktop block.
    expect(desktopBlock).not.toMatch(/data-phase/)
    expect(desktopBlock).not.toMatch(/aria-modal/)
    expect(desktopBlock).not.toMatch(/data-side/)
  })

  it('every styling rule lives inside a media query (desktop untouched)', () => {
    const noComments = MOBILE_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    // Extract everything OUTSIDE @media { ... } blocks (balanced braces).
    let outside = ''
    let depth = 0
    let inMedia = false
    for (let i = 0; i < noComments.length; i += 1) {
      const ch = noComments[i]!
      if (!inMedia && noComments.startsWith('@media', i)) {
        inMedia = true
        continue
      }
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) inMedia = false
      } else if (!inMedia) {
        outside += ch
      }
    }
    // Outside every media query there may be only whitespace — no selectors.
    expect(outside.trim()).toBe('')
    expect(depth).toBe(0)
  })

  it('uses real DSH theme tokens only', () => {
    const used = new Set<string>()
    for (const match of MOBILE_CSS.matchAll(/var\((--[a-z0-9-]+)/g)) used.add(match[1]!)
    for (const token of used) {
      expect(token).toMatch(/^--(dsw-alias|ds-ease|dsw-specific)/)
    }
  })
})

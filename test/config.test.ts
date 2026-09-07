import { describe, expect, it } from 'vitest'
import { loadConfig, loadQuickTunnelConfig } from '../src/config.js'

const BASE = {
  GATEWAY_AUTH_MODE: 'cloudflare-access',
  DSH_UPSTREAM_URL: 'http://127.0.0.1:3080',
  PUBLIC_ORIGIN: 'https://dsh.example.com',
  CF_ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
  CF_ACCESS_AUDIENCE: 'audience',
  CF_ACCESS_ALLOWED_EMAILS: 'Owner@Example.com,second@example.com',
}

describe('loadConfig', () => {
  it('accepts the secure loopback topology and normalizes emails', () => {
    const config = loadConfig(BASE)
    expect(config.listenHost).toBe('127.0.0.1')
    expect(config.port).toBe(8787)
    expect(config.healthPort).toBe(8788)
    expect(config.auth.mode).toBe('cloudflare-access')
    if (config.auth.mode !== 'cloudflare-access') throw new Error('unexpected auth mode')
    expect([...config.auth.allowedEmails]).toEqual(['owner@example.com', 'second@example.com'])
  })

  it.each([
    ['DSH_UPSTREAM_URL', 'http://0.0.0.0:3080'],
    ['DSH_UPSTREAM_URL', 'http://192.168.1.2:3080'],
    ['DSH_UPSTREAM_URL', 'https://127.0.0.1:3080'],
    ['PUBLIC_ORIGIN', 'http://dsh.example.com'],
    ['PUBLIC_ORIGIN', 'https://dsh.example.com/path'],
    ['CF_ACCESS_TEAM_DOMAIN', 'https://attacker.example.com'],
    ['CF_ACCESS_ALLOWED_EMAILS', ''],
    ['CF_ACCESS_ALLOWED_EMAILS', 'not-an-email'],
  ])('rejects unsafe or malformed %s=%s', (name, value) => {
    expect(() => loadConfig({ ...BASE, [name]: value })).toThrow()
  })

  it('rejects a shared gateway and health port', () => {
    expect(() => loadConfig({ ...BASE, GATEWAY_PORT: '9000', GATEWAY_HEALTH_PORT: '9000' })).toThrow()
  })

  it('accepts a trusted relay token with at least 256 bits of entropy', () => {
    const config = loadConfig({
      DSH_UPSTREAM_URL: BASE.DSH_UPSTREAM_URL,
      PUBLIC_ORIGIN: 'https://203.0.113.10',
      GATEWAY_AUTH_MODE: 'trusted-relay',
      TRUSTED_RELAY_TOKEN: Buffer.alloc(32, 7).toString('base64url'),
    })
    expect(config.auth).toEqual({
      mode: 'trusted-relay',
      token: Buffer.alloc(32, 7).toString('base64url'),
    })
  })

  it.each([
    '',
    'too-short',
    'a'.repeat(42),
    `${Buffer.alloc(32, 7).toString('base64url')}=`,
  ])('rejects an unsafe trusted relay token %s', (token) => {
    expect(() => loadConfig({
      DSH_UPSTREAM_URL: BASE.DSH_UPSTREAM_URL,
      PUBLIC_ORIGIN: 'https://203.0.113.10',
      GATEWAY_AUTH_MODE: 'trusted-relay',
      TRUSTED_RELAY_TOKEN: token,
    })).toThrow()
  })

  it('rejects an unknown authentication mode', () => {
    expect(() => loadConfig({ ...BASE, GATEWAY_AUTH_MODE: 'none' })).toThrow()
  })

  const PAIRING = {
    GATEWAY_AUTH_MODE: 'pairing',
    DSH_UPSTREAM_URL: 'http://127.0.0.1:3080',
    PUBLIC_ORIGIN: 'https://dsh.example.com',
    DEVICE_SESSION_FILE: 'C:\\dsh\\state\\device-sessions.json',
  }

  it('accepts the pairing mode with fail-closed defaults', () => {
    const config = loadConfig(PAIRING)
    expect(config.auth.mode).toBe('pairing')
    if (config.auth.mode !== 'pairing') throw new Error('unexpected auth mode')
    expect(config.auth.deviceSessionFile).toBe('C:\\dsh\\state\\device-sessions.json')
    expect(config.auth.deviceMax).toBe(20)
    expect(config.auth.sessionTtlMs).toBe(30 * 24 * 60 * 60_000)
    expect(config.auth.ticketTtlMs).toBe(5 * 60_000)
    expect(config.auth.ticketMax).toBe(100)
    expect(config.auth.claimRateLimit).toBe(60)
    expect(config.auth.claimRateWindowMs).toBe(60_000)
  })

  it('accepts explicit pairing tuning values', () => {
    const config = loadConfig({
      ...PAIRING,
      DEVICE_SESSION_MAX: '4',
      DEVICE_SESSION_TTL_DAYS: '7',
      PAIRING_TICKET_TTL_SECONDS: '600',
      PAIRING_MAX_TICKETS: '50',
      PAIRING_CLAIM_RATE_PER_MINUTE: '10',
    })
    if (config.auth.mode !== 'pairing') throw new Error('unexpected auth mode')
    expect(config.auth.deviceMax).toBe(4)
    expect(config.auth.sessionTtlMs).toBe(7 * 24 * 60 * 60_000)
    expect(config.auth.ticketTtlMs).toBe(600_000)
    expect(config.auth.ticketMax).toBe(50)
    expect(config.auth.claimRateLimit).toBe(10)
  })

  it.each([
    ['missing session file', { ...PAIRING, DEVICE_SESSION_FILE: undefined }, 'DEVICE_SESSION_FILE is required'],
    ['relative session file', { ...PAIRING, DEVICE_SESSION_FILE: 'state.json' }, 'absolute file path'],
    ['blank session file', { ...PAIRING, DEVICE_SESSION_FILE: '   ' }, 'is required'],
    ['zero devices', { ...PAIRING, DEVICE_SESSION_MAX: '0' }, null],
    ['too many devices', { ...PAIRING, DEVICE_SESSION_MAX: '1001' }, null],
    ['zero-day ttl', { ...PAIRING, DEVICE_SESSION_TTL_DAYS: '0' }, null],
    ['too-long ttl', { ...PAIRING, DEVICE_SESSION_TTL_DAYS: '366' }, null],
    ['too-short ticket ttl', { ...PAIRING, PAIRING_TICKET_TTL_SECONDS: '29' }, null],
    ['too-long ticket ttl', { ...PAIRING, PAIRING_TICKET_TTL_SECONDS: '3601' }, null],
    ['zero claim rate', { ...PAIRING, PAIRING_CLAIM_RATE_PER_MINUTE: '0' }, null],
    ['non-numeric claim rate', { ...PAIRING, PAIRING_CLAIM_RATE_PER_MINUTE: 'many' }, null],
  ])('rejects invalid pairing configuration (%s)', (_label, env, message) => {
    const cleaned: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) cleaned[key] = value
    }
    expect(() => loadConfig(cleaned)).toThrow(message ?? undefined)
  })

  const QUICK = {
    GATEWAY_AUTH_MODE: 'pairing',
    DSH_UPSTREAM_URL: 'http://127.0.0.1:3080',
    PUBLIC_ORIGIN: 'https://dsh.example.com',
    DEVICE_SESSION_FILE: 'C:\\dsh\\state\\device-sessions.json',
    QUICK_TUNNEL_CACHE_DIR: 'C:\\dsh\\tools\\cloudflared',
  }

  it('accepts the quick tunnel configuration with fail-closed defaults', () => {
    const config = loadQuickTunnelConfig(QUICK)
    expect(config.cacheDir).toBe('C:\\dsh\\tools\\cloudflared')
    expect(config.startTimeoutMs).toBe(30_000)
  })

  it('accepts an explicit quick tunnel start timeout', () => {
    expect(loadQuickTunnelConfig({ ...QUICK, QUICK_TUNNEL_START_TIMEOUT_MS: '60000' }).startTimeoutMs).toBe(60_000)
  })

  it.each([
    ['missing cache dir', { ...QUICK, QUICK_TUNNEL_CACHE_DIR: undefined }, 'QUICK_TUNNEL_CACHE_DIR is required'],
    ['relative cache dir', { ...QUICK, QUICK_TUNNEL_CACHE_DIR: 'tools' }, 'absolute directory path'],
    ['too-short timeout', { ...QUICK, QUICK_TUNNEL_START_TIMEOUT_MS: '4000' }, null],
    ['too-long timeout', { ...QUICK, QUICK_TUNNEL_START_TIMEOUT_MS: '120001' }, null],
  ])('rejects invalid quick tunnel configuration (%s)', (_label, env, message) => {
    const cleaned: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) cleaned[key] = value
    }
    expect(() => loadQuickTunnelConfig(cleaned)).toThrow(message ?? undefined)
  })
})

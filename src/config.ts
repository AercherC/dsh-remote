/** Strict startup configuration for the loopback-only gateway. */

import { isAbsolute } from 'node:path'

export interface CloudflareAccessAuthConfig {
  readonly mode: 'cloudflare-access'
  readonly issuer: URL
  readonly audience: string
  readonly allowedEmails: ReadonlySet<string>
}

export interface TrustedRelayAuthConfig {
  readonly mode: 'trusted-relay'
  readonly token: string
}

export interface PairingAuthConfig {
  readonly mode: 'pairing'
  /** Absolute state-file path; required so the gateway never writes into the checkout. */
  readonly deviceSessionFile: string
  readonly deviceMax: number
  readonly sessionTtlMs: number
  readonly ticketTtlMs: number
  readonly ticketMax: number
  readonly claimRateLimit: number
  readonly claimRateWindowMs: number
}

export interface QuickTunnelConfig {
  /** Absolute cache directory for the cloudflared binary (injected, never hard-coded). */
  readonly cacheDir: string
  readonly startTimeoutMs: number
}

export type GatewayAuthConfig = CloudflareAccessAuthConfig | TrustedRelayAuthConfig | PairingAuthConfig

export interface GatewayConfig {
  readonly listenHost: '127.0.0.1'
  readonly port: number
  readonly healthPort: number
  readonly upstream: URL
  readonly publicOrigin: URL
  readonly auth: GatewayAuthConfig
  /**
   * Path prefixes the PUBLIC entry may never reach, even with a valid device
   * session. The gateway answers 404 before authentication so the endpoints
   * are indistinguishable from missing. The DSH plugin registers its
   * management RPC under `/api/dsh-remote` and lists that prefix here: the
   * management plane is loopback-only even though the proxy rewrites Host to
   * the loopback upstream. V1 modes leave this unset.
   */
  readonly deniedPublicPaths?: readonly string[]
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (value === undefined || value.trim() === '') throw new Error(`${name} is required`)
  if (value !== value.trim()) throw new Error(`${name} must not contain surrounding whitespace`)
  return value
}

function port(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name] ?? String(fallback)
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer between 1 and 65535`)
  const value = Number(raw)
  if (value < 1 || value > 65535) throw new Error(`${name} must be an integer between 1 and 65535`)
  return value
}

function origin(raw: string, name: string, protocol: 'http:' | 'https:'): URL {
  let value: URL
  try {
    value = new URL(raw)
  } catch {
    throw new Error(`${name} must be an absolute ${protocol.slice(0, -1)} origin`)
  }
  if (value.protocol !== protocol || value.username !== '' || value.password !== ''
    || value.pathname !== '/' || value.search !== '' || value.hash !== '') {
    throw new Error(`${name} must be an absolute ${protocol.slice(0, -1)} origin without credentials, path, query, or fragment`)
  }
  return value
}

function upstreamOrigin(raw: string): URL {
  const value = origin(raw, 'DSH_UPSTREAM_URL', 'http:')
  if (value.hostname !== '127.0.0.1') {
    throw new Error('DSH_UPSTREAM_URL must use the IPv4 loopback host 127.0.0.1')
  }
  return value
}

function teamDomain(raw: string): URL {
  const value = origin(raw, 'CF_ACCESS_TEAM_DOMAIN', 'https:')
  if (!value.hostname.endsWith('.cloudflareaccess.com') || value.hostname === 'cloudflareaccess.com') {
    throw new Error('CF_ACCESS_TEAM_DOMAIN must be a Cloudflare Access team domain')
  }
  return value
}

function emailAllowlist(raw: string): ReadonlySet<string> {
  const values = raw.split(',').map(value => value.trim().toLowerCase())
  if (values.some(value => value === '' || !/^[^@\s]+@[^@\s]+$/.test(value))) {
    throw new Error('CF_ACCESS_ALLOWED_EMAILS must be a comma-separated list of email addresses')
  }
  return new Set(values)
}

export function relayToken(raw: string): string {
  if (!/^[A-Za-z0-9_-]{43,86}$/.test(raw)) {
    throw new Error('relay token must be an unpadded base64url value containing 32 to 64 random bytes')
  }
  const decoded = Buffer.from(raw, 'base64url')
  if (decoded.length < 32 || decoded.length > 64 || decoded.toString('base64url') !== raw) {
    throw new Error('relay token must be an unpadded base64url value containing 32 to 64 random bytes')
  }
  return raw
}

function integerSetting(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name] ?? String(fallback)
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer between ${String(minimum)} and ${String(maximum)}`)
  }
  const value = Number(raw)
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${String(minimum)} and ${String(maximum)}`)
  }
  return value
}

function pairingConfig(env: NodeJS.ProcessEnv): PairingAuthConfig {
  const file = required(env, 'DEVICE_SESSION_FILE')
  if (!isAbsolute(file)) throw new Error('DEVICE_SESSION_FILE must be an absolute file path')
  return {
    mode: 'pairing',
    deviceSessionFile: file,
    deviceMax: integerSetting(env, 'DEVICE_SESSION_MAX', 20, 1, 1000),
    sessionTtlMs: integerSetting(env, 'DEVICE_SESSION_TTL_DAYS', 30, 1, 365) * 24 * 60 * 60_000,
    ticketTtlMs: integerSetting(env, 'PAIRING_TICKET_TTL_SECONDS', 300, 30, 3600) * 1000,
    ticketMax: integerSetting(env, 'PAIRING_MAX_TICKETS', 100, 10, 10000),
    claimRateLimit: integerSetting(env, 'PAIRING_CLAIM_RATE_PER_MINUTE', 60, 1, 1000),
    claimRateWindowMs: 60_000,
  }
}

/** Quick Mode tunnel configuration (standalone; V1 modes never touch it). */
export function loadQuickTunnelConfig(env: NodeJS.ProcessEnv = process.env): QuickTunnelConfig {
  const cacheDir = required(env, 'QUICK_TUNNEL_CACHE_DIR')
  if (!isAbsolute(cacheDir)) throw new Error('QUICK_TUNNEL_CACHE_DIR must be an absolute directory path')
  return {
    cacheDir,
    startTimeoutMs: integerSetting(env, 'QUICK_TUNNEL_START_TIMEOUT_MS', 30000, 5000, 120000),
  }
}

function authConfig(env: NodeJS.ProcessEnv): GatewayAuthConfig {
  const mode = required(env, 'GATEWAY_AUTH_MODE')
  if (mode === 'cloudflare-access') {
    const audience = required(env, 'CF_ACCESS_AUDIENCE')
    if (audience.length > 512 || /\s/.test(audience)) {
      throw new Error('CF_ACCESS_AUDIENCE must be a non-whitespace value of at most 512 characters')
    }
    return {
      mode,
      issuer: teamDomain(required(env, 'CF_ACCESS_TEAM_DOMAIN')),
      audience,
      allowedEmails: emailAllowlist(required(env, 'CF_ACCESS_ALLOWED_EMAILS')),
    }
  }
  if (mode === 'trusted-relay') {
    const token = relayToken(required(env, 'TRUSTED_RELAY_TOKEN'))
    return { mode, token }
  }
  if (mode === 'pairing') {
    return pairingConfig(env)
  }
  throw new Error('GATEWAY_AUTH_MODE must be cloudflare-access, trusted-relay, or pairing')
}

/** Parse all deployment inputs and reject unsafe topology before any socket binds. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const gatewayPort = port(env, 'GATEWAY_PORT', 8787)
  const healthPort = port(env, 'GATEWAY_HEALTH_PORT', 8788)
  if (gatewayPort === healthPort) throw new Error('GATEWAY_PORT and GATEWAY_HEALTH_PORT must differ')
  return {
    listenHost: '127.0.0.1',
    port: gatewayPort,
    healthPort,
    upstream: upstreamOrigin(required(env, 'DSH_UPSTREAM_URL')),
    publicOrigin: origin(required(env, 'PUBLIC_ORIGIN'), 'PUBLIC_ORIGIN', 'https:'),
    auth: authConfig(env),
  }
}

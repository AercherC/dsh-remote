import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { singleHeader } from './headers.js'
import { deviceTokenFromCookie, DEVICE_TOKEN_RE } from './device-session.js'
import type { DeviceSessionStore } from './device-session.js'

export interface AccessPrincipal {
  readonly subject: string
}

export interface Authenticator {
  authenticate(headers: IncomingHttpHeaders): Promise<AccessPrincipal>
}

export interface CloudflareAccessOptions {
  readonly issuer: URL
  readonly audience: string
  readonly allowedEmails: ReadonlySet<string>
}

export interface TrustedRelayOptions {
  readonly token: string
}

export interface PairingAuthOptions {
  readonly sessions: DeviceSessionStore
}

export const TRUSTED_RELAY_HEADER = 'x-dsh-relay-authorization'

export class AuthenticationError extends Error {
  constructor() {
    super('request authentication failed')
    this.name = 'AuthenticationError'
  }
}

/** Verify Cloudflare Access application assertions with its rotating remote JWKS. */
export function createCloudflareAccessAuthenticator(options: CloudflareAccessOptions): Authenticator {
  const issuer = options.issuer.origin
  const jwks = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', options.issuer), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
  })
  return {
    async authenticate(headers): Promise<AccessPrincipal> {
      const token = singleHeader(headers, 'cf-access-jwt-assertion')
      if (token === undefined) throw new AuthenticationError()
      try {
        const { payload } = await jwtVerify(token, jwks, {
          algorithms: ['RS256'],
          issuer,
          audience: options.audience,
          clockTolerance: 5,
        })
        if (payload.type !== 'app' || typeof payload.sub !== 'string' || payload.sub === ''
          || typeof payload.email !== 'string' || typeof payload.exp !== 'number'
          || typeof payload.iat !== 'number'
          || !options.allowedEmails.has(payload.email.toLowerCase())) {
          throw new AuthenticationError()
        }
        return { subject: payload.sub }
      } catch {
        throw new AuthenticationError()
      }
    },
  }
}

/**
 * Authenticate the private hop from a mutually-authenticated TLS edge proxy.
 *
 * This token is a machine credential carried only over loopback or an encrypted
 * reverse tunnel. End-user identity is established by mTLS at the public edge.
 */
export function createTrustedRelayAuthenticator(options: TrustedRelayOptions): Authenticator {
  const expected = createHash('sha256').update(`Bearer ${options.token}`, 'utf8').digest()
  return {
    async authenticate(headers): Promise<AccessPrincipal> {
      const authorization = singleHeader(headers, TRUSTED_RELAY_HEADER)
      if (authorization === undefined) throw new AuthenticationError()
      const actual = createHash('sha256').update(authorization, 'utf8').digest()
      if (!timingSafeEqual(actual, expected)) throw new AuthenticationError()
      return { subject: 'trusted-mtls-relay' }
    },
  }
}

/**
 * Authenticate a paired browser by its device-session cookie.
 *
 * The raw 256-bit token is hashed with SHA-256 and looked up in the device
 * session store; only the hash is ever persisted. The cookie value itself is
 * validated for shape before hashing, and duplicate same-name cookies are
 * rejected so a client cannot smuggle a second candidate value.
 */
export function createPairingAuthenticator(options: PairingAuthOptions): Authenticator {
  return {
    async authenticate(headers): Promise<AccessPrincipal> {
      const rawToken = deviceTokenFromCookie(
        typeof headers.cookie === 'string' ? headers.cookie : undefined,
      )
      if (rawToken === undefined || !DEVICE_TOKEN_RE.test(rawToken)) throw new AuthenticationError()
      const device = await options.sessions.verify(rawToken)
      if (device === undefined) throw new AuthenticationError()
      return { subject: `device:${device.id}` }
    },
  }
}

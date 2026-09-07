import { createServer } from 'node:http'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCloudflareAccessAuthenticator, createTrustedRelayAuthenticator } from '../src/auth.js'
import { close, listen } from './helpers.js'

describe('Cloudflare Access authentication', () => {
  const servers: ReturnType<typeof createServer>[] = []
  let issuer: URL
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
  const audience = 'test-application-audience'

  beforeEach(async () => {
    const pair = await generateKeyPair('RS256')
    privateKey = pair.privateKey
    const jwk = await exportJWK(pair.publicKey)
    const server = createServer((request, response) => {
      if (request.url !== '/cdn-cgi/access/certs') {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] }))
    })
    servers.push(server)
    issuer = new URL(`http://127.0.0.1:${String(await listen(server))}`)
  })

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close))
  })

  async function token(overrides: Record<string, unknown> = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({
      type: 'app',
      email: 'owner@example.com',
      ...overrides,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer.origin)
      .setAudience(audience)
      .setSubject('user-1')
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey)
  }

  it('accepts a signed assertion for the configured app and identity', async () => {
    const auth = createCloudflareAccessAuthenticator({
      issuer,
      audience,
      allowedEmails: new Set(['owner@example.com']),
    })
    await expect(auth.authenticate({ 'cf-access-jwt-assertion': await token() }))
      .resolves.toEqual({ subject: 'user-1' })
  })

  it.each([
    ['wrong audience', { audience: 'other' }],
    ['wrong email', { email: 'attacker@example.com' }],
    ['wrong type', { type: 'org' }],
  ])('rejects %s', async (_label, scenario) => {
    const auth = createCloudflareAccessAuthenticator({
      issuer,
      audience,
      allowedEmails: new Set(['owner@example.com']),
    })
    const signed = !('audience' in scenario)
      ? await token(scenario)
      : await new SignJWT({ type: 'app', email: 'owner@example.com' })
          .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
          .setIssuer(issuer.origin).setAudience(scenario.audience).setSubject('user-1')
          .setIssuedAt().setExpirationTime('5m').sign(privateKey)
    await expect(auth.authenticate({ 'cf-access-jwt-assertion': signed })).rejects.toThrow('authentication failed')
  })

  it('rejects missing and malformed assertions without exposing verifier details', async () => {
    const auth = createCloudflareAccessAuthenticator({
      issuer,
      audience,
      allowedEmails: new Set(['owner@example.com']),
    })
    await expect(auth.authenticate({})).rejects.toThrow('request authentication failed')
    await expect(auth.authenticate({ 'cf-access-jwt-assertion': 'not-a-jwt' }))
      .rejects.toThrow('request authentication failed')
  })
})

describe('trusted relay authentication', () => {
  const token = Buffer.alloc(32, 17).toString('base64url')
  const auth = createTrustedRelayAuthenticator({ token })

  it('accepts only the exact private relay credential', async () => {
    await expect(auth.authenticate({ 'x-dsh-relay-authorization': `Bearer ${token}` }))
      .resolves.toEqual({ subject: 'trusted-mtls-relay' })
  })

  it.each([
    {},
    { 'x-dsh-relay-authorization': `bearer ${token}` },
    { 'x-dsh-relay-authorization': `Bearer ${token.slice(0, -1)}x` },
    { 'x-dsh-relay-authorization': [`Bearer ${token}`, `Bearer ${token}`] },
  ])('rejects missing, malformed, or ambiguous credentials', async (headers) => {
    await expect(auth.authenticate(headers)).rejects.toThrow('request authentication failed')
  })
})

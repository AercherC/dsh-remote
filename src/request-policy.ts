import type { IncomingMessage } from 'node:http'
import { singleHeader } from './headers.js'
import type { PublicOriginProvider } from './public-origin.js'

export class RequestPolicyError extends Error {
  constructor() {
    super('request policy rejected')
    this.name = 'RequestPolicyError'
  }
}

/** Thrown when the gateway is CLOSED (no active public origin yet). */
export class PublicOriginUnavailableError extends Error {
  constructor() {
    super('public origin unavailable')
    this.name = 'PublicOriginUnavailableError'
  }
}

function currentOrigin(provider: PublicOriginProvider): URL {
  const origin = provider.get()
  if (origin === undefined) throw new PublicOriginUnavailableError()
  return origin
}

function exactOrigin(raw: string, expected: URL): boolean {
  try {
    return new URL(raw).origin === raw && raw === expected.origin
  } catch {
    return false
  }
}

function commonChecks(request: IncomingMessage, publicOrigin: URL): void {
  const host = singleHeader(request.headers, 'host')
  if (host === undefined || host.toLowerCase() !== publicOrigin.host) throw new RequestPolicyError()
  if (singleHeader(request.headers, 'sec-fetch-site') === 'cross-site') throw new RequestPolicyError()
  const requestOrigin = singleHeader(request.headers, 'origin')
  if (requestOrigin !== undefined && !exactOrigin(requestOrigin, publicOrigin)) throw new RequestPolicyError()
}

/**
 * Enforce the public same-origin browser policy before an ordinary HTTP
 * proxy request. When the provider reports no active origin (CLOSED), the
 * request is rejected with {@link PublicOriginUnavailableError} — Host / Origin
 * validation is never skipped.
 */
export function enforceHttpRequestPolicy(request: IncomingMessage, publicOrigin: PublicOriginProvider): void {
  commonChecks(request, currentOrigin(publicOrigin))
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const requestOrigin = singleHeader(request.headers, 'origin')
    if (requestOrigin === undefined || !exactOrigin(requestOrigin, currentOrigin(publicOrigin))) {
      throw new RequestPolicyError()
    }
  }
}

/** Enforce a same-origin browser WebSocket handshake before accepting the upgrade. */
export function enforceWebSocketRequestPolicy(request: IncomingMessage, publicOrigin: PublicOriginProvider): void {
  const origin = currentOrigin(publicOrigin)
  commonChecks(request, origin)
  const requestOrigin = singleHeader(request.headers, 'origin')
  if (requestOrigin === undefined || !exactOrigin(requestOrigin, origin)) throw new RequestPolicyError()
  if (singleHeader(request.headers, 'upgrade')?.toLowerCase() !== 'websocket') throw new RequestPolicyError()
}

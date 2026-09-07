import type { IncomingHttpHeaders } from 'node:http'

/** Read a security-sensitive header only when Node parsed exactly one value. */
export function singleHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

const ACCESS_COOKIE_NAMES = new Set([
  'CF_Authorization',
  'CF_Binding',
  'CF_Session',
  'CF_AppSession',
  'CF_Device',
])

/** Remove Cloudflare Access cookies while preserving any DSH-owned cookies. */
export function sanitizeCookieHeader(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const kept = value.split(';').map(part => part.trim()).filter((part) => {
    const equals = part.indexOf('=')
    const name = equals === -1 ? part : part.slice(0, equals)
    return !ACCESS_COOKIE_NAMES.has(name)
  })
  return kept.length === 0 ? undefined : kept.join('; ')
}

/** Headers carrying edge identity or network provenance must not reach DSH. */
export const STRIPPED_UPSTREAM_HEADERS = [
  'authorization',
  'cf-access-jwt-assertion',
  'cf-access-client-id',
  'cf-access-client-secret',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-real-ip',
  'x-dsh-relay-authorization',
] as const

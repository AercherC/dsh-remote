/**
 * Runtime public-origin control (R03).
 *
 * V1 loaded PUBLIC_ORIGIN once at startup as an immutable URL. Quick Mode
 * cannot know its public origin until cloudflared hands out a
 * `https://*.trycloudflare.com` URL at runtime, so the gateway now reads the
 * origin through a provider:
 *
 *   - V1 modes (cloudflare-access / trusted-relay): a static provider over
 *     the configured PUBLIC_ORIGIN — behavior unchanged.
 *   - Quick Mode (pairing + Quick Tunnel): a controller that starts CLOSED
 *     (get() → undefined) and only opens when the tunnel reports a validated
 *     URL; a tunnel crash or stop clears it again.
 *
 * CLOSED must fail closed: the request policy turns `undefined` into a
 * "public origin unavailable" rejection (503) instead of skipping Host /
 * Origin validation. There is deliberately no wildcard, no origin list, no
 * LAN origin, and no multi-host support — V2.1 may revisit that.
 */

export interface PublicOriginProvider {
  /** The exact origin public requests must match, or undefined when CLOSED. */
  get(): URL | undefined
}

export interface PublicOriginController extends PublicOriginProvider {
  set(origin: URL): void
  clear(): void
}

export function createPublicOriginController(): PublicOriginController {
  let active: URL | undefined
  return {
    get: () => active,
    set(origin) { active = origin },
    clear() { active = undefined },
  }
}

/** Immutable origin for V1 modes; keeps request-policy behavior byte-identical. */
export function staticPublicOrigin(origin: URL): PublicOriginProvider {
  return { get: () => origin }
}

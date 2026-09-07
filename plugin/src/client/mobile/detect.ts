/**
 * R06C4C / R06C4C1 — final phone/tablet/unknown classifier (pure, no DOM/Node
 * APIs, 100% SYNCHRONOUS).
 *
 * The FINAL rule (design amendment): the device signal is high-priority
 * evidence but an unrecognized device must never be dropped to the native UI
 * by default. Priority is strictly:
 *
 *   Explicit Tablet > Explicit Phone > Unknown fallback
 *
 *   - Explicit tablet                    → NOT a phone (native DSH UI)
 *   - Explicit phone AND shortSide < 600 → phone
 *   - Unknown AND shortSide < 560 AND primary pointer is coarse → phone
 *   - everything else                    → NOT a phone (native DSH UI)
 *
 * R06C4C1 (Code Review correction): the asynchronous UA-CH high-entropy
 * form-factor probe was REMOVED. Classification uses only synchronous,
 * low-entropy evidence (UA string, `userAgentData.mobile`, `platform`,
 * `maxTouchPoints`, `screen` short side, primary pointer) — the decision is
 * final on the first frame and can never flip within a page session. No
 * high-entropy UA-CH hint requests, no form-factor probes, no device models,
 * no brands, no screen-inch tables, no third-party detection packages, no
 * fingerprinting.
 *
 * This module is deliberately free of browser globals so the classification
 * matrix can be unit-tested in Node. The browser adapter that gathers
 * `navigator` / `screen` / `matchMedia` values lives in `detect-browser.ts`.
 */

export type DeviceType = 'phone' | 'tablet' | 'unknown'

export interface PhoneDetectionInput {
  /** Full user-agent string (the classifier tests case-insensitively). */
  readonly ua: string
  /** navigator.userAgentData.mobile — `undefined` when UA-CH is unavailable. */
  readonly userAgentDataMobile: boolean | undefined
  /** navigator.platform (legacy; used for the iPadOS 13+ Safari signal). */
  readonly platform: string | undefined
  /** navigator.maxTouchPoints (used for the iPadOS 13+ Safari signal). */
  readonly maxTouchPoints: number | undefined
  /** Math.min(screen.width, screen.height) in CSS pixels. */
  readonly screenShortSide: number
  /** window.matchMedia('(pointer: coarse)').matches */
  readonly pointerCoarse: boolean
}

/** Explicit-phone size gate: screen short side must be BELOW 600 CSS px. */
export const EXPLICIT_PHONE_SIZE_GATE = 600
/** Unknown-fallback size gate: screen short side must be BELOW 560 CSS px. */
export const UNKNOWN_FALLBACK_SIZE_GATE = 560
/** Unknown-fallback tablet lower size gate: a coarse unknown device at/above this is a tablet picker candidate. */
export const TABLET_SIZE_GATE_MIN = 600
/** Unknown-fallback tablet upper size gate: below this is a tablet picker candidate; at/above is desktop (excluded). */
export const TABLET_SIZE_GATE_MAX = 1024

const RE_IPHONE = /\biPhone\b|\biPod\b/i
const RE_ANDROID = /\bAndroid\b/i
const RE_MOBILE = /\bMobile\b/i
const RE_IPAD = /\biPad\b/i

/**
 * Classify a device as phone / tablet / unknown.
 *
 * Explicit tablet requires STRONG evidence only:
 *   - a real iPad / iPadOS marker in the UA
 *   - iPadOS 13+ Safari (which reports a Macintosh UA): `platform ===
 *     'MacIntel'` AND a multi-touch screen — the standard reliable iPad
 *     signal. A real Mac has `maxTouchPoints` 0, so it is never mistaken for
 *     an iPad.
 *
 * `userAgentData.mobile === false` is deliberately NOT tablet evidence (it is
 * equally a desktop), and an Android UA without the `Mobile` token is NOT
 * force-locked as a tablet — both fall through to `unknown`.
 *
 * Explicit phone:
 *   - navigator.userAgentData.mobile === true
 *   - iPhone / iPod in the UA
 *   - Android AND Mobile BOTH in the UA (Android alone is never enough)
 */
export function detectDeviceType(input: PhoneDetectionInput): DeviceType {
  // Explicit tablet — always wins, even with a phone-sized screen.
  if (RE_IPAD.test(input.ua)) return 'tablet'
  if (input.platform === 'MacIntel' && (input.maxTouchPoints ?? 0) > 1) return 'tablet'

  // Explicit phone.
  if (input.userAgentDataMobile === true) return 'phone'
  if (RE_IPHONE.test(input.ua)) return 'phone'
  if (RE_ANDROID.test(input.ua) && RE_MOBILE.test(input.ua)) return 'phone'

  // Insufficient evidence: neither phone nor tablet can be asserted.
  return 'unknown'
}

/**
 * The final rule. Returns the ONLY two outcomes the product needs:
 * `true` → Phone Enhancements, `false` → native DSH UI.
 *
 * Synchronous and deterministic: the same inputs always produce the same
 * boolean on the first call — no promise, no later flip.
 */
export function detectPhone(input: PhoneDetectionInput): boolean {
  const shortSide = input.screenShortSide
  switch (detectDeviceType(input)) {
    case 'tablet':
      return false
    case 'phone':
      return shortSide < EXPLICIT_PHONE_SIZE_GATE
    case 'unknown':
      return shortSide < UNKNOWN_FALLBACK_SIZE_GATE && input.pointerCoarse
  }
}

/**
 * R14.2 — tablet picker eligibility (synchronous, pure, same inputs → same
 * boolean; never flips within a session).
 *
 * `true` → the device should register the mobile workspace picker (browse
 * rendering) WITHOUT the phone UI layer. Two routes:
 *   - explicit tablet (iPad / iPadOS Safari) → tablet, regardless of size;
 *   - unknown + coarse pointer + short side in [600, 1024) → touch tablet
 *     (Android tablets report an `Android` UA without the `Mobile` token and
 *     land in `unknown`).
 *
 * A desktop (fine pointer) never matches; a touch laptop at short side
 * >= 1024 is excluded by the upper gate. `phone` devices never match (their
 * picker eligibility is `detectPhone`).
 */
export function detectTablet(input: PhoneDetectionInput): boolean {
  switch (detectDeviceType(input)) {
    case 'tablet':
      return true
    case 'phone':
      return false
    case 'unknown':
      return input.pointerCoarse
        && input.screenShortSide >= TABLET_SIZE_GATE_MIN
        && input.screenShortSide < TABLET_SIZE_GATE_MAX
  }
}

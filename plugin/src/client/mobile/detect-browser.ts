/**
 * R06C4C1 — browser adapter for the phone classifier (100% synchronous).
 *
 * Gathers the real browser signals and computes the final `isPhone` boolean
 * ONCE, synchronously, on first access. There is no asynchronous path, no
 * high-entropy UA-CH hint request (removed in R06C4C1), no promise, and no
 * later flip: the decision for the page session is immutable.
 *
 * Device classification NEVER changes with the viewport: not with a narrowed
 * window, a popped-up keyboard, the settings drawer, the address bar, or
 * innerHeight — only `screen` short side + device evidence decide.
 * `Math.min(screen.width, screen.height)` is also orientation-invariant (the
 * two values swap on rotation, the minimum stays the same).
 *
 * Consumers read the shared lazy singleton, so the settings section and the
 * overlay always use the SAME decision.
 */

import { detectPhone, detectTablet, type PhoneDetectionInput } from './detect.js'

export interface PhoneDetection {
  /** Final, synchronous, immutable decision for this page session. */
  readonly isPhone: boolean
  /** R14.2: tablet picker eligibility (browse picker without the phone UI layer). */
  readonly isTablet: boolean
}

export function createPhoneDetection(): PhoneDetection {
  const input = readBrowserInput()
  return { isPhone: detectPhone(input), isTablet: detectTablet(input) }
}

function readBrowserInput(): PhoneDetectionInput {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } | undefined }
  return {
    ua: navigator.userAgent,
    userAgentDataMobile: nav.userAgentData?.mobile,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    screenShortSide: Math.min(screen.width, screen.height),
    pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
  }
}

let instance: PhoneDetection | undefined

/** The shared, lazily-created detection (one synchronous decision per page load). */
export function getPhoneDetection(): PhoneDetection {
  instance ??= createPhoneDetection()
  return instance
}

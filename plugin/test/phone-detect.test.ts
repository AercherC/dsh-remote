/**
 * R06C4C / R06C4C1 — final phone classifier tests.
 *
 * Locks the amended decision rule:
 *
 *   Explicit Tablet  → native (never phone)
 *   Explicit Phone   → phone iff screen short side < 600
 *   Unknown          → phone iff screen short side < 560 AND pointer coarse
 *   everything else  → native
 *
 * R06C4C1 (Code Review correction): the async UA-CH high-entropy form-factor
 * probe was REMOVED — classification is 100% synchronous and the browser
 * adapter returns the final boolean on the first call, with no promise path
 * that could flip it later. Tests below lock that contract.
 *
 * The 17-case matrix from the design amendment (§九) plus UA parsing
 * variants. The classifier is pure — no DOM, no navigator — so every case
 * runs in Node.
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  detectDeviceType,
  detectPhone,
  detectTablet,
  EXPLICIT_PHONE_SIZE_GATE,
  UNKNOWN_FALLBACK_SIZE_GATE,
  TABLET_SIZE_GATE_MIN,
  TABLET_SIZE_GATE_MAX,
  type PhoneDetectionInput,
  type DeviceType,
} from '../src/client/mobile/detect.js'
import { createPhoneDetection } from '../src/client/mobile/detect-browser.js'

const ANDROID_PHONE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const ANDROID_TABLET_UA = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPADOS_SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const IPOD_UA = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const FOLD_UA = 'Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

function input(overrides: Partial<PhoneDetectionInput> = {}): PhoneDetectionInput {
  return {
    ua: ANDROID_PHONE_UA,
    userAgentDataMobile: undefined,
    platform: undefined,
    maxTouchPoints: undefined,
    screenShortSide: 390,
    pointerCoarse: true,
    ...overrides,
  }
}

describe('R06C4C final classification matrix (amendment §九)', () => {
  const cases: Array<{ name: string; input: PhoneDetectionInput; expected: boolean; type?: DeviceType }> = [
    { name: '1. Android + Mobile, 390×844 → Phone', input: input({ ua: ANDROID_PHONE_UA, screenShortSide: 390 }), expected: true, type: 'phone' },
    { name: '2. Android + Mobile, 844×390 (landscape) → Phone', input: input({ ua: ANDROID_PHONE_UA, screenShortSide: 390 }), expected: true, type: 'phone' },
    { name: '3. iPhone, 390×844 → Phone', input: input({ ua: IPHONE_UA, screenShortSide: 390 }), expected: true, type: 'phone' },
    { name: '4. Explicit phone, short side 599 → Phone', input: input({ screenShortSide: 599 }), expected: true, type: 'phone' },
    { name: '5. Explicit phone, short side 600 → Native', input: input({ screenShortSide: 600 }), expected: false, type: 'phone' },
    { name: '6. Explicit tablet, short side 540 → Native (tablet always wins)', input: input({ ua: IPAD_UA, screenShortSide: 540 }), expected: false, type: 'tablet' },
    { name: '7. UNKNOWN 390×844 coarse → Phone', input: input({ ua: WINDOWS_UA, screenShortSide: 390, pointerCoarse: true }), expected: true, type: 'unknown' },
    { name: '8. UNKNOWN 430×932 coarse → Phone', input: input({ ua: WINDOWS_UA, screenShortSide: 430, pointerCoarse: true }), expected: true, type: 'unknown' },
    { name: '9. UNKNOWN 540×900 coarse → Phone (accepted boundary)', input: input({ ua: WINDOWS_UA, screenShortSide: 540, pointerCoarse: true }), expected: true, type: 'unknown' },
    { name: '10. UNKNOWN 560×900 coarse → Native', input: input({ ua: WINDOWS_UA, screenShortSide: 560, pointerCoarse: true }), expected: false, type: 'unknown' },
    { name: '11. UNKNOWN 600×960 coarse → Native', input: input({ ua: ANDROID_TABLET_UA, screenShortSide: 600, pointerCoarse: true }), expected: false, type: 'unknown' },
    { name: '12. Windows desktop, viewport 390, screen 1080, fine → Native', input: input({ ua: WINDOWS_UA, screenShortSide: 1080, pointerCoarse: false }), expected: false, type: 'unknown' },
    { name: '13. Touch Windows laptop, narrow viewport, short side ≥ 560 → Native', input: input({ ua: WINDOWS_UA, screenShortSide: 1080, pointerCoarse: true, maxTouchPoints: 10 }), expected: false, type: 'unknown' },
    { name: '14. iPad mini, short side 744 → Native', input: input({ ua: IPAD_UA, screenShortSide: 744 }), expected: false, type: 'tablet' },
    { name: '15. 8-inch tablet 600×960 → Native', input: input({ ua: ANDROID_TABLET_UA, screenShortSide: 600, pointerCoarse: true }), expected: false, type: 'unknown' },
    { name: '16. Fold unfolded, short side 673 → Native', input: input({ ua: FOLD_UA, screenShortSide: 673 }), expected: false, type: 'phone' },
    { name: '17. Fold folded, explicit phone, short side < 600 → Phone', input: input({ ua: FOLD_UA, screenShortSide: 599 }), expected: true, type: 'phone' },
  ]

  for (const c of cases) {
    it(c.name, () => {
      expect(detectPhone(c.input)).toBe(c.expected)
      if (c.type !== undefined) expect(detectDeviceType(c.input)).toBe(c.type)
    })
  }
})

describe('device type classification', () => {
  it('userAgentData.mobile === true is explicit phone', () => {
    expect(detectDeviceType(input({ ua: WINDOWS_UA, userAgentDataMobile: true }))).toBe('phone')
  })

  it('userAgentData.mobile === false is NOT tablet (could be desktop) → unknown', () => {
    expect(detectDeviceType(input({ ua: WINDOWS_UA, userAgentDataMobile: false, platform: 'Windows', maxTouchPoints: 0 }))).toBe('unknown')
  })

  it('Android WITHOUT Mobile is NOT force-locked tablet → unknown', () => {
    expect(detectDeviceType(input({ ua: ANDROID_TABLET_UA }))).toBe('unknown')
    // The 8" tablet stays native through the unknown fallback (600 ≥ 560).
    expect(detectPhone(input({ ua: ANDROID_TABLET_UA, screenShortSide: 600, pointerCoarse: true }))).toBe(false)
  })

  it('iPad UA → tablet', () => {
    expect(detectDeviceType(input({ ua: IPAD_UA }))).toBe('tablet')
  })

  it('iPadOS 13+ Safari (Macintosh UA) + multi-touch → tablet', () => {
    expect(detectDeviceType(input({ ua: IPADOS_SAFARI_UA, platform: 'MacIntel', maxTouchPoints: 5 }))).toBe('tablet')
  })

  it('a real Mac (MacIntel, no touch screen) is NOT a tablet → unknown', () => {
    expect(detectDeviceType(input({ ua: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 }))).toBe('unknown')
  })

  it('iPhone / iPod UA → phone (case-insensitive)', () => {
    expect(detectDeviceType(input({ ua: IPHONE_UA }))).toBe('phone')
    expect(detectDeviceType(input({ ua: IPOD_UA }))).toBe('phone')
    expect(detectDeviceType(input({ ua: 'mozilla/5.0 (iphone; cpu iphone os 17)' }))).toBe('phone')
  })

  it('Android alone (no Mobile token) is never explicit phone', () => {
    expect(detectDeviceType(input({ ua: ANDROID_TABLET_UA, userAgentDataMobile: undefined }))).toBe('unknown')
  })
})

describe('size gates', () => {
  it('explicit phone: strict < 600 (599 yes, 600 no, 601 no)', () => {
    expect(EXPLICIT_PHONE_SIZE_GATE).toBe(600)
    expect(detectPhone(input({ ua: IPHONE_UA, screenShortSide: 599 }))).toBe(true)
    expect(detectPhone(input({ ua: IPHONE_UA, screenShortSide: 600 }))).toBe(false)
    expect(detectPhone(input({ ua: IPHONE_UA, screenShortSide: 601 }))).toBe(false)
  })

  it('unknown fallback: strict < 560 AND coarse (559 yes, 560 no; 390 fine-pointer no)', () => {
    expect(UNKNOWN_FALLBACK_SIZE_GATE).toBe(560)
    expect(detectPhone(input({ ua: WINDOWS_UA, screenShortSide: 559, pointerCoarse: true }))).toBe(true)
    expect(detectPhone(input({ ua: WINDOWS_UA, screenShortSide: 560, pointerCoarse: true }))).toBe(false)
    expect(detectPhone(input({ ua: WINDOWS_UA, screenShortSide: 390, pointerCoarse: false }))).toBe(false)
  })

  it('unknown fallback uses screen SHORT side, not viewport width (viewport is never an input)', () => {
    // A desktop whose window is narrowed to 390px still has a large screen
    // short side → native, regardless of any viewport.
    expect(detectPhone(input({ ua: WINDOWS_UA, screenShortSide: 1080, pointerCoarse: true }))).toBe(false)
    // The classifier has no viewport field at all.
    const keys = Object.keys(input({ ua: WINDOWS_UA, screenShortSide: 1080, pointerCoarse: true })).sort()
    expect(keys).not.toContain('viewportWidth')
    expect(keys).not.toContain('innerHeight')
  })
})

describe('R06C4C1: no async UA-CH form-factor path (Code Review correction)', () => {
  it('detectPhone is a synchronous pure function (no async signature)', () => {
    const result = detectPhone(input({ ua: IPHONE_UA, screenShortSide: 390 }))
    expect(result).toBe(true)
    // Same inputs → same output, and calling it cannot change anything.
    expect(detectPhone(input({ ua: IPHONE_UA, screenShortSide: 390 }))).toBe(true)
  })

  it('detection source contains NO getHighEntropyValues / formFactor / formFactors / async', () => {
    const detect = readFileSync(new URL('../src/client/mobile/detect.ts', import.meta.url), 'utf8')
    const browser = readFileSync(new URL('../src/client/mobile/detect-browser.ts', import.meta.url), 'utf8')
    for (const source of [detect, browser]) {
      expect(source).not.toMatch(/getHighEntropyValues/)
      expect(source).not.toMatch(/formFactor/i)
      expect(source).not.toMatch(/\bPromise\b/)
      expect(source).not.toMatch(/\basync\b/)
    }
  })
})

describe('R06C4C1: browser adapter with stubbed browser globals', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubBrowser(opts: { ua: string; mobile?: boolean; platform?: string; maxTouchPoints?: number; screenShort: number; coarse: boolean }): void {
    vi.stubGlobal('navigator', {
      userAgent: opts.ua,
      userAgentData: opts.mobile === undefined ? undefined : { mobile: opts.mobile },
      platform: opts.platform ?? '',
      maxTouchPoints: opts.maxTouchPoints ?? 0,
    })
    vi.stubGlobal('screen', { width: opts.screenShort + 400, height: opts.screenShort })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: opts.coarse }) })
  }

  it('browser detection returns the FINAL boolean on the first call — no subscription, no promise path', () => {
    stubBrowser({ ua: WINDOWS_UA, mobile: false, screenShort: 1080, coarse: false })
    const detection = createPhoneDetection()
    expect(detection.isPhone).toBeTypeOf('boolean')
    // The result object has no subscribe/listener surface and no pending
    // state: there is no code path that could flip isPhone after creation.
    expect('subscribe' in detection).toBe(false)
    expect('resolved' in detection).toBe(false)
  })

  it('the same first-call decision is stable across repeated reads (immutable for the session)', () => {
    stubBrowser({ ua: ANDROID_PHONE_UA, mobile: true, screenShort: 390, coarse: true })
    const detection = createPhoneDetection()
    const first = detection.isPhone
    for (let i = 0; i < 5; i += 1) expect(detection.isPhone).toBe(first)
  })

  it('Android phone (390) → phone immediately', () => {
    stubBrowser({ ua: ANDROID_PHONE_UA, mobile: true, screenShort: 390, coarse: true })
    expect(createPhoneDetection().isPhone).toBe(true)
  })

  it('unknown small touch phone (390 + coarse) → phone immediately', () => {
    // Stripped UA / no UA-CH — the exact case the fallback exists for.
    stubBrowser({ ua: 'Mozilla/5.0 (Linux; U; en-us) AppleWebKit/537.36 Mobile', mobile: undefined, screenShort: 390, coarse: true })
    expect(createPhoneDetection().isPhone).toBe(true)
  })

  it('unknown 560 + coarse → native immediately (threshold)', () => {
    stubBrowser({ ua: WINDOWS_UA, mobile: false, screenShort: 560, coarse: true })
    expect(createPhoneDetection().isPhone).toBe(false)
  })

  it('desktop narrow window (screen 1080) → native immediately', () => {
    stubBrowser({ ua: WINDOWS_UA, mobile: false, screenShort: 1080, coarse: false })
    expect(createPhoneDetection().isPhone).toBe(false)
  })

  it('iPadOS Safari (Macintosh UA + multi-touch) → native immediately', () => {
    stubBrowser({ ua: IPADOS_SAFARI_UA, platform: 'MacIntel', maxTouchPoints: 5, screenShort: 744, coarse: true })
    expect(createPhoneDetection().isPhone).toBe(false)
  })

  it('iPhone (390) → phone immediately', () => {
    stubBrowser({ ua: IPHONE_UA, screenShort: 390, coarse: true })
    expect(createPhoneDetection().isPhone).toBe(true)
  })

  it('600×960 tablet-like screen → native immediately', () => {
    stubBrowser({ ua: ANDROID_TABLET_UA, screenShort: 600, coarse: true })
    expect(createPhoneDetection().isPhone).toBe(false)
  })

  it('returns isTablet alongside isPhone (synchronous, first call)', () => {
    stubBrowser({ ua: ANDROID_TABLET_UA, screenShort: 600, coarse: true })
    const detection = createPhoneDetection()
    expect(detection.isPhone).toBe(false)
    expect(detection.isTablet).toBe(true)
  })

  it('desktop (fine pointer) → neither phone nor tablet', () => {
    stubBrowser({ ua: WINDOWS_UA, mobile: false, screenShort: 1080, coarse: false })
    const detection = createPhoneDetection()
    expect(detection.isPhone).toBe(false)
    expect(detection.isTablet).toBe(false)
  })
})

describe('R14.2: tablet picker eligibility (detectTablet)', () => {
  it('explicit tablet (iPad UA) → tablet regardless of size', () => {
    expect(detectTablet(input({ ua: IPAD_UA, screenShortSide: 744 }))).toBe(true)
    // iPad Pro 12.9" landscape has short side 1024 — still tablet (explicit).
    expect(detectTablet(input({ ua: IPAD_UA, screenShortSide: 1024 }))).toBe(true)
  })

  it('iPadOS 13+ Safari (Macintosh UA + multi-touch) → tablet', () => {
    expect(detectTablet(input({ ua: IPADOS_SAFARI_UA, platform: 'MacIntel', maxTouchPoints: 5, screenShortSide: 744 }))).toBe(true)
  })

  it('Android touch tablet (unknown + coarse + 600) → tablet', () => {
    expect(detectTablet(input({ ua: ANDROID_TABLET_UA, screenShortSide: 600, pointerCoarse: true }))).toBe(true)
  })

  it('unknown + coarse + 800 → tablet', () => {
    expect(detectTablet(input({ ua: ANDROID_TABLET_UA, screenShortSide: 800, pointerCoarse: true }))).toBe(true)
  })

  it('phone never matches tablet', () => {
    expect(detectTablet(input({ ua: IPHONE_UA, screenShortSide: 390 }))).toBe(false)
    expect(detectTablet(input({ ua: ANDROID_PHONE_UA, screenShortSide: 390 }))).toBe(false)
    // Fold unfolded: phone type, short side 673 → still not a tablet.
    expect(detectTablet(input({ ua: FOLD_UA, screenShortSide: 673 }))).toBe(false)
  })

  it('desktop (fine pointer) never matches tablet', () => {
    expect(detectTablet(input({ ua: WINDOWS_UA, screenShortSide: 1080, pointerCoarse: false }))).toBe(false)
  })

  it('touch laptop at short side >= 1024 is excluded (upper gate)', () => {
    expect(detectTablet(input({ ua: WINDOWS_UA, screenShortSide: 1080, pointerCoarse: true, maxTouchPoints: 10 }))).toBe(false)
    expect(detectTablet(input({ ua: WINDOWS_UA, screenShortSide: 1024, pointerCoarse: true }))).toBe(false)
  })

  it('unknown + coarse below the lower gate (559) is not tablet (phone fallback territory)', () => {
    expect(detectTablet(input({ ua: WINDOWS_UA, screenShortSide: 559, pointerCoarse: true }))).toBe(false)
  })

  it('size gates are the documented constants', () => {
    expect(TABLET_SIZE_GATE_MIN).toBe(600)
    expect(TABLET_SIZE_GATE_MAX).toBe(1024)
  })
})

/**
 * R13 (v0.2.1) — mobile.css.ts content regression tests.
 *
 * Pins the CSS contract for the always-visible mobile sidebar entry:
 *   - drawer restructure stays intact (the v0.2.0 layout);
 *   - an active conversation ([data-phase="active"]) places the opener
 *     top-left and yields the session header next to it;
 *   - an open modal ([aria-modal="true"]) hides the entry + backdrop,
 *     matching the Escape yield in MobileOverlay;
 *   - the >= 1024px desktop guard keeps hiding the entry (zero desktop
 *     injection). config.test.ts already pins the fab selector inside the
 *     desktop guard; these assertions add the R13 placement rules.
 */

import { describe, expect, it } from 'vitest'

import { MOBILE_CSS, PICKER_CSS } from '../src/client/mobile/mobile.css.ts'

describe('mobile.css.ts — R13 always-visible sidebar entry', () => {
  it('keeps the drawer restructure (grid 1fr 0 0 + translateX(-110%))', () => {
    expect(MOBILE_CSS).toContain('grid-template-columns: minmax(0, 1fr) 0 0')
    expect(MOBILE_CSS).toContain('transform: translateX(-110%)')
  })

  it('places the opener top-left inside an active conversation', () => {
    expect(MOBILE_CSS).toMatch(/:has\(\[data-phase="active"\]\)[^{]*\[data-dsh-remote-mobile="fab"\]/)
  })

  it('yields the session header next to the active-phase opener', () => {
    expect(MOBILE_CSS).toMatch(
      /:has\(\[data-phase="active"\]\)[^{]*header\s*\{[^}]*padding-left: 52px/,
    )
  })

  it('hides the entry and backdrop while a modal dialog is open', () => {
    expect(MOBILE_CSS).toMatch(/:has\(\[aria-modal="true"\]\)[^{]*\[data-dsh-remote-mobile="fab"\]/)
    expect(MOBILE_CSS).toMatch(/:has\(\[aria-modal="true"\]\)[^{]*\[data-dsh-remote-mobile="backdrop"\]/)
  })

  it('keeps the desktop guard (>= 1024px) hiding the entry', () => {
    expect(MOBILE_CSS).toMatch(/@media \(min-width: 1024px\)/)
    expect(MOBILE_CSS).toMatch(/\[data-dsh-remote-mobile="fab"\]/)
  })
})

describe('mobile.css.ts — R14.2 picker stylesheet (device-gated)', () => {
  it('PICKER_CSS carries its base sheet rules without a phone-only width gate', () => {
    expect(PICKER_CSS).toContain('[data-dsh-remote-workspace-picker]')
    expect(PICKER_CSS).toContain('z-index: 46')
    expect(PICKER_CSS).toContain('max-width: 720px')
    // No viewport gate: an iPad landscape (short side 1024) still applies it.
    expect(PICKER_CSS).not.toContain('@media (min-width: 1024px)')
    expect(PICKER_CSS).not.toContain('@media (max-width: 1023px)')
  })

  it('PICKER_CSS has no desktop guard that would hide an iPad landscape sheet', () => {
    expect(PICKER_CSS).not.toMatch(/min-width: 1024px/)
  })

  it('MOBILE_CSS no longer carries the picker (split into PICKER_CSS)', () => {
    expect(MOBILE_CSS).not.toContain('[data-dsh-remote-workspace-picker]')
  })

  it('MOBILE_CSS desktop guard hides fab + backdrop but NOT the picker', () => {
    expect(MOBILE_CSS).toMatch(/@media \(min-width: 1024px\)/)
    expect(MOBILE_CSS).toContain('[data-dsh-remote-mobile="fab"]')
    expect(MOBILE_CSS).toContain('[data-dsh-remote-mobile="backdrop"]')
    expect(MOBILE_CSS).not.toContain('[data-dsh-remote-workspace-picker]')
  })

  it('PICKER_CSS includes the fade keyframes the sheet animation references', () => {
    expect(PICKER_CSS).toContain('@keyframes dsh-remote-mobile-fade')
    expect(PICKER_CSS).toContain('animation: dsh-remote-mobile-fade')
  })

  it('keeps header, scrollable content, and footer as independent flex regions', () => {
    expect(PICKER_CSS).toMatch(/\[data-wsb="sheet"\][^{]*\{[^}]*height: min\(88dvh[^}]*display: flex[^}]*flex-direction: column/s)
    expect(PICKER_CSS).toMatch(/\[data-wsb="content"\][^{]*\{[^}]*flex: 1 1 0[^}]*min-height: 0[^}]*overflow-y: auto/s)
    expect(PICKER_CSS).toMatch(/\[data-wsb="footer"\][^{]*\{[^}]*flex: 0 0 auto[^}]*background:/s)
  })

  it('keeps breadcrumbs on one independently scrollable line', () => {
    expect(PICKER_CSS).toMatch(/\[data-wsb="crumbs"\][^{]*\{[^}]*flex-wrap: nowrap[^}]*overflow-x: auto/s)
  })

  it('keeps the phone settings-dialog rewrite excluded from explicit navigation dialogs', () => {
    expect(MOBILE_CSS).toContain(':not(:has([role="navigation"]))')
  })

  it('centers tablet sheets inside a 24px viewport-safe frame', () => {
    expect(PICKER_CSS).toMatch(/@media \(min-width: 768px\)[^{]*\{[\s\S]*align-items: center[^}]*padding: 24px/)
    expect(PICKER_CSS).toMatch(/height: min\(82dvh, 900px, calc\(100dvh - 48px\)\)/)
  })
})

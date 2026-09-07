/**
 * R13 (v0.2.1) — MobileOverlay mobile-navigation regression tests.
 *
 * The v0.2.0 bug: the sidebar opener was phase-gated
 * (`document.querySelector('[data-phase="active"]') === null`), so an ACTIVE
 * conversation rendered NO sidebar entry at all — the Workspace/Session
 * navigation became unreachable on phones. The fix removes the phase gate:
 * the opener renders whenever the drawer is closed, in EVERY phase.
 *
 * These tests render the REAL component with react-test-renderer (matching
 * the repo's pairing-section.test.tsx style) against a minimal hand-rolled
 * document / MutationObserver stub. The plugin deliberately ships no jsdom
 * and adding a DOM dependency is out of v0.2.1 scope, so the stub covers
 * exactly the surfaces MobileOverlay touches: findFrame via
 * [data-shell-overlay], attribute mirroring on the frame, and the
 * Escape / drawer-click document listeners.
 */

import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileOverlay, type MobileOverlayProps } from '../src/client/mobile/MobileOverlay.tsx'
import { getPhoneDetection } from '../src/client/mobile/detect-browser.ts'

vi.mock('../src/client/mobile/detect-browser.ts', () => ({
  getPhoneDetection: vi.fn(() => ({ isPhone: true })),
}))

const mockGetPhoneDetection = getPhoneDetection as unknown as ReturnType<typeof vi.fn>

/** Hand-rolled MutationObserver: records the instance and lets tests fire
 * attribute records manually (no jsdom in this repo). */
class FakeMutationObserver {
  static last: FakeMutationObserver | null = null
  callback: (records: unknown[], observer: FakeMutationObserver) => void

  constructor(callback: (records: unknown[], observer: FakeMutationObserver) => void) {
    this.callback = callback
    FakeMutationObserver.last = this
  }

  observe(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return []
  }

  fire(attributeName: string): void {
    this.callback([{ type: 'attributes', attributeName }], this)
  }
}

/** Minimal document: the frame ([data-shell-overlay] parent), the drawer
 * (frame > :first-child), the modal query, and captured listeners. */
function makeFakeDom() {
  const frame = {
    attrs: new Map<string, string>([['data-sidebar-collapsed', '']]),
    setAttribute(k: string, v = '') { frame.attrs.set(k, v) },
    removeAttribute(k: string) { frame.attrs.delete(k) },
    hasAttribute(k: string) { return frame.attrs.has(k) },
    getAttribute(k: string) { return frame.attrs.get(k) ?? null },
  }
  const overlay = { parentElement: frame }
  const drawer = {
    contains: (_target: unknown) => true,
  }
  const listeners: Record<string, Array<(event: unknown) => void>> = {}
  const doc = {
    overlay,
    drawer,
    listeners,
    modalOpen: false,
    activePhasePresent: false,
    querySelector(sel: string): unknown {
      if (sel === '[data-shell-overlay]') return overlay
      if (sel === '[data-dsh-remote-mobile="frame"] > :first-child') return drawer
      if (sel === '[data-phase="active"]') return doc.activePhasePresent ? {} : null
      if (sel === '[aria-modal="true"]') return doc.modalOpen ? {} : null
      return null
    },
    addEventListener(type: string, fn: (event: unknown) => void) {
      ;(listeners[type] ??= []).push(fn)
    },
    removeEventListener(type: string, fn: (event: unknown) => void) {
      const arr = listeners[type]
      if (arr === undefined) return
      const index = arr.indexOf(fn)
      if (index !== -1) arr.splice(index, 1)
    },
    emit(type: string, event: unknown) {
      for (const fn of [...(listeners[type] ?? [])]) fn(event)
    },
  }
  return { frame, doc }
}

let dom: ReturnType<typeof makeFakeDom>

function stubGlobals(): void {
  dom = makeFakeDom()
  FakeMutationObserver.last = null
  vi.stubGlobal('document', dom.doc)
  vi.stubGlobal('MutationObserver', FakeMutationObserver as unknown as typeof MutationObserver)
}

function renderOverlay(phone = true): { renderer: TestRenderer.ReactTestRenderer; toggleSidebar: ReturnType<typeof vi.fn> } {
  mockGetPhoneDetection.mockReturnValue({ isPhone: phone })
  const toggleSidebar = vi.fn()
  const t = (key: string) =>
    key === 'drawerOpen' ? 'Open directory' : key === 'drawerClose' ? 'Close directory' : key
  let renderer!: TestRenderer.ReactTestRenderer
  act(() => {
    renderer = TestRenderer.create(
      createElement(MobileOverlay, { toggleSidebar, t } as unknown as MobileOverlayProps),
    )
  })
  return { renderer, toggleSidebar }
}

function findByMarker(renderer: TestRenderer.ReactTestRenderer, marker: string): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll((node) => node.props?.['data-dsh-remote-mobile'] === marker)
}

/** Open the drawer the way the frame does: drop the collapsed attribute, then
 * let the mirror observer fire. */
function openDrawer(): void {
  act(() => {
    dom.frame.removeAttribute('data-sidebar-collapsed')
    FakeMutationObserver.last?.fire('data-sidebar-collapsed')
  })
}

beforeEach(() => {
  stubGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('MobileOverlay — R13 always-visible sidebar entry', () => {
  it('renders nothing and never marks the frame on non-phone devices', () => {
    const { renderer } = renderOverlay(false)
    expect(findByMarker(renderer, 'fab')).toHaveLength(0)
    expect(findByMarker(renderer, 'backdrop')).toHaveLength(0)
    expect(dom.frame.attrs.has('data-dsh-remote-mobile')).toBe(false)
  })

  it('renders the sidebar opener on hero/blank phases (drawer closed)', () => {
    const { renderer } = renderOverlay()
    expect(findByMarker(renderer, 'fab')).toHaveLength(1)
    expect(findByMarker(renderer, 'backdrop')).toHaveLength(0)
  })

  it('renders the sidebar opener in an ACTIVE conversation (v0.2.0 regression: none rendered)', () => {
    // v0.2.0 hid the only entry while [data-phase="active"] was present.
    // The fix removes the phase gate entirely: the opener must render even
    // with an active-phase element in the document. This is the regression
    // anchor for the "missing sidebar in active conversation" bug.
    dom.doc.activePhasePresent = true
    const { renderer } = renderOverlay()
    expect(findByMarker(renderer, 'fab')).toHaveLength(1)
    expect(findByMarker(renderer, 'backdrop')).toHaveLength(0)
  })

  it('opens the drawer when the opener is tapped', () => {
    const { renderer, toggleSidebar } = renderOverlay()
    const opener = findByMarker(renderer, 'fab')
    act(() => opener[0].props.onClick())
    expect(toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('mirrors the frame collapsed state: open shows the backdrop and hides the opener', () => {
    const { renderer } = renderOverlay()
    expect(findByMarker(renderer, 'backdrop')).toHaveLength(0)
    openDrawer()
    expect(findByMarker(renderer, 'backdrop')).toHaveLength(1)
    expect(findByMarker(renderer, 'fab')).toHaveLength(0)
  })

  it('closes the drawer when the backdrop is tapped', () => {
    const { renderer, toggleSidebar } = renderOverlay()
    openDrawer()
    const backdrop = findByMarker(renderer, 'backdrop')
    act(() => backdrop[0].props.onClick())
    expect(toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('closes the drawer with Escape and yields to an open modal dialog', () => {
    const { toggleSidebar } = renderOverlay()
    openDrawer()
    dom.doc.emit('keydown', { key: 'Escape' })
    expect(toggleSidebar).toHaveBeenCalledTimes(1)
    // A modal owns the screen: Escape must not toggle the drawer.
    dom.doc.modalOpen = true
    dom.doc.emit('keydown', { key: 'Escape' })
    expect(toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('closes the drawer on navigation taps but not on session-row buttons', () => {
    const { toggleSidebar } = renderOverlay()
    openDrawer()
    const navTarget = { closest: (sel: string) => (sel.includes('newSession') ? {} : null) }
    dom.doc.emit('click', { target: navTarget })
    expect(toggleSidebar).toHaveBeenCalledTimes(1)
    const rowButtonTarget = { closest: (sel: string) => (sel.includes('sessionRow') && sel.includes('button') ? {} : null) }
    dom.doc.emit('click', { target: rowButtonTarget })
    expect(toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('cleans up on unmount: frame marker and document listeners are removed', () => {
    const { renderer } = renderOverlay()
    openDrawer()
    expect(dom.frame.attrs.has('data-dsh-remote-mobile')).toBe(true)
    expect((dom.doc.listeners.keydown ?? []).length).toBeGreaterThan(0)
    expect((dom.doc.listeners.click ?? []).length).toBeGreaterThan(0)
    act(() => renderer.unmount())
    expect(dom.frame.attrs.has('data-dsh-remote-mobile')).toBe(false)
    expect(dom.doc.listeners.keydown ?? []).toHaveLength(0)
    expect(dom.doc.listeners.click ?? []).toHaveLength(0)
  })
})

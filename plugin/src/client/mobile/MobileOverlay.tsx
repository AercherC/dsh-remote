/**
 * Mobile shell overlay: owns the `data-dsh-remote-mobile` marker on the
 * AppFrame element (the CSS restructure keys off it), mirrors the frame's
 * collapsed state, and renders the dimmed backdrop plus a single sidebar
 * opener.
 *
 * R13 (v0.2.1): the opener is the ALWAYS-VISIBLE sidebar entry — it renders
 * whenever the drawer is closed, in EVERY phase (hero/blank AND active
 * conversations), so an active conversation always has a Workspace/Session
 * entry point. Placement is pure CSS in mobile.css.ts (`:has([data-phase=
 * "active"])` moves it to the top-left over the session header; hero keeps
 * the floating bottom-right position). This absorbs the upstream
 * dsh-web-mobile v1.5.0 MobileNavToggle design idea (always-available
 * entry + `ctx.layout.toggleSidebar()`) while keeping this plugin's own
 * device-classifier gating.
 *
 * Adapted from the MIT-licensed dsh-web-mobile project
 * (`src/client/MobileNavOverlay.tsx`; upstream v1.5.0 moved the overlay
 * interactions into `effects/phone-chrome.ts`); see the R04 report and
 * NOTICE for attribution.
 */

import { useEffect, useLayoutEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

import { NS, type RemoteAccessKey } from '../locales.js'
import { getPhoneDetection } from './detect-browser.ts'

export interface MobileOverlayProps extends PropsRuntime<'shell.overlay'>, PropsLocale<typeof NS> {
  toggleSidebar: () => void
}

/** The AppFrame element: direct parent of the shell overlay layer. */
function findFrame(): HTMLElement | null {
  return document.querySelector('[data-shell-overlay]')?.parentElement ?? null
}

export function MobileOverlay({ toggleSidebar, t }: MobileOverlayProps) {
  // R06C4C1: the drawer mounts only when the DEVICE classifier says phone.
  // The decision is a synchronous constant for the whole page session (it
  // never depends on viewport width, so a narrowed window or popped-up
  // keyboard can never flip it), so this is a plain read, not state.
  const mobile = getPhoneDetection().isPhone
  const [open, setOpen] = useState(false)

  // Frame ownership + open-state mirror. On wide screens this effect is
  // inert: the marker is never set, so the layout is untouched.
  useLayoutEffect(() => {
    if (!mobile) {
      setOpen(false)
      return
    }
    const frame = findFrame()
    if (frame === null) return
    frame.setAttribute('data-dsh-remote-mobile', 'frame')
    const sync = () => setOpen(!frame.hasAttribute('data-sidebar-collapsed'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(frame, { attributes: true, attributeFilter: ['data-sidebar-collapsed'] })
    return () => {
      observer.disconnect()
      frame.removeAttribute('data-dsh-remote-mobile')
    }
  }, [mobile])

  // R13: no phase gating on the opener — it renders whenever the drawer is
  // closed, in every phase. (v0.2.0 gated it on `[data-phase="active"]` being
  // absent, which left active conversations with NO sidebar entry point;
  // placement/visibility nuances are handled by mobile.css.ts `:has()` rules.)
  // Escape closes the drawer but yields to an open modal dialog.
  useEffect(() => {
    if (!mobile || !open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.querySelector('[aria-modal="true"]') === null) toggleSidebar()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [mobile, open, toggleSidebar])

  // Navigation inside the drawer closes it; a modal dialog owns the screen.
  useEffect(() => {
    if (!mobile || !open) return
    const onDrawerClick = (event: MouseEvent) => {
      if (document.querySelector('[aria-modal="true"]') !== null) return
      const target = event.target as HTMLElement | null
      if (target === null) return
      const drawer = document.querySelector<HTMLElement>('[data-dsh-remote-mobile="frame"] > :first-child')
      if (drawer === null || !drawer.contains(target)) return
      if (target.closest('[class*="sessionRow"] button') !== null) return
      const navigates = target.closest(
        '[class*="newSession"], [class*="sessionRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"]',
      )
      if (navigates !== null) toggleSidebar()
    }
    document.addEventListener('click', onDrawerClick, true)
    return () => document.removeEventListener('click', onDrawerClick, true)
  }, [mobile, open, toggleSidebar])

  if (!mobile) return null
  const openLabel = t('drawerOpen' as RemoteAccessKey)
  const closeLabel = t('drawerClose' as RemoteAccessKey)
  return (
    <>
      {open && (
        <div
          data-dsh-remote-mobile="backdrop"
          role="button"
          aria-label={closeLabel}
          onClick={() => toggleSidebar()}
        />
      )}
      {!open && (
        <button
          type="button"
          data-dsh-remote-mobile="fab"
          aria-label={openLabel}
          title={openLabel}
          onClick={() => toggleSidebar()}
        >
          <svg viewBox="0 0 16 16" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </>
  )
}

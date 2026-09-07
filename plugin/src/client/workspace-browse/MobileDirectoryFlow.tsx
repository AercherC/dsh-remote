/**
 * R14 — mobile workspace directory picker (occupant of the two
 * directory-flow holes, phone only).
 *
 * A remote rendering of the computer's workspace picker:
 *   - opening starts at a virtual computer root (`listDirectory()` with no
 *     path), showing every discovered filesystem root / Windows drive;
 *   - breadcrumbs always start at localized "This computer", followed by
 *     the complete drive/filesystem ancestry;
 *   - the selection result is the current level, handed to the SAME owner
 *     adoption path as the desktop picker (`onPicked(path)` →
 *     `createWorkspace({ path })`);
 *   - listing rows are the same host data (bounded window, hidden flags,
 *     symlink enterability) — only the interaction is a minimal mobile
 *     rendition: browse into a directory, step back via crumbs, select the
 *     current directory. No file upload / delete / modify.
 *
 * Registered ONLY when the device classifier says phone (`isPhone`), so the
 * desktop picker (native or browse) is completely untouched.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'
// Type-only: the owner contract of the directory-flow holes and the locale
// share's `t` seat (both erased at runtime — neither package is a runtime
// dependency).
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

import { NS } from '../locales.js'
import type { DirectoryListingView } from '../../wire.js'
import { WorkspaceBrowseError } from './browse-client.js'

/** Composed props: the owner conversation + the injected browse face + copy. */
export interface MobileDirectoryFlowProps extends DirectoryFlowOwnerProps {
  /** List one directory level (absent path = the Host home directory). */
  listDirectory: (path: string | undefined, signal: AbortSignal) => Promise<DirectoryListingView>
  /** Localized dialog copy (this plugin's namespace). */
  t: PropsLocale<typeof NS>['t']
}

/** Stable id for the sheet title, referenced by `aria-labelledby`. */
const TITLE_ID = 'dsh-remote-workspace-picker-title'

interface PickerCrumb {
  readonly name: string
  readonly path: string | undefined
}

/** Full, clickable ancestry rooted at the virtual computer level. */
function displayCrumbs(listing: DirectoryListingView, computerLabel: string): readonly PickerCrumb[] {
  const computer: PickerCrumb = { name: computerLabel, path: undefined }
  if (listing.kind === 'computer') return [computer]
  return [computer, ...listing.crumbs.map(crumb => ({
    name: /^[A-Za-z]:[\\/]$/.test(crumb.name) ? crumb.name.slice(0, 2) : crumb.name,
    path: crumb.path,
  }))]
}

/** Localized failure copy for a browse error. */
function failureCopy(error: unknown, t: MobileDirectoryFlowProps['t']): string {
  if (error instanceof WorkspaceBrowseError) {
    return error.code === 'directory-unreadable' ? t('pickerUnreadable') : t('pickerInternal')
  }
  return t('pickerInternal')
}

/**
 * Render the mobile workspace-directory picker as a bottom sheet. Renders
 * nothing while closed; every open starts fresh at the Host home directory.
 * @param props - owner conversation plus the injected browse face.
 * @returns the picker element, or null while closed.
 */
export function MobileDirectoryFlow(props: MobileDirectoryFlowProps): ReactElement | null {
  const { open, busy, onPicked, onCancel, listDirectory, t } = props
  const [listing, setListing] = useState<DirectoryListingView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Newer intent wins: abort the in-flight scan when a navigation supersedes
  // it (the Host stops scanning instead of discarding a late result).
  const controllerRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const contentRef = useRef<HTMLDivElement | null>(null)
  // Element that opened the sheet; focus returns to it on close (dialog pattern).
  const restoreFocusRef = useRef<Element | null>(null)

  useEffect(() => () => {
    requestSeq.current += 1
    controllerRef.current?.abort()
  }, [])

  /** Navigate to one level (absent = the computer root); errors surface inline. */
  const navigate = (path: string | undefined): void => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    listDirectory(path, controller.signal).then(
      (next) => {
        if (seq !== requestSeq.current) return
        setListing(next)
        setLoading(false)
      },
      (reason: unknown) => {
        if (seq !== requestSeq.current) return
        setLoading(false)
        setError(failureCopy(reason, t))
      },
    )
  }

  // Every open starts fresh at the computer root; closing invalidates
  // any in-flight response (mirrors the official DirectoryBrowser). Opening
  // also hands focus into the sheet (the portal has committed by effect time)
  // and remembers the trigger for close-time restore.
  useEffect(() => {
    requestSeq.current += 1
    if (open) {
      setListing(null)
      setError(null)
      restoreFocusRef.current = document.activeElement
      navigate(undefined)
      document.querySelector<HTMLElement>('[data-dsh-remote-workspace-picker] [data-wsb="close"]')?.focus()
      return
    }
    controllerRef.current?.abort()
    setLoading(false)
    setError(null)
    const restore = restoreFocusRef.current
    restoreFocusRef.current = null
    if (restore !== null && typeof (restore as HTMLElement).focus === 'function') {
      (restore as HTMLElement).focus()
    }
  }, [open, listDirectory, t])

  // A directory transition is a new browsing page. Never retain the old
  // level's scroll offset (the footer is a separate flex child regardless).
  useEffect(() => {
    if (listing !== null && contentRef.current !== null) contentRef.current.scrollTop = 0
  }, [listing])

  // Escape closes the sheet (unless the owner is busy adopting a pick). It
  // never fights MobileOverlay's Escape: that handler yields while any
  // [aria-modal="true"] is present — and this sheet is exactly that.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onCancel])

  if (!open) return null
  const crumbs = listing === null ? [] : displayCrumbs(listing, t('pickerComputer'))
  const targetPath = listing?.path ?? null
  const backPath = listing?.kind === 'directory'
    ? (listing.crumbs.length > 1 ? listing.crumbs.at(-2)?.path : undefined)
    : null
  return createPortal(
    <div data-dsh-remote-workspace-picker role="dialog" aria-modal="true" aria-labelledby={TITLE_ID}>
      <div data-wsb="sheet">
        <header data-wsb="header">
          <button
            type="button"
            data-wsb="back"
            disabled={backPath === null || busy || loading}
            onClick={() => { if (backPath !== null) navigate(backPath) }}
          >
            ‹ {t('pickerBack')}
          </button>
          <h2 data-wsb="title" id={TITLE_ID}>{t('pickerTitle')}</h2>
          <button type="button" data-wsb="close" aria-label={t('pickerCancel')} disabled={busy} onClick={onCancel}>✕</button>
        </header>
        {listing !== null && (
          <nav data-wsb="crumbs" role="navigation" aria-label={t('pickerTitle')}>
            {crumbs.map((crumb, index) => (
              <span key={crumb.path} data-wsb="crumb-seat">
                {index > 0 && <span data-wsb="crumb-sep">›</span>}
                <button
                  type="button"
                  data-wsb="crumb"
                  disabled={busy || loading}
                  onClick={() => { navigate(crumb.path) }}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
        )}
        <div data-wsb="content" ref={contentRef}>
          {listing === null && loading && <div data-wsb="loading" role="status">{t('pickerLoading')}</div>}
          {listing !== null && (
            <ul data-wsb="list" role="list">
              {listing.entries.filter(entry => !entry.hidden).map(entry => (
                <li key={entry.path} role="listitem">
                  <button
                    type="button"
                    data-wsb="row"
                    disabled={busy || loading}
                    onClick={() => { navigate(entry.path) }}
                  >
                    <span data-wsb="row-icon" aria-hidden="true">{listing.kind === 'computer' ? '💾' : '📁'}</span>
                    <span data-wsb="row-name">{entry.name}</span>
                    <span data-wsb="row-chevron">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {listing !== null && listing.truncated && <div data-wsb="truncated" role="status">{t('pickerTruncated')}</div>}
          {error !== null && (
            <div data-wsb="error" role="alert">
              <span>{error}</span>
              <button type="button" data-wsb="retry" onClick={() => { navigate(listing?.path ?? undefined) }}>{t('pickerRetry')}</button>
            </div>
          )}
        </div>
        <footer data-wsb="footer">
          <button type="button" data-wsb="cancel" disabled={busy} onClick={onCancel}>{t('pickerCancel')}</button>
          <button
            type="button"
            data-wsb="select"
            disabled={targetPath === null || busy || loading}
            onClick={() => { if (targetPath !== null) onPicked(targetPath) }}
          >
            {t('pickerSelectCurrent')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

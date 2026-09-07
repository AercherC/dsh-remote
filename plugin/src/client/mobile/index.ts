/**
 * Phone layer: CSS injection + phone chrome (viewport-fit, theme-color).
 *
 * R06C4C: the CALLERS only install these when the device classifier says
 * phone (`client/index.ts`). On tablets / desktops / narrow desktop windows
 * nothing here is ever installed — the DSH native UI is used as-is.
 *
 * The phone-chrome effect is adapted from the MIT-licensed dsh-web-mobile
 * project (`src/client/effects/phone-chrome.ts`); see the R04 report for
 * attribution. Once installed (a phone), the internal rules stay gated on
 * the < 1024px viewport breakpoint: a phone's viewport is always below it,
 * and the phone chrome (viewport-fit) only applies while narrow.
 */

import { MOBILE_CSS, PICKER_CSS } from './mobile.css.js'

/** Inject the mobile stylesheet; returns the cleanup. */
export function installMobileCss(pluginId: string): () => void {
  const tag = document.createElement('style')
  tag.dataset.plugin = pluginId
  tag.dataset.pluginCss = `${pluginId}/mobile.css`
  tag.textContent = MOBILE_CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}

/**
 * R14.2 — inject the workspace-picker bottom-sheet stylesheet for
 * `isPhone || isTablet` (a tablet gets the browse picker WITHOUT the phone UI
 * layer). Returns the cleanup.
 */
export function installPickerCss(pluginId: string): () => void {
  const tag = document.createElement('style')
  tag.dataset.plugin = pluginId
  tag.dataset.pluginCss = `${pluginId}/picker.css`
  tag.textContent = PICKER_CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}

/**
 * Phone chrome: viewport-fit=cover (so env(safe-area-inset-top) is the real
 * status-bar height), a theme-color meta tracking the shell background, and
 * the legacy-iOS gesturestart fallback for double-tap zoom. Inert at >=
 * 1024px; restores everything on cleanup.
 */
export function installPhoneChrome(): () => void {
  const narrow = window.matchMedia('(max-width: 1023px)')
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  const originalViewport = viewport?.content ?? ''
  const themeMeta = document.createElement('meta')
  themeMeta.name = 'theme-color'
  const bodyBg = (): string => getComputedStyle(document.body).backgroundColor

  const sync = (): void => {
    if (viewport !== null) viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
    themeMeta.content = bodyBg()
    if (themeMeta.parentElement === null) document.head.appendChild(themeMeta)
  }
  const restore = (): void => {
    if (viewport !== null) viewport.content = originalViewport
    themeMeta.remove()
  }
  const onGestureStart = (event: Event) => event.preventDefault()
  if (narrow.matches) sync()
  const onChange = (event: MediaQueryListEvent) => (event.matches ? sync() : restore())
  narrow.addEventListener('change', onChange)
  const observer = new MutationObserver(() => {
    if (narrow.matches) themeMeta.content = bodyBg()
  })
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  document.addEventListener('gesturestart', onGestureStart)
  return () => {
    narrow.removeEventListener('change', onChange)
    observer.disconnect()
    document.removeEventListener('gesturestart', onGestureStart)
    restore()
  }
}

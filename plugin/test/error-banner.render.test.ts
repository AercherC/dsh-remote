/**
 * R06C2 real-render regression: the error alert must render VISIBLE human
 * copy — not just exist as a locale string. The DSH dark theme makes
 * `--dsw-alias-state-error-primary` and `-secondary` the SAME red, so the old
 * "red text on the error background" style produced a visually EMPTY red bar
 * (human repro on port 3199). These tests SSR the actual banner component and
 * assert the DOM text node + the color/background contract.
 *
 * Uses React.createElement (no JSX) so the file matches vitest's
 * default test include pattern (test directory, .test.ts suffix).
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { friendly, RemoteErrorBanner, errorBannerStyle } from '../src/client/RemoteErrorBanner.tsx'
import { REMOTE_ERROR_MESSAGES } from '../src/wire.js'

describe('RemoteErrorBanner (R06C2 real render)', () => {
  it('renders the human download-failed copy as a real DOM text node', () => {
    const html = renderToStaticMarkup(createElement(RemoteErrorBanner, { code: 'download-failed' }))
    expect(html).toContain('已尝试当前可用的网络路径')
    // A real text node exists (not an empty element).
    const text = html.replace(/<[^>]*>/g, '')
    expect(text.trim().length).toBeGreaterThan(0)
    expect(text).not.toContain('download-failed')
  })

  it('renders the English copy as a real DOM text node', () => {
    // friendly() is the zh path; render the en message directly to prove the
    // table row is non-empty and visible.
    const html = renderToStaticMarkup(
      createElement('p', { style: errorBannerStyle }, REMOTE_ERROR_MESSAGES['download-failed'].en),
    )
    expect(html).toContain('The available network paths were tried')
  })

  it('never renders an empty alert for any tunnel error code', () => {
    const codes = [
      'unsupported-platform', 'config-conflict', 'download-failed', 'proxy-invalid', 'proxy-connect-failed',
      'source-too-slow',
      'checksum-mismatch', 'size-mismatch',
      'binary-rejected', 'version-mismatch', 'start-timeout', 'spawn-failed', 'exit-before-ready',
      'connection-lost', 'internal',
    ] as const
    for (const code of codes) {
      const html = renderToStaticMarkup(createElement(RemoteErrorBanner, { code }))
      const text = html.replace(/<[^>]*>/g, '').trim()
      expect(text.length, `banner for ${code} must have visible text`).toBeGreaterThan(0)
    }
  })

  it('R06C2 dark-theme regression: text color and background resolve to DIFFERENT tokens', () => {
    // The DSH dark theme maps both --dsw-alias-state-error-primary and
    // -secondary to --dsw-static-red-400 (rgb(242,90,90)); if the banner put
    // text on the -error-secondary background the result is an empty red bar.
    expect(errorBannerStyle.color).not.toBe(errorBannerStyle.background)
    expect(errorBannerStyle.background).not.toContain('--dsw-alias-state-error-secondary')
    expect(errorBannerStyle.color).toContain('--dsw-alias-state-error-primary')
    // The red affordance comes from the left border, not the text background.
    expect(errorBannerStyle.borderLeft).toContain('--dsw-alias-state-error-primary')
  })

  it('friendly() never returns an empty string', () => {
    expect(friendly('download-failed')).toBe(REMOTE_ERROR_MESSAGES['download-failed'].zh)
    expect(friendly('proxy-invalid')).toBe(REMOTE_ERROR_MESSAGES['proxy-invalid'].zh)
    expect(friendly('proxy-connect-failed')).toBe(REMOTE_ERROR_MESSAGES['proxy-connect-failed'].zh)
    expect(friendly('internal')).toBe(REMOTE_ERROR_MESSAGES['internal'].zh)
    expect(friendly(undefined)).toBe(REMOTE_ERROR_MESSAGES['internal'].zh)
    expect(friendly('unknown-code' as never)).toBe(REMOTE_ERROR_MESSAGES['internal'].zh)
  })
})

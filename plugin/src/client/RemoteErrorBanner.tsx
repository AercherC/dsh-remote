/**
 * The error alert banner for the 远程控制 section (R06C2).
 *
 * Kept in its own module so it can be SSR-rendered in a real render test
 * without pulling the whole settings section (Button/qrcode) into the test.
 *
 * R06C2 root cause (human repro on 3199): the previous style used
 * `color: var(--dsw-alias-state-error-primary)` on
 * `background: var(--dsw-alias-state-error-secondary)`. In the official DSH
 * DARK theme BOTH tokens resolve to the same red (`--dsw-static-red-400`,
 * rgb(242,90,90) — see ui-theme design-platform.css), so the alert rendered
 * as a visually EMPTY red bar even though the text node existed in the DOM.
 *
 * Fix: text always sits on the neutral layer background
 * (`--dsw-alias-bg-layer-2`) with a red left border for the error affordance.
 * `color` and `background` can never resolve to the same color, so the human
 * copy is always visible.
 */

import type { ReactElement } from 'react'

import { REMOTE_ERROR_MESSAGES, type RemoteErrorCode } from '../wire.js'

/** Friendly copy for an error code (never empty: unknown/undefined → internal). */
export function friendly(errorCode: RemoteErrorCode | undefined): string {
  if (errorCode === undefined) return REMOTE_ERROR_MESSAGES['internal'].zh
  return REMOTE_ERROR_MESSAGES[errorCode]?.zh ?? REMOTE_ERROR_MESSAGES['internal'].zh
}

export const errorBannerStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  margin: 0,
  color: 'var(--dsw-alias-state-error-primary, #dc2626)',
  background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))',
  borderLeft: '3px solid var(--dsw-alias-state-error-primary, #dc2626)',
  borderRadius: 8,
  padding: '8px 12px',
}

/** Renders the human-readable copy for a stable error code. Never blank. */
export function RemoteErrorBanner({ code }: { code: RemoteErrorCode }): ReactElement {
  return <p style={errorBannerStyle}>{friendly(code)}</p>
}

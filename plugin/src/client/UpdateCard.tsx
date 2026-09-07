/**
 * 插件更新 card (R05).
 *
 * - automatic checks are throttled HOST-side (24h default); the card only
 *   calls `updateCheck(false)` on mount and `updateCheck(true)` on the
 *   manual button — it never polls the internet itself;
 * - an available update is shown with plain-text release notes and the
 *   [稍后] [立即更新] choice; background silent install is never performed;
 * - 立即更新 runs the official `dsh plugin --profile <profile> update`
 *   through the host; the host verifies the installed version and only then
 *   reports 更新已安装，需要重启 DSH 后生效. A failure keeps the current
 *   version running;
 * - notes are rendered with React text interpolation (pre-wrap) — never
 *   dangerouslySetInnerHTML, so remote release text cannot XSS.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'

import type { RemoteAccessKey } from './locales.js'
import type { RemoteClient } from './rpc-client.js'
import type { RemoteStatusView, UpdateStatusView } from '../wire.js'

export interface UpdateCardProps {
  readonly api: RemoteClient
  readonly t: (key: RemoteAccessKey) => string
  readonly status: RemoteStatusView
}

const s = {
  card: {
    background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))',
    borderRadius: 12,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  row: { display: 'flex', alignItems: 'center' as const, gap: 10, flexWrap: 'wrap' as const },
  actionsRight: { display: 'flex', alignItems: 'center' as const, justifyContent: 'flex-end' as const, gap: 10 },
  title: { fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--dsw-alias-label-primary, inherit)' },
  hint: { fontSize: 12, lineHeight: 1.5, margin: 0, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
  notes: {
    fontSize: 12,
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
    background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))',
    borderRadius: 8,
    padding: '8px 12px',
    maxHeight: 160,
    overflowY: 'auto' as const,
  },
  error: {
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    // Same R06C2 fix as RemoteAccessSection: never put error text on the
    // --dsw-alias-state-error-* background — in the DSH dark theme primary and
    // secondary are the same red, which renders an EMPTY red bar. Text sits on
    // the neutral layer with a red left border for the error affordance.
    color: 'var(--dsw-alias-state-error-primary, #dc2626)',
    background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))',
    borderLeft: '3px solid var(--dsw-alias-state-error-primary, #dc2626)',
    borderRadius: 8,
    padding: '8px 12px',
  },
  success: {
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    color: 'var(--dsw-alias-state-success-primary, #16a34a)',
    background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))',
    borderLeft: '3px solid var(--dsw-alias-state-success-primary, #16a34a)',
    borderRadius: 8,
    padding: '8px 12px',
  },
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function UpdateCard({ api, t, status }: UpdateCardProps) {
  const [update, setUpdate] = useState<UpdateStatusView | null>(null)
  const [busy, setBusy] = useState(false)
  const [postponed, setPostponed] = useState(false)

  const check = useCallback(async (force: boolean): Promise<void> => {
    setBusy(true)
    setPostponed(false)
    try {
      setUpdate(await api.updateCheck(force))
    } catch {
      setUpdate(null)
    }
    setBusy(false)
  }, [api])

  // Mount: automatic (throttled) check — the host decides whether to hit the
  // network; the card never polls.
  useEffect(() => {
    void check(false)
  }, [check])

  const apply = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      setUpdate(await api.updateApply())
    } catch {
      setUpdate(null)
    }
    setBusy(false)
  }, [api])

  const currentVersion = status.pluginVersion ?? update?.currentVersion ?? ''
  const phase = update?.phase ?? 'idle'
  const latest = update?.latestVersion

  let body: React.ReactNode
  if (phase === 'checking' || phase === 'idle') {
    body = <p style={s.hint}>{t('checkingUpdate')}</p>
  } else if (phase === 'unavailable') {
    // Both npm and GitHub are unreachable (or npm returned nothing useful and
    // GitHub has no stable v<semver> release): a neutral, non-alarming hint —
    // never a bare error or an empty alert. The message is actionable: try
    // again later.
    body = (
      <>
        <p style={s.hint}>{busy ? t('checkingUpdate') : t('updateUnavailable')}</p>
        <div style={s.actionsRight}>
          <Button variant="primary" size="md" onClick={() => { void check(true) }} disabled={busy}>
            {t('checkUpdate')}
          </Button>
        </div>
      </>
    )
  } else if (phase === 'up-to-date') {
    // R07: in-flight manual check replaces the status line with "正在检查更新…"
    // (the button grays alone is not enough feedback); the row is split — version
    // status on the left, last-checked timestamp pushed to the far right.
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <p style={s.hint}>{busy ? t('checkingUpdate') : `${t('upToDate')} · v${currentVersion}`}</p>
          {!busy && update?.lastCheckedAt !== undefined && (
            <p style={s.hint}>{t('lastCheckAt')} {formatTime(update.lastCheckedAt)}</p>
          )}
        </div>
        <div style={s.actionsRight}>
          <Button variant="primary" size="md" onClick={() => { void check(true) }} disabled={busy}>
            {t('checkUpdate')}
          </Button>
        </div>
      </>
    )
  } else if (phase === 'available') {
    body = postponed ? (
      <>
        <p style={s.hint}>{t('updatePostponed')} v{latest}</p>
        {update?.notes !== undefined && update.notes !== '' ? (
          <div style={s.notes}>{update.notes}</div>
        ) : (
          update?.notesUnavailable === true && <p style={s.hint}>{t('updateNotesUnavailable')}</p>
        )}
        <div style={s.actionsRight}>
          <Button variant="primary" size="md" onClick={() => { void check(true) }} disabled={busy}>
            {t('checkUpdate')}
          </Button>
        </div>
      </>
    ) : (
      <>
        <p style={s.hint}>{t('updateAvailable')} v{latest}</p>
        {update?.notes !== undefined && update.notes !== '' ? (
          <div style={s.notes}>{update.notes}</div>
        ) : (
          update?.notesUnavailable === true && <p style={s.hint}>{t('updateNotesUnavailable')}</p>
        )}
        <div style={s.actionsRight}>
          <Button variant="outline" size="md" onClick={() => { setPostponed(true) }} disabled={busy}>
            {t('later')}
          </Button>
          <Button variant="primary" size="md" onClick={() => { void apply() }} disabled={busy}>
            {t('updateNow')}
          </Button>
        </div>
      </>
    )
  } else if (phase === 'applying') {
    body = <p style={s.hint}>{t('updating')}</p>
  } else if (phase === 'installed-restart-required') {
    body = <p style={s.success}>{t('updateInstalled')} (v{latest})</p>
  } else {
    // failed
    body = (
      <>
        {busy ? <p style={s.hint}>{t('checkingUpdate')}</p> : <p style={s.error}>{t('updateFailed')}</p>}
        <div style={s.actionsRight}>
          <Button variant="primary" size="md" onClick={() => { void check(true) }} disabled={busy}>
            {t('checkUpdate')}
          </Button>
        </div>
      </>
    )
  }

  return (
    <div style={s.card} data-dsh-remote-update>
      <div style={s.row}>
        <h3 style={s.title}>{t('updateTitle')}</h3>
        {currentVersion !== '' && <span style={s.hint}>{t('currentVersion')} v{currentVersion}</span>}
      </div>
      {body}
    </div>
  )
}

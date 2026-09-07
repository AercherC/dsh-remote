/**
 * 远程控制 settings section.
 *
 * The section is a state machine over the loopback management RPC:
 *   - polls `dsh-remote.status` + `dsh-remote.pairingStatus` every 3s
 *     (both READ-ONLY — silent on transient failure)
 *   - the HOST is the pairing-ticket state authority (R06C4B): the tunnel's
 *     first-enable flow mints exactly one initial ticket, and the ONLY other
 *     creation path is the user's explicit "生成新的配对码" button; a settings
 *     remount / tab switch / browser reload / status poll can never create a
 *     ticket (the old auto-rotate-on-mount effect was the R06C4B root cause)
 *   - renders one of four host-authoritative states:
 *       active    → QR (`https://<origin>/pair#<secret>`) + manual 8-char
 *                   code + server-authoritative countdown (expiresAt − now)
 *       consumed  → "设备已成功配对" + [生成新的配对码] (no QR/code/countdown)
 *       expired   → "配对码已过期" + [生成新的配对码] (no stale credentials)
 *       none      → neutral hint + [生成新的配对码] (defensive; first enable
 *                   normally auto-creates)
 *   - every user action maps failures to friendly copy via REMOTE_ERROR_MESSAGES
 *   - technical detail (the stable error code / binary source) is available
 *     only behind a collapsed <details> — never the raw exception text
 *
 * Look & feel: official DSH design tokens (--dsw-alias-*) and the official
 * Button primitive (md 36px capsule), the same pattern the shipped settings
 * sections use.
 *
 * The pairing secret never leaves this page: it arrives over the loopback
 * RPC, lives only in React state, is never written to localStorage or any
 * log, and only appears inside the QR fragment (never the query string).
 * Consumed/expired views receive NO secret from the host at all.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
// Browser-safe qrcode entry: the main entry (lib/index.js → server.js) pulls
// every renderer including png/utf8/terminal, which `require("fs")` and drag
// Node-only modules into the client bundle (DSH's client module loader rejects
// them — "missed the module table"). `lib/browser.js` only includes the pure
// core + canvas/svg renderers, which is all `toDataURL` needs.
import QRCode from 'qrcode/lib/browser.js'

import { describeUserAgent } from '../ua.js'
import { isPairingLongCodeShape, pairingQrContent, type DownloadSettingsView, type PairingLongStatusView, type PairingStatusView, type RemoteStatusView } from '../wire.js'
import { NS, type RemoteAccessKey } from './locales.js'
import { RemoteErrorBanner, friendly } from './RemoteErrorBanner.tsx'
import type { RemoteClient } from './rpc-client.js'
import { UpdateCard } from './UpdateCard.tsx'

export interface RemoteAccessSectionProps
  extends PropsRuntime<'settings.section'>,
    PropsLocale<typeof NS> {
  api: RemoteClient
}

const POLL_MS = 3_000
const TICK_MS = 1_000

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatLastSeen(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatElapsed(startedAt: number | undefined, now: number): string {
  if (startedAt === undefined) return ''
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${String(minutes)}分${String(seconds % 60).padStart(2, '0')}秒` : `${String(seconds)}秒`
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`
}

function formatSpeed(bytesPerSecond: number | undefined): string {
  if (bytesPerSecond === undefined || bytesPerSecond <= 0) return ''
  const mbps = bytesPerSecond / (1024 * 1024)
  return mbps >= 1 ? `${mbps.toFixed(1)} MB/s` : `${Math.max(0.1, Math.round(mbps * 10) / 10)} MB/s`
}

/**
 * Human status line while the tunnel is starting (phase-specific copy; the
 * "正在准备安全连接" umbrella is only a fallback). Download progress shows real
 * received bytes — never a fabricated percentage when the total is unknown —
 * plus the CURRENT network route (proxy label) and SOURCE (官方源 / 备用镜像)
 * so a mirror is never silently presented as the official source.
 */
function startingStatusLine(
  status: RemoteStatusView,
  t: (key: RemoteAccessKey) => string,
  now: number,
): string {
  const elapsed = status.startedAt !== undefined ? ` · ${t('waiting')} ${formatElapsed(status.startedAt, now)}` : ''
  if (status.phase === 'downloading') {
    // R06C4A: the AUTO slow-source gate is abandoning the official source for
    // a verified mirror — show the transition copy, never stale bytes.
    if (status.downloadSourceChanging === true) {
      return `${t('sourceSwitching')}${elapsed}`
    }
    const speed = formatSpeed(status.downloadSpeedBytesPerSecond)
    const base = status.downloadReceivedBytes !== undefined
      ? `${t('downloading')}：${t('downloadedSoFar')} ${formatBytes(status.downloadReceivedBytes)}`
      : t('downloading')
    const total = status.downloadPercent !== undefined && status.downloadTotalBytes !== undefined
      ? ` ${t('of')} ${formatBytes(status.downloadTotalBytes)} · ${String(status.downloadPercent)}%`
      : ''
    const route = [
      status.downloadProxySource !== undefined ? proxyRouteLabel(status.downloadProxySource, t) : '',
      status.downloadSource === 'official' ? t('sourceOfficialLabel')
        : status.downloadSource === 'mirror' ? t('sourceMirrorLabel') : '',
    ].filter(part => part !== '').join(' · ')
    return `${base}${total}${speed !== '' ? ` · ${speed}` : ''}${route !== '' ? ` · ${route}` : ''}${elapsed}`
  }
  if (status.phase === 'verifying') return `${t('verifying')}${elapsed}`
  if (status.phase === 'starting') return `${t('startingConn')}${elapsed}`
  // R06C4D: the hostname is known but the Cloudflare Edge has not yet
  // confirmed the connector route — show the connecting copy, NEVER a
  // scannable QR / pairing code / "已开启" (they only appear at real ready).
  if (status.phase === 'connecting') return `${t('connectingTunnel')}${elapsed}`
  if (status.phase === 'resolving') return `${t('waitingAddr')}${elapsed}`
  return `${t('preparing')}${elapsed}`
}

function proxyRouteLabel(source: 'custom' | 'environment' | 'system' | 'direct', t: (key: RemoteAccessKey) => string): string {
  switch (source) {
    case 'custom': return t('viaCustomProxy')
    case 'environment': return t('viaEnvProxy')
    case 'system': return t('viaSystemProxy')
    case 'direct': return t('viaDirect')
  }
}

/** Official token-styled cards/typography (same pattern as shipped sections). */
const s = {
  root: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  card: {
    background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))',
    borderRadius: 12,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  row: { display: 'flex', alignItems: 'center' as const, gap: 10 },
  actionsRight: { display: 'flex', alignItems: 'center' as const, justifyContent: 'flex-end' as const, gap: 10 },
  title: { fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--dsw-alias-label-primary, inherit)' },
  hint: { fontSize: 12, lineHeight: 1.5, margin: 0, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
  muted: { fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary, #8b93a1)' },
  code: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: 6,
    textAlign: 'center' as const,
    fontVariantNumeric: 'tabular-nums',
    padding: '8px 12px',
    borderRadius: 8,
    color: 'var(--dsw-alias-label-primary, inherit)',
    background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))',
  },
  qrBox: {
    alignSelf: 'center',
    padding: 10,
    border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))',
    borderRadius: 10,
    background: '#ffffff',
  },
  url: { fontSize: 12, wordBreak: 'break-all' as const, margin: 0, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
  device: {
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'space-between',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))',
  },
  warn: {
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    color: 'var(--dsw-alias-state-warn-primary, #b45309)',
    background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))',
    borderLeft: '3px solid var(--dsw-alias-state-warn-primary, #b45309)',
    borderRadius: 8,
    padding: '8px 12px',
  },
  error: {
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    // Text color and background MUST never resolve to the same color: in the
    // official DSH dark theme both --dsw-alias-state-error-primary and
    // -secondary are the same red (rgb(242,90,90)), so an error styled with
    // "red text on red background" renders as an EMPTY red bar. Keep the text
    // on the neutral layer background and mark errors with a red left border
    // instead (R06C2 human repro: code=download-failed rendered but the alert
    // was visually blank).
    color: 'var(--dsw-alias-state-error-primary, #dc2626)',
    background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))',
    borderLeft: '3px solid var(--dsw-alias-state-error-primary, #dc2626)',
    borderRadius: 8,
    padding: '8px 12px',
  },
  statusDot: { width: 8, height: 8, borderRadius: '50%', background: 'currentColor', flex: 'none' },
  details: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #8b93a1)' },
  fieldLabel: { fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--dsw-alias-label-secondary, #6b7280)' },
  radioRow: { display: 'flex', alignItems: 'center' as const, gap: 6, fontSize: 13, color: 'var(--dsw-alias-label-primary, inherit)' },
  input: {
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))',
    background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    color: 'var(--dsw-alias-label-primary, inherit)',
  },
}

/**
 * R06C4 advanced card: download network (auto/direct/custom) + download source
 * (auto/official/mirror) + custom proxy URL. Defaults need NO configuration —
 * the card is for advanced users; a change persists host-side and applies to
 * the next download. Custom proxy URLs containing credentials are rejected
 * with user copy (never persisted — no secret-at-rest).
 */
function DownloadSettingsCard({ api, t }: { api: RemoteClient; t: (key: RemoteAccessKey) => string }) {
  const [settings, setSettings] = useState<DownloadSettingsView | null>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    void api.networkConfigGet().then((value) => {
      if (!alive) return
      setSettings(value)
      setCustomUrl(value.customProxyUrl ?? '')
    })
    return () => { alive = false }
  }, [api])

  const save = useCallback(async (): Promise<void> => {
    if (settings === null) return
    const trimmed = customUrl.trim()
    if (settings.network === 'custom' && trimmed === '') {
      setMessage(t('customProxyRequired'))
      return
    }
    if (trimmed !== '') {
      let parsed: URL
      try {
        parsed = new URL(trimmed)
      } catch {
        setMessage(t('customProxyInvalid'))
        return
      }
      if (parsed.username !== '' || parsed.password !== '') {
        setMessage(t('customProxyCredentials'))
        return
      }
    }
    setSaving(true)
    setMessage(null)
    try {
      const result = await api.networkConfigSet({
        network: settings.network,
        source: settings.source,
        ...(trimmed === '' ? {} : { customProxyUrl: trimmed }),
      })
      if (result.ok) {
        setSaved(true)
        setTimeout(() => { setSaved(false) }, 1500)
      } else {
        setMessage(friendly(result.errorCode))
      }
    } catch {
      setMessage(friendly('internal'))
    } finally {
      setSaving(false)
    }
  }, [api, settings, customUrl, t])

  if (settings === null) return null

  const networkOption = (value: 'auto' | 'direct' | 'custom', label: string) => (
    <label style={s.radioRow}>
      <input
        type="radio"
        name="dsh-remote-download-network"
        checked={settings.network === value}
        onChange={() => { setSettings({ ...settings, network: value }); setMessage(null) }}
      />
      {label}
    </label>
  )
  const sourceOption = (value: 'auto' | 'official' | 'mirror', label: string) => (
    <label style={s.radioRow}>
      <input
        type="radio"
        name="dsh-remote-download-source"
        checked={settings.source === value}
        onChange={() => { setSettings({ ...settings, source: value }); setMessage(null) }}
      />
      {label}
    </label>
  )

  return (
    <div style={s.card}>
      <h3 style={s.title}>{t('downloadSettings')}</h3>
      <p style={s.fieldLabel}>{t('downloadNetwork')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {networkOption('auto', t('networkAuto'))}
        {networkOption('direct', t('networkDirect'))}
        {networkOption('custom', t('networkCustom'))}
      </div>
      {settings.network === 'custom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={s.fieldLabel} htmlFor="dsh-remote-custom-proxy">{t('customProxyUrl')}</label>
          <input
            id="dsh-remote-custom-proxy"
            style={s.input}
            value={customUrl}
            placeholder={t('customProxyPlaceholder')}
            onChange={(event) => { setCustomUrl(event.target.value); setMessage(null) }}
          />
        </div>
      )}
      <p style={s.fieldLabel}>{t('downloadSource')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sourceOption('auto', t('sourceAuto'))}
        {sourceOption('official', t('sourceOfficial'))}
        {sourceOption('mirror', t('sourceMirror'))}
      </div>
      <p style={s.hint}>{t('sourceNote')}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        {saving && <span style={s.hint}>{t('settingsSaving')}</span>}
        {saved && <span style={{ ...s.hint, color: 'var(--dsw-alias-state-success-primary, #16a34a)' }}>{t('settingsSaved')}</span>}
        <Button variant="primary" size="md" onClick={() => { void save() }} disabled={saving}>
          {t('saveSettings')}
        </Button>
      </div>
      {message !== null && message !== '' && <p style={s.error}>{message}</p>}
    </div>
  )
}

/** The 远程控制 settings page. */
export function RemoteAccessSection({ api, t }: RemoteAccessSectionProps) {
  const [status, setStatus] = useState<RemoteStatusView | null>(null)
  const [pairing, setPairing] = useState<PairingStatusView | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  // D2: durable long-term pairing code + the local "one-time / long-term" tab
  // choice (UI-only state; the host stays the credential authority).
  const [longPairing, setLongPairing] = useState<PairingLongStatusView | null>(null)
  const [longTab, setLongTab] = useState<'one-time' | 'long'>('one-time')
  const [qrLongData, setQrLongData] = useState<string | null>(null)
  // D2.1 custom-code panel (UI-only state; host validates authoritatively).
  const [customOpen, setCustomOpen] = useState(false)
  const [customCode, setCustomCode] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)

  // Re-render the QR only when the underlying credential/origin actually
  // changes (a new ticket or a new public URL) — never on a 3s status poll.
  const qrContentRef = useRef<string | null>(null)
  const qrLongContentRef = useRef<string | null>(null)
  // D2.2: single-flight guard so entering the long tab auto-mints at most one
  // code while the mutation is in flight (never on later polls/remounts).
  const longMintingRef = useRef(false)

  const refresh = useCallback(async (): Promise<RemoteStatusView | null> => {
    const [next, pairingView, longView] = await Promise.all([api.status(), api.pairingStatus(), api.pairingLongStatus()])
    setStatus(next)
    setPairing(pairingView)
    setLongPairing(longView)
    setActionError(null)
    return next
  }, [api])

  // Poll status + pairing states; the countdown ticks locally. This is a
  // READ-ONLY path (R06C4B): neither RPC can create a ticket, so a settings
  // remount / tab switch / browser reload can never mint a new pairing code.
  useEffect(() => {
    let alive = true
    const tick = async (): Promise<void> => {
      const [next, pairingView, longView] = await Promise.all([api.status(), api.pairingStatus(), api.pairingLongStatus()])
      if (!alive) return
      setStatus(next)
      setPairing(pairingView)
      setLongPairing(longView)
    }
    void tick()
    const poll = setInterval(() => { void tick() }, POLL_MS)
    const clock = setInterval(() => { setNow(Date.now()) }, TICK_MS)
    return () => {
      alive = false
      clearInterval(poll)
      clearInterval(clock)
    }
  }, [api])

  // QR generation whenever the ACTIVE ticket or the origin changes.
  useEffect(() => {
    const content = pairing !== null && pairing.state === 'active' && status !== null && status.publicUrl !== undefined
      ? pairingQrContent(status.publicUrl, pairing.secret)
      : null
    if (content === qrContentRef.current) return
    qrContentRef.current = content
    if (content === null) {
      setQrData(null)
      return
    }
    void QRCode.toDataURL(content, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrData)
      .catch(() => { setQrData(null) })
  }, [pairing, status])

  // D2: QR for the durable long-term code (only when the host can reveal the
  // plaintext — i.e. it was generated in THIS process).
  useEffect(() => {
    const content = longPairing !== null && longPairing.state === 'active' && status !== null && status.publicUrl !== undefined
      ? pairingQrContent(status.publicUrl, longPairing.secret)
      : null
    if (content === qrLongContentRef.current) return
    qrLongContentRef.current = content
    if (content === null) {
      setQrLongData(null)
      return
    }
    void QRCode.toDataURL(content, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrLongData)
      .catch(() => { setQrLongData(null) })
  }, [longPairing, status])

  const enable = useCallback(async (): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try {
      const result = await api.tunnelStart()
      const next = await refresh()
      if (result.ok) return
      // Suppress the failure copy when the user cancelled during startup (the
      // tunnel ended idle — stop won) or when the error card renders its own
      // banner (phase 'error' carries lastErrorCode). R06C4D stop-before-ready.
      if (next !== null && next.phase !== 'error' && !(next.phase === 'idle' && !next.enabled)) {
        setActionError(friendly(result.errorCode))
      }
    } catch {
      // A transport-level RPC rejection must still surface as a readable
      // message and release the button — never a silent hang.
      setActionError(friendly('internal'))
    } finally {
      setBusy(false)
    }
  }, [api, refresh])

  const disable = useCallback(async (): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try {
      await api.tunnelStop()
      // The host invalidates every ticket on stop; reflect that immediately
      // instead of waiting for the next poll.
      setPairing({ state: 'none' })
      await refresh()
    } catch {
      setActionError(friendly('internal'))
    } finally {
      setBusy(false)
    }
  }, [api, refresh])

  // Explicit user mutation ONLY (allowed creation action B): a fresh one-time
  // ticket. Never called from an effect — the R06C4B remount regression.
  const regenerate = useCallback(async (): Promise<void> => {
    setActionError(null)
    try {
      const result = await api.pairingRotate()
      if (typeof result === 'string') {
        setActionError(friendly(result))
        return
      }
      // The host is the authority: re-read the fresh state after the mutation.
      setPairing(await api.pairingStatus())
    } catch {
      setActionError(friendly('internal'))
    }
  }, [api])

  const copyUrl = useCallback(async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 1500)
    } catch {
      /* clipboard unavailable — the URL is still visible */
    }
  }, [])

  // D2 explicit user mutation ONLY: mint a fresh durable long-term code (the
  // previous one dies atomically host-side). `customCode` (optional) is a
  // user-typed 6–12 char code, validated client-side first, host-side again.
  // Never called from an effect.
  const rotateLong = useCallback(async (customCode?: string): Promise<void> => {
    setActionError(null)
    try {
      const result = await api.pairingLongRotate(customCode)
      if (typeof result === 'string') {
        setActionError(friendly(result))
        return
      }
      // Display EXACTLY the credential this RPC just minted (D2.1: applying a
      // custom code must immediately replace the code under the QR — no
      // dependence on a later status poll that could race).
      setLongPairing({
        state: 'active',
        createdAt: result.createdAt,
        code: result.code,
        secret: result.secret,
      })
    } catch {
      setActionError(friendly('internal'))
    }
  }, [api])

  const toggleCustom = useCallback((): void => {
    setCustomOpen(open => !open)
    setCustomError(null)
  }, [])

  const applyCustom = useCallback(async (): Promise<void> => {
    const value = customCode.trim()
    if (!isPairingLongCodeShape(value)) {
      setCustomError(t('longCustomInvalid'))
      return
    }
    setCustomError(null)
    await rotateLong(value.toUpperCase())
    setCustomOpen(false)
    setCustomCode('')
  }, [customCode, rotateLong, t])

  const copyLongCode = useCallback(async (code: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 1500)
    } catch {
      /* clipboard unavailable — the code is still visible */
    }
  }, [])

  // D2.2: entering the long-code tab with NO code yet auto-mints one (parity
  // with the one-time ticket at ready) so a fresh random code + QR is directly
  // visible. Only for state 'none' while remote control is enabled; a legacy
  // 'persisted' code is shown untouched, never auto-rotated behind the user.
  const openLongTab = useCallback((): void => {
    setLongTab('long')
    if (longPairing === null || longPairing.state !== 'none') return
    if (longMintingRef.current) return
    longMintingRef.current = true
    void rotateLong().finally(() => { longMintingRef.current = false })
  }, [longPairing, rotateLong])

  // Covers the first render race (the user clicks the tab before the first
  // poll fills longPairing) and remounts that land directly on the long tab.
  useEffect(() => {
    if (longTab !== 'long') return
    if (status === null || !status.enabled || status.publicUrl === undefined) return
    if (longPairing === null || longPairing.state !== 'none') return
    if (longMintingRef.current) return
    longMintingRef.current = true
    void rotateLong().finally(() => { longMintingRef.current = false })
  }, [longTab, status, longPairing, rotateLong])

  const revoke = useCallback(async (deviceId: string): Promise<void> => {
    setBusy(true)
    const result = await api.deviceRevoke(deviceId)
    setBusy(false)
    if (result.ok && result.revoked) await refresh()
    else setActionError(t('revokeFailed'))
  }, [api, refresh, t])

  const revokeAll = useCallback(async (): Promise<void> => {
    if (!window.confirm(t('revokeAllConfirm'))) return
    setBusy(true)
    const result = await api.deviceRevokeAll()
    setBusy(false)
    if (result.ok) await refresh()
    else setActionError(t('revokeFailed'))
  }, [api, refresh, t])

  // A remote (non-loopback) page must not manage the gateway.
  if (!api.isLoopback) {
    return (
      <div data-dsh-remote-section>
        <p style={s.error}>{t('remoteOnly')}</p>
      </div>
    )
  }

  if (status === null) {
    return (
      <div data-dsh-remote-section style={s.root}>
        <p style={s.hint}>{t('preparing')}</p>
      </div>
    )
  }

  const startupFailed = status.errorCode === 'startup-failed' || !status.available
  const tunnelError = status.errorCode !== undefined && !startupFailed
  const starting = status.phase === 'resolving' || status.phase === 'verifying'
    || status.phase === 'downloading' || status.phase === 'starting' || status.phase === 'connecting'

  // R06C4B host-authoritative pairing card: exactly one of four states. The
  // countdown is computed from the host's expiresAt (never a client-reset
  // TTL); consumed/expired/none never render a QR, a code or a countdown.
  const generateButton = (
    <div style={s.actionsRight}>
      <Button variant="primary" size="md" onClick={() => { void regenerate() }} disabled={busy} data-generate-new>
        {t('generateNew')}
      </Button>
    </div>
  )
  const renderPairingCard = (): React.ReactNode => {
    if (pairing === null) return <p style={s.hint}>{t('preparing')}</p>
    switch (pairing.state) {
      case 'active': {
        if (pairing.expiresAt <= now) return expiredCard()
        return (
          <>
            {qrData !== null && (
              <div style={s.qrBox} data-pairing-qr>
                <img src={qrData} alt="pairing QR" width={220} height={220} />
              </div>
            )}
            <p style={{ ...s.hint, textAlign: 'center' }}>{t('scanHint')}</p>
            <p style={{ ...s.hint, textAlign: 'center' }}>{t('orManual')}</p>
            <div style={s.code} data-pairing-code>{pairing.code.slice(0, 4)} {pairing.code.slice(4)}</div>
            <p style={{ ...s.hint, textAlign: 'center' }} data-pairing-countdown>
              {t('expiresIn')} {formatRemaining(pairing.expiresAt - now)}
            </p>
          </>
        )
      }
      case 'consumed':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-pairing-state="consumed">
            <div style={{ ...s.row, color: 'var(--dsw-alias-state-success-primary, #16a34a)' }}>
              <span style={s.statusDot} />
              <p style={{ ...s.title, margin: 0 }}>{t('pairedSuccess')}</p>
            </div>
            <p style={s.hint}>{t('credentialUsed')}</p>
            {generateButton}
          </div>
        )
      case 'expired':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-pairing-state="expired">
            <p style={{ ...s.title, color: 'var(--dsw-alias-state-warn-primary, #b45309)' }}>{t('expired')}</p>
            <p style={s.hint}>{t('expiredNote')}</p>
            {generateButton}
          </div>
        )
      case 'none':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-pairing-state="none">
            <p style={s.hint}>{t('noTicket')}</p>
            {generateButton}
          </div>
        )
    }
  }
  // A ticket that expired between polls still renders the expired card.
  function expiredCard(): React.ReactNode {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-pairing-state="expired">
        <p style={{ ...s.title, color: 'var(--dsw-alias-state-warn-primary, #b45309)' }}>{t('expired')}</p>
        <p style={s.hint}>{t('expiredNote')}</p>
        {generateButton}
      </div>
    )
  }

  // D2 segmented tab (UI-only state; the host stays the credential authority).
  const tabPill = (active: boolean): React.CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: 999,
    cursor: 'pointer',
    border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))',
    background: active ? 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.06))' : 'transparent',
    color: 'var(--dsw-alias-label-primary, inherit)',
  })

  // D2 durable long-term pairing code: none → generate/custom; active (v2
  // plaintext available) → code/QR + copy + rotate + custom; persisted (legacy
  // v1 digest file) → rotate/custom upgrades to v2. rotateLong is the only
  // creation path and is never invoked from an effect.
  const renderLongCard = (): React.ReactNode => {
    if (longPairing === null) return <p style={s.hint}>{t('preparing')}</p>

    // D2.1 custom-code panel (shared by all three states; client pre-validates,
    // the host re-validates authoritatively).
    const customPanel = customOpen ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-long-custom-panel>
        <label style={s.fieldLabel} htmlFor="dsh-remote-long-custom">{t('longCustomTitle')}</label>
        <input
          id="dsh-remote-long-custom"
          style={s.input}
          value={customCode}
          maxLength={12}
          autoComplete="off"
          placeholder={t('longCustomPlaceholder')}
          onChange={(event) => { setCustomCode(event.target.value); setCustomError(null) }}
          data-long-custom-input
        />
        <p style={s.hint}>{t('longCustomHint')}</p>
        {customError !== null && <p style={s.error} data-long-custom-error>{customError}</p>}
        <div style={s.actionsRight}>
          <Button variant="primary" size="md" onClick={() => { void applyCustom() }} disabled={busy} data-long-custom-apply>
            {t('longCustomUse')}
          </Button>
          <Button variant="outline" size="md" onClick={toggleCustom}>
            {t('pickerCancel')}
          </Button>
        </div>
      </div>
    ) : null

    switch (longPairing.state) {
      case 'none':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-pairing-long-state="none">
            <p style={s.hint}>{t('longNoneHint')}</p>
            <div style={s.actionsRight}>
              <Button variant="primary" size="md" onClick={() => { void rotateLong() }} disabled={busy} data-long-generate>
                {t('generateLong')}
              </Button>
              <Button variant="outline" size="md" onClick={toggleCustom} data-long-custom-toggle>
                {t('longCustomTitle')}
              </Button>
            </div>
            {customPanel}
          </div>
        )
      case 'active': {
        const code = longPairing.code
        const grouped = code.replace(/(.{3})/g, '$1 ').trim()
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-pairing-long-state="active">
            <div style={{ ...s.row, justifyContent: 'center', gap: 8 }}>
              <span style={{ ...s.title, margin: 0, color: 'var(--dsw-alias-state-success-primary, #16a34a)' }} data-long-badge>
                {t('longTermBadge')}
              </span>
              <p style={{ ...s.hint, margin: 0 }}>{t('longActiveHint')}</p>
            </div>
            {qrLongData !== null && (
              <div style={s.qrBox} data-pairing-long-qr>
                <img src={qrLongData} alt="long-term pairing QR" width={220} height={220} />
              </div>
            )}
            <p style={{ ...s.hint, textAlign: 'center' }}>{t('scanHint')}</p>
            <p style={{ ...s.hint, textAlign: 'center' }}>{t('orManual')}</p>
            <div style={s.code} data-pairing-long-code>{grouped}</div>
            <div style={s.actionsRight}>
              <Button variant="outline" size="md" onClick={() => { void copyLongCode(code) }} data-long-copy>
                {copied ? t('copied') : t('copyCode')}
              </Button>
              <Button variant="outline" size="md" onClick={() => { void rotateLong() }} disabled={busy} data-long-rotate>
                {t('longRotate')}
              </Button>
              <Button variant="outline" size="md" onClick={toggleCustom} data-long-custom-toggle>
                {t('longCustomTitle')}
              </Button>
            </div>
            <p style={s.hint} data-long-rotate-note>{t('longRotateNote')}</p>
            {customPanel}
            <p style={s.warn} data-long-warning>{t('longWarning')}</p>
          </div>
        )
      }
      case 'persisted':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-pairing-long-state="persisted">
            <p style={s.hint}>{t('longHiddenHint')}</p>
            <div style={s.actionsRight}>
              <Button variant="outline" size="md" onClick={() => { void rotateLong() }} disabled={busy} data-long-rotate>
                {t('longRotate')}
              </Button>
              <Button variant="outline" size="md" onClick={toggleCustom} data-long-custom-toggle>
                {t('longCustomTitle')}
              </Button>
            </div>
            {customPanel}
          </div>
        )
    }
  }

  let main: React.ReactNode
  if (startupFailed) {
    main = (
      <div style={s.card}>
        <div style={{ ...s.row, color: 'var(--dsw-alias-state-error-primary, #dc2626)' }}>
          <span style={s.statusDot} />
          <h2 style={s.title}>{t('offTitle')}</h2>
        </div>
        <RemoteErrorBanner code={status.errorCode ?? 'startup-failed'} />
      </div>
    )
  } else if (status.enabled && status.publicUrl !== undefined) {
    main = (
      <>
        <div style={s.card}>
          <div style={{ ...s.row, color: 'var(--dsw-alias-state-success-primary, #16a34a)' }}>
            <span style={s.statusDot} />
            <h2 style={s.title}>{t('onTitle')} · {t('statusOn')}</h2>
          </div>

          {/* E1-A: the process is alive and cloudflared is reconnecting to the
              same URL — the address and every paired session stay valid, so we
              tell the user to wait instead of showing "已断开". */}
          {status.edgeState === 'degraded' && (
            <p style={s.warn} data-edge-degraded>{t('linkDegraded')}</p>
          )}

          <div style={s.row}>
            <p style={{ ...s.url, flex: 1 }}>{t('publicUrl')}: {status.publicUrl}</p>
            <Button variant="outline" size="md" onClick={() => { void copyUrl(status.publicUrl!) }}>
              {copied ? t('copied') : t('copyUrl')}
            </Button>
          </div>

          <div style={s.actionsRight}>
            <Button variant="outline" size="md" onClick={() => { void disable() }} disabled={busy}>
              {t('disable')}
            </Button>
          </div>
        </div>

        {/* D2 手机连接: one-time pairing / durable long-term code tabs. */}
        <div style={s.card} data-pairing-tabs>
          <h3 style={s.title}>{t('connectPhoneTitle')}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" data-pairing-tab="one-time" style={tabPill(longTab === 'one-time')} onClick={() => { setLongTab('one-time') }}>
              {t('pairingTabOneTime')}
            </button>
            <button type="button" data-pairing-tab="long" style={tabPill(longTab === 'long')} onClick={() => { openLongTab() }}>
              {t('pairingTabLong')}
            </button>
          </div>
          {longTab === 'one-time'
            ? (
                <>
                  {renderPairingCard()}
                  {pairing !== null && pairing.state === 'active' && pairing.expiresAt > now && (
                    <p style={s.warn}>{t('credentialWarning')}</p>
                  )}
                </>
              )
            : renderLongCard()}
        </div>

        {status.devices.length > 0 && (
          <div style={s.card}>
            <h3 style={s.title}>{t('devices')}（{status.devices.length}）</h3>
            {status.devices.map(device => {
              const described = describeUserAgent(device.ua ?? '')
              return (
                <div key={device.id} style={s.device}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-primary, inherit)' }}>{described.label}</div>
                    <div style={s.muted}>
                      {described.os ?? t('unknownDevice')}
                      {device.lastSeen !== undefined ? ` · ${formatLastSeen(device.lastSeen)}` : ''}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { void revoke(device.id) }} disabled={busy}>
                    {t('revoke')}
                  </Button>
                </div>
              )
            })}
            <div>
              <Button variant="outline" size="md" onClick={() => { void revokeAll() }} disabled={busy}>
                {t('revokeAll')}
              </Button>
            </div>
          </div>
        )}
      </>
    )
  } else if (tunnelError) {
    main = (
      <div style={s.card}>
        <div style={{ ...s.row, color: 'var(--dsw-alias-state-error-primary, #dc2626)' }}>
          <span style={s.statusDot} />
          <h2 style={s.title}>{t('offTitle')}</h2>
        </div>
        <RemoteErrorBanner code={status.errorCode} />
        <details style={s.details}>
          <summary>{t('diagnostics')}</summary>
          <p style={s.muted}>
            code: {status.errorCode}
            {status.binarySource !== undefined ? ` · binary: ${status.binarySource}` : ''}
          </p>
          {status.edgeEvents !== undefined && status.edgeEvents.length > 0 && (
            <p style={s.muted} data-edge-events>
              {status.edgeEvents.map(event => {
                const duration = event.degradedMs !== undefined ? `(${Math.round(event.degradedMs / 1000)}s)` : ''
                return `${event.kind}@${formatLastSeen(event.at)}${duration}`
              }).join(' → ')}
            </p>
          )}
        </details>
        <div style={s.actionsRight}>
          <Button variant="primary" size="md" onClick={() => { void enable() }} disabled={busy}>
            {t('enable')}
          </Button>
        </div>
      </div>
    )
  } else {
    main = (
      <div style={s.card}>
        <div style={s.row}>
          <span style={{ ...s.statusDot, color: 'var(--dsw-alias-label-tertiary, #8b93a1)' }} />
          <h2 style={s.title}>{t('offTitle')} · {t('statusOff')}</h2>
        </div>
        <p style={s.hint}>{t('offHint')}</p>
        {starting ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={s.hint}>{startingStatusLine(status, t, now)}</p>
            {/* R06C4D: while the Edge is confirming the connector route the
                user may cancel; the abort must leave no late-ready, no
                ticket, no orphan (see quick-tunnel stop-during-connecting). */}
            {status.phase === 'connecting' && (
              <div style={s.actionsRight}>
                <Button variant="outline" size="md" onClick={() => { void disable() }} data-connecting-cancel>
                  {t('stop')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div style={s.actionsRight}>
            <Button variant="primary" size="md" onClick={() => { void enable() }} disabled={busy}>
              {t('enable')}
            </Button>
          </div>
        )}
        {actionError !== null && actionError !== '' && <p style={s.error}>{actionError}</p>}
      </div>
    )
  }

  return (
    <div data-dsh-remote-section style={s.root}>
      {main}
      <UpdateCard api={api} t={t} status={status} />
      <DownloadSettingsCard api={api} t={t} />
    </div>
  )
}

/**
 * RemoteAccessSection pairing-lifecycle regression tests (R06C4B).
 *
 * The HUMAN bug this round: every settings remount (tab away/back, section
 * remount, browser reload) minted a brand-new pairing ticket, because the
 * section's mount effect called the CREATION RPC (`pairingRotate`) whenever
 * its local `ticket` state was null while the tunnel was ready.
 *
 * The fix moves ticket creation behind the HOST (first-enable flow + the
 * explicit "生成新的配对码" button) and makes the section read-only:
 * `status` + `pairingStatus` polls can never create a ticket.
 *
 * These tests render the REAL component (with Button/qrcode/sibling-cards
 * mocked) and drive it through mount → unmount → remount cycles, asserting:
 *   - the same ticket id/code/expiresAt survive remounts (no new ticket)
 *   - `pairingRotate` is NEVER called from a mount/effect path
 *   - the countdown is computed from the host's expiresAt (remount never
 *     resets the TTL)
 *   - consumed / expired / none states render the right UI and never show a
 *     stale QR/code/countdown
 *   - only the explicit generate click calls the mutation RPC
 */
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RemoteAccessSection } from '../src/client/RemoteAccessSection.tsx'
import type { RemoteClient } from '../src/client/rpc-client.js'
import type { PairingLongStatusView, PairingStatusView, RemoteStatusView } from '../src/wire.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: {
    children?: unknown
    onClick?: () => void
    disabled?: boolean
    variant?: string
    size?: string
    [key: string]: unknown
  }) => {
    const { children, onClick, disabled, variant, size, ...rest } = props
    return (
      // eslint-disable-next-line react/jsx-no-undef
      <button type="button" onClick={onClick} disabled={disabled} data-variant={variant} data-size={size} {...rest}>
        {children as React.ReactNode}
      </button>
    )
  },
}))

vi.mock('qrcode/lib/browser.js', () => ({
  default: {
    toDataURL: async () => 'data:image/png;base64,QR',
  },
}))

vi.mock('../src/client/UpdateCard.tsx', () => ({ UpdateCard: () => null }))

const BASE = 1_700_000_000_000
const TTL_MS = 120_000

/** `t` returns the locale key itself so tests assert WHICH copy is rendered. */
const keyOf = (key: string): string => key

interface FakeApi {
  readonly api: RemoteClient
  readonly calls: { status: number; pairingStatus: number; rotate: number; stop: number; longRotate: number }
  setStatus(view: RemoteStatusView): void
  setPairing(view: PairingStatusView): void
  setLongPairing(view: PairingLongStatusView): void
}

function makeApi(): FakeApi {
  const calls = { status: 0, pairingStatus: 0, rotate: 0, stop: 0, longRotate: 0 }
  let statusView: RemoteStatusView = {
    available: true,
    enabled: true,
    phase: 'ready',
    publicUrl: 'https://abc.trycloudflare.com',
    devices: [],
  }
  let pairingView: PairingStatusView = {
    state: 'active',
    id: 'ticket-A',
    secret: 'SECRET_A_32_BYTES_BASE64URL_VALUE',
    code: 'ABCD2345',
    expiresAt: BASE + TTL_MS,
  }
  let longView: PairingLongStatusView = { state: 'none' }
  const api: RemoteClient = {
    isLoopback: true,
    async status() { calls.status += 1; return statusView },
    async pairingStatus() { calls.pairingStatus += 1; return pairingView },
    async tunnelStart() { return { ok: true, url: 'https://abc.trycloudflare.com' } },
    async tunnelStop() { calls.stop += 1; return { ok: true } },
    async pairingRotate() {
      calls.rotate += 1
      pairingView = {
        state: 'active',
        id: `ticket-${calls.rotate}`,
        secret: `SECRET_${calls.rotate}`,
        code: `CODE${calls.rotate}`,
        expiresAt: BASE + TTL_MS,
      }
      return { secret: pairingView.secret, code: pairingView.code, expiresAt: pairingView.expiresAt }
    },
    async pairingLongStatus() { return longView },
    async pairingLongRotate(customCode?: string) {
      calls.longRotate += 1
      const code = customCode === undefined
        ? `LONGCODE${calls.longRotate}`
        : customCode.trim().toUpperCase()
      const long = {
        state: 'active' as const,
        createdAt: BASE + calls.longRotate,
        secret: `LONG_SECRET_${calls.longRotate}`,
        code,
      }
      longView = long
      return { secret: long.secret, code: long.code, createdAt: long.createdAt }
    },
    async deviceRevoke() { return { ok: true, revoked: true } },
    async deviceRevokeAll() { return { ok: true } },
    async updateCheck() { return { currentVersion: '0.2.0-rc.1', phase: 'up-to-date' } },
    async updateApply() { return { currentVersion: '0.2.0-rc.1', phase: 'failed', error: 'update-failed' } },
    async networkConfigGet() { return { network: 'auto', source: 'auto' } },
    async networkConfigSet() { return { ok: true } },
  }
  return {
    api,
    calls,
    setStatus: (view) => { statusView = view },
    setPairing: (view) => { pairingView = view },
    setLongPairing: (view) => { longView = view },
  }
}

/** Flush pending microtasks inside act so async poll/QR state settles. */
async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

async function mountSection(api: RemoteClient): Promise<TestRenderer.ReactTestRenderer> {
  const props = { api, t: keyOf } as unknown as Parameters<typeof RemoteAccessSection>[0]
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<RemoteAccessSection {...props} />)
  })
  await flush()
  return renderer
}

function allText(renderer: TestRenderer.ReactTestRenderer): string {
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node === 'string' || typeof node === 'number') {
      out.push(String(node))
      return
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    if (node !== null && typeof node === 'object') {
      const children = (node as { children?: unknown }).children
      if (children !== undefined) walk(children)
    }
  }
  walk(renderer.toJSON())
  // JSX text runs interleave ' ' children with join separators; normalize so
  // copy assertions match the user-visible sentence.
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/** The host <button> carrying data-generate-new (the mocked primitive forwards it). */
function generateButton(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
  const found = renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-generate-new'] === true,
  )
  if (found.length === 0) throw new Error('generate button not found')
  return found[0]!
}

function hostNodes(renderer: TestRenderer.ReactTestRenderer, prop: string): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll((node) => typeof node.type === 'string' && node.props[prop] === true)
}

function stateNodes(renderer: TestRenderer.ReactTestRenderer, state: string): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props['data-pairing-state'] === state,
  )
}

function longStateNodes(renderer: TestRenderer.ReactTestRenderer, state: string): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props['data-pairing-long-state'] === state,
  )
}

describe('RemoteAccessSection pairing lifecycle (R06C4B)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(BASE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('regression: settings remount / tab away-back NEVER creates a new ticket (human bug)', async () => {
    const { api, calls } = makeApi()
    let renderer = await mountSection(api)

    const codeText = (): string => hostNodes(renderer, 'data-pairing-code')[0]?.children.join('') ?? ''
    const firstCode = codeText()
    expect(firstCode).toMatch(/^[A-Z0-9]{4} [A-Z0-9]{4}$/)
    expect(calls.rotate).toBe(0)

    // Mount → unmount → remount several times (the exact human repro: close
    // settings, switch to 通用设置, come back, browser re-render).
    for (let i = 0; i < 3; i += 1) {
      await act(async () => { renderer.unmount() })
      renderer = await mountSection(api)
      expect(calls.rotate, `remount ${i + 1} must not mint a ticket`).toBe(0)
      expect(codeText()).toBe(firstCode)
    }
    // Reads happened (status + pairingStatus), but no creation RPC.
    expect(calls.status).toBeGreaterThan(0)
    expect(calls.pairingStatus).toBeGreaterThan(0)
  })

  it('active: renders QR + manual code + countdown from the host expiresAt', async () => {
    const { api } = makeApi()
    const renderer = await mountSection(api)
    expect(hostNodes(renderer, 'data-pairing-qr')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-countdown')).toHaveLength(1)
    const img = renderer.root.findAll((node) => typeof node.type === 'string' && node.type === 'img')
    expect(img).toHaveLength(1)
    expect(img[0]!.props.src).toBe('data:image/png;base64,QR')
    expect(allText(renderer)).toContain('expiresIn 02:00')
  })

  it('countdown is server-authoritative: remount never resets the TTL', async () => {
    const { api } = makeApi()
    let renderer = await mountSection(api)
    const countdown = (): string => hostNodes(renderer, 'data-pairing-countdown')[0]?.children.join('') ?? ''
    expect(countdown()).toBe('expiresIn 02:00')

    // 30s of wall time: the local clock ticks down from expiresAt.
    await act(async () => { vi.advanceTimersByTime(30_000) })
    expect(countdown()).toBe('expiresIn 01:30')

    // Remount: still 01:30 — never reset to a fresh 02:00.
    await act(async () => { renderer.unmount() })
    renderer = await mountSection(api)
    expect(countdown()).toBe('expiresIn 01:30')
  })

  it('consumed: success copy + generate button, NO QR/code/countdown; remount stays consumed', async () => {
    const { api, setPairing, calls } = makeApi()
    setPairing({ state: 'consumed', id: 'ticket-A', consumedAt: BASE + 1_000 })
    let renderer = await mountSection(api)

    expect(stateNodes(renderer, 'consumed')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(0)
    expect(hostNodes(renderer, 'data-pairing-qr')).toHaveLength(0)
    expect(hostNodes(renderer, 'data-pairing-countdown')).toHaveLength(0)
    expect(generateButton(renderer)).toBeDefined()
    const text = allText(renderer)
    expect(text).toContain('pairedSuccess')
    expect(text).toContain('credentialUsed')
    expect(text).toContain('generateNew')

    // Remount (settings away/back): still consumed, still no ticket created.
    await act(async () => { renderer.unmount() })
    renderer = await mountSection(api)
    expect(stateNodes(renderer, 'consumed')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(0)
    expect(generateButton(renderer)).toBeDefined()
    expect(calls.rotate).toBe(0)
  })

  it('expired: expired copy + generate button, NO credentials; remount stays expired', async () => {
    const { api, setPairing, calls } = makeApi()
    setPairing({ state: 'expired', id: 'ticket-A', expiresAt: BASE - 1 })
    let renderer = await mountSection(api)

    expect(stateNodes(renderer, 'expired')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(0)
    expect(hostNodes(renderer, 'data-pairing-qr')).toHaveLength(0)
    expect(generateButton(renderer)).toBeDefined()
    const text = allText(renderer)
    expect(text).toContain('expired')
    expect(text).toContain('expiredNote')
    expect(text).toContain('generateNew')

    await act(async () => { renderer.unmount() })
    renderer = await mountSection(api)
    expect(stateNodes(renderer, 'expired')).toHaveLength(1)
    expect(calls.rotate).toBe(0)
  })

  it('active ticket expiring between polls renders the expired card locally (no stale QR)', async () => {
    const { api } = makeApi() // expiresAt = BASE + 120s
    const renderer = await mountSection(api)
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(121_000) })
    expect(stateNodes(renderer, 'expired')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(0)
    expect(generateButton(renderer)).toBeDefined()
  })

  it('none: neutral hint + generate button (defensive); never auto-creates', async () => {
    const { api, setPairing, calls } = makeApi()
    setPairing({ state: 'none' })
    const renderer = await mountSection(api)
    expect(stateNodes(renderer, 'none')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(0)
    expect(generateButton(renderer)).toBeDefined()
    expect(calls.rotate).toBe(0)
  })

  it('generate new pairing code: ONLY the explicit click calls the mutation RPC', async () => {
    const { api, setPairing, calls } = makeApi()
    setPairing({ state: 'consumed', id: 'ticket-A', consumedAt: BASE + 1_000 })
    const renderer = await mountSection(api)
    expect(calls.rotate).toBe(0)

    await act(async () => {
      generateButton(renderer).props.onClick()
    })
    await flush()

    expect(calls.rotate).toBe(1)
    expect(stateNodes(renderer, 'consumed')).toHaveLength(0)
    // Fresh active ticket is now displayed (new code, countdown restarted by
    // the host's new expiresAt — the client just renders it).
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-countdown')).toHaveLength(1)
  })

  it('status polling (3s) never changes the displayed ticket', async () => {
    const { api, calls } = makeApi()
    const renderer = await mountSection(api)
    const before = hostNodes(renderer, 'data-pairing-code')[0]!.children.join('')
    await act(async () => { vi.advanceTimersByTime(9_000) })
    await flush()
    expect(calls.rotate).toBe(0)
    expect(hostNodes(renderer, 'data-pairing-code')[0]!.children.join('')).toBe(before)
    // Polls happened but the ticket identity never changed.
    expect(calls.pairingStatus).toBeGreaterThan(1)
  })

  it('R06C4D: connecting (hostname acquired, edge not ready) shows connecting copy + cancel, NEVER a QR', async () => {
    const { api, setStatus, setPairing } = makeApi()
    setStatus({ available: true, enabled: false, phase: 'connecting', publicUrl: 'https://abc.trycloudflare.com', devices: [] })
    setPairing({ state: 'none' })
    const renderer = await mountSection(api)
    expect(allText(renderer)).toContain('connectingTunnel')
    // The scannable surfaces must not exist until real ready:
    expect(hostNodes(renderer, 'data-pairing-qr')).toHaveLength(0)
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(0)
    expect(hostNodes(renderer, 'data-pairing-countdown')).toHaveLength(0)
    // The user may cancel while the Edge confirms the connector route.
    expect(hostNodes(renderer, 'data-connecting-cancel')).toHaveLength(1)
  })

  it('R06C4D: cancel during connecting calls tunnelStop (abort; no late ready surface)', async () => {
    const { api, setStatus, setPairing, calls } = makeApi()
    setStatus({ available: true, enabled: false, phase: 'connecting', publicUrl: 'https://abc.trycloudflare.com', devices: [] })
    setPairing({ state: 'none' })
    const renderer = await mountSection(api)
    const cancel = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-connecting-cancel'] === true,
    )[0]!
    await act(async () => { cancel.props.onClick() })
    await flush()
    expect(calls.stop).toBe(1)
  })

  it('R06C4D: the QR appears only at the ready transition, for the first time', async () => {
    const { api, setStatus, setPairing } = makeApi()
    setStatus({ available: true, enabled: false, phase: 'connecting', publicUrl: 'https://abc.trycloudflare.com', devices: [] })
    setPairing({ state: 'none' })
    const renderer = await mountSection(api)
    expect(hostNodes(renderer, 'data-pairing-qr')).toHaveLength(0)
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(0)

    // The host confirms the connector route: phase ready + initial ticket.
    setStatus({ available: true, enabled: true, phase: 'ready', publicUrl: 'https://abc.trycloudflare.com', devices: [] })
    setPairing({ state: 'active', id: 'ticket-A', secret: 'S', code: 'ABCD2345', expiresAt: BASE + TTL_MS })
    await act(async () => { vi.advanceTimersByTime(3_100) }) // next poll
    await flush()
    expect(hostNodes(renderer, 'data-pairing-qr')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(1)
    expect(allText(renderer)).toContain('statusOn')
  })

  it('E1-A: ready + degraded renders the auto-recovering hint and keeps the enabled card', async () => {
    const { api, setStatus } = makeApi()
    setStatus({
      available: true, enabled: true, phase: 'ready',
      publicUrl: 'https://abc.trycloudflare.com',
      edgeState: 'degraded',
      edgeDegradedSinceMs: BASE,
      devices: [],
    })
    const renderer = await mountSection(api)
    expect(hostNodes(renderer, 'data-edge-degraded')).toHaveLength(1)
    expect(allText(renderer)).toContain('linkDegraded')
    // Still the "已开启" card: a transient loss must never look like an error.
    expect(allText(renderer)).toContain('statusOn')
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(1)
  })

  it('E1-A: a healthy ready tunnel renders no degraded hint', async () => {
    const { api } = makeApi() // default status has no edgeState
    const renderer = await mountSection(api)
    expect(hostNodes(renderer, 'data-edge-degraded')).toHaveLength(0)
  })

  it('E1-A: the error card diagnostics list the recent edge-link events', async () => {
    const { api, setStatus } = makeApi()
    setStatus({
      available: true, enabled: false, phase: 'error',
      errorCode: 'connection-lost',
      edgeEvents: [
        { kind: 'degraded', at: BASE - 60_000 },
        { kind: 'regained', at: BASE - 30_000, degradedMs: 30_000 },
        { kind: 'degraded', at: BASE - 5_000 },
      ],
      devices: [],
    })
    const renderer = await mountSection(api)
    expect(hostNodes(renderer, 'data-edge-events')).toHaveLength(1)
    expect(allText(renderer)).toContain('degraded@')
    expect(allText(renderer)).toContain('regained@')
  })

  it('D2: 手机连接 renders the one-time/long-term tab switcher with one-time content by default', async () => {
    const { api } = makeApi()
    const renderer = await mountSection(api)
    expect(hostNodes(renderer, 'data-pairing-tabs')).toHaveLength(1)
    const tabs = renderer.root.findAll(
      (node) => typeof node.type === 'string' && typeof node.props['data-pairing-tab'] === 'string',
    )
    expect(tabs).toHaveLength(2)
    // Default tab = one-time: the existing pairing surface is present…
    expect(hostNodes(renderer, 'data-pairing-code')).toHaveLength(1)
    // …and the long-term surface is not rendered until the user switches.
    expect(longStateNodes(renderer, 'none')).toHaveLength(0)
  })

  it('D2.2: entering the long tab with NO code auto-mints one random code + QR (no extra click); rotate stays explicit', async () => {
    const { api, calls } = makeApi()
    const renderer = await mountSection(api)
    const longTab = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-pairing-tab'] === 'long',
    )[0]!
    expect(calls.longRotate).toBe(0)

    // Switching to the long tab auto-mints exactly ONE code…
    await act(async () => { longTab.props.onClick() })
    await flush()
    await flush()
    expect(calls.longRotate).toBe(1)
    expect(longStateNodes(renderer, 'active')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-long-code')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-long-qr')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-long-rotate')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-long-warning')).toHaveLength(1)
    expect(allText(renderer)).toContain('longTermBadge')

    // Remount + re-enter while active: never mints again.
    await act(async () => { renderer.unmount() })
    const second = await mountSection(api)
    const tabAgain = second.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-pairing-tab'] === 'long',
    )[0]!
    await act(async () => { tabAgain.props.onClick() })
    await flush()
    await flush()
    expect(calls.longRotate).toBe(1)

    // 换一组 from the active card is still an explicit one-click mutation.
    const rotate = second.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-long-rotate'] === true,
    )[0]!
    await act(async () => { rotate.props.onClick() })
    await flush()
    await flush()
    expect(calls.longRotate).toBe(2)
  })

  it('D2: persisted (restart) state hides the code, offers rotate, and remount never auto-creates', async () => {
    const { api, calls, setLongPairing } = makeApi()
    setLongPairing({ state: 'persisted', createdAt: BASE })
    let renderer = await mountSection(api)
    const openLongTab = (r: TestRenderer.ReactTestRenderer): void => {
      const tab = r.root.findAll(
        (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-pairing-tab'] === 'long',
      )[0]!
      // onClick is wrapped by act at the caller.
      tab.props.onClick()
    }
    await act(async () => { openLongTab(renderer) })
    await flush()
    expect(longStateNodes(renderer, 'persisted')).toHaveLength(1)
    expect(allText(renderer)).toContain('longHiddenHint')
    expect(hostNodes(renderer, 'data-pairing-long-code')).toHaveLength(0)

    // Remount keeps the persisted state and never creates anything.
    await act(async () => { renderer.unmount() })
    renderer = await mountSection(api)
    await act(async () => { openLongTab(renderer) })
    await flush()
    expect(longStateNodes(renderer, 'persisted')).toHaveLength(1)
    expect(allText(renderer)).toContain('longHiddenHint')
    expect(calls.longRotate).toBe(0)

    // The explicit 换一组 button is the only mutation path.
    const rotate = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-long-rotate'] === true,
    )[0]!
    await act(async () => { rotate.props.onClick() })
    await flush()
    expect(calls.longRotate).toBe(1)
  })

  it('D2.1: after a restart the persisted v2 long code is displayed again (no hidden state)', async () => {
    const { api, setLongPairing } = makeApi()
    setLongPairing({ state: 'active', createdAt: BASE, secret: 'RESTART_SECRET_32BYTES_VALUE', code: 'AB3XY9ZC' })
    const renderer = await mountSection(api)
    const longTab = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-pairing-tab'] === 'long',
    )[0]!
    await act(async () => { longTab.props.onClick() })
    await flush()
    expect(longStateNodes(renderer, 'active')).toHaveLength(1)
    expect(hostNodes(renderer, 'data-pairing-long-code')).toHaveLength(1)
    expect(allText(renderer)).toContain('AB3 XY9 ZC')
    expect(allText(renderer)).not.toContain('longHiddenHint')
  })

  it('D2.1: custom-code panel rejects malformed input locally and applies a valid custom code via the RPC', async () => {
    // Start from a legacy persisted code so opening the tab does NOT auto-mint
    // (auto-mint only applies to state 'none'); the custom panel is available
    // here too and applying a code upgrades to v2 'active'.
    const { api, calls, setLongPairing } = makeApi()
    setLongPairing({ state: 'persisted', createdAt: BASE })
    const renderer = await mountSection(api)
    const longTab = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-pairing-tab'] === 'long',
    )[0]!
    await act(async () => { longTab.props.onClick() })
    await flush()
    expect(longStateNodes(renderer, 'persisted')).toHaveLength(1)

    const toggle = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-long-custom-toggle'] === true,
    )[0]!
    await act(async () => { toggle.props.onClick() })
    await flush()
    expect(hostNodes(renderer, 'data-long-custom-panel')).toHaveLength(1)

    const input = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.props['data-long-custom-input'] === true,
    )[0]!
    const apply = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.type === 'button' && node.props['data-long-custom-apply'] === true,
    )[0]!

    // Malformed: rejected client-side, no RPC.
    await act(async () => { input.props.onChange({ target: { value: 'AB1' } }) })
    await act(async () => { apply.props.onClick() })
    await flush()
    expect(allText(renderer)).toContain('longCustomInvalid')
    expect(calls.longRotate).toBe(0)

    // Valid mixed-case code → uppercased and sent; state becomes active.
    await act(async () => { input.props.onChange({ target: { value: 'ab3xy9' } }) })
    await act(async () => { apply.props.onClick() })
    await flush()
    expect(calls.longRotate).toBe(1)
    expect(longStateNodes(renderer, 'active')).toHaveLength(1)
    expect(allText(renderer)).toContain('AB3 XY9')
  })
})

/**
 * RPC endpoint dispatch: every endpoint, error encoding, payload validation.
 */

import { describe, expect, it } from 'vitest'
import { dispatch } from '../src/rpc.js'
import type { RemoteRuntime } from '../src/runtime.js'

function runtimeStub(overrides: Partial<RemoteRuntime> = {}): RemoteRuntime {
  return {
    status: () => ({ available: true, enabled: false, phase: 'idle', devices: [] }),
    tunnelStart: async () => ({ ok: false, errorCode: 'tunnel-not-ready' }),
    tunnelStop: async () => ({ ok: true }),
    pairingStatus: () => ({ state: 'none' }),
    pairingRotate: () => 'tunnel-not-ready',
    deviceList: () => [],
    deviceRevoke: async () => ({ ok: false, errorCode: 'bad-request' }),
    deviceRevokeAll: async () => ({ ok: true }),
    updateCheck: async () => ({ currentVersion: '0.1.0', phase: 'up-to-date' }),
    updateApply: async () => ({ currentVersion: '0.1.0', phase: 'failed', error: 'update-failed' }),
    dispose: async () => {},
    ...overrides,
  }
}

describe('dispatch', () => {
  it('returns the status view for status', async () => {
    const result = await dispatch(runtimeStub(), 'status', {})
    expect(result).toEqual({ ok: true, value: { available: true, enabled: false, phase: 'idle', devices: [] } })
  })

  it('maps tunnelStart failures to the stable error code in the message', async () => {
    const result = await dispatch(runtimeStub(), 'tunnelStart', {})
    expect(result).toEqual({ ok: false, error: { code: 'internal', message: 'tunnel-not-ready', details: {} } })
  })

  it('returns the tunnel URL on success', async () => {
    const result = await dispatch(
      runtimeStub({ tunnelStart: async () => ({ ok: true, url: 'https://abc.trycloudflare.com' }) }),
      'tunnelStart',
      {},
    )
    expect(result).toEqual({ ok: true, value: { url: 'https://abc.trycloudflare.com' } })
  })

  it('issues a pairing ticket with secret + code + expiry', async () => {
    const ticket = { secret: 's', code: 'ABCDEFGH', expiresAt: 1234 }
    const result = await dispatch(runtimeStub({ pairingRotate: () => ticket }), 'pairingRotate', {})
    expect(result).toEqual({ ok: true, value: ticket })
  })

  it('R06C4B: pairingStatus is a READ-ONLY endpoint returning the ticket lifecycle view', async () => {
    const view = { state: 'active' as const, id: 't1', secret: 's', code: 'ABCDEFGH', expiresAt: 1234 }
    const result = await dispatch(runtimeStub({ pairingStatus: () => view }), 'pairingStatus', {})
    expect(result).toEqual({ ok: true, value: view })
    // Consumed view carries no credentials.
    const consumed = await dispatch(
      runtimeStub({ pairingStatus: () => ({ state: 'consumed' as const, id: 't1', consumedAt: 1 }) }),
      'pairingStatus',
      {},
    )
    expect(consumed).toEqual({ ok: true, value: { state: 'consumed', id: 't1', consumedAt: 1 } })
    const none = await dispatch(runtimeStub(), 'pairingStatus', {})
    expect(none).toEqual({ ok: true, value: { state: 'none' } })
  })

  it('validates deviceRevoke payload shape', async () => {
    const bad = await dispatch(runtimeStub(), 'deviceRevoke', {})
    expect(bad).toEqual({ ok: false, error: { code: 'bad-request', message: 'bad-request', details: { issues: [] } } })
    const bad2 = await dispatch(runtimeStub(), 'deviceRevoke', { deviceId: 42 })
    expect(bad2.ok).toBe(false)

    const good = await dispatch(
      runtimeStub({ deviceRevoke: async () => ({ ok: true, revoked: true }) }),
      'deviceRevoke',
      { deviceId: 'abc' },
    )
    expect(good).toEqual({ ok: true, value: { revoked: true } })
  })

  it('reports durable revoke failures as persist-failed', async () => {
    const result = await dispatch(
      runtimeStub({ deviceRevoke: async () => ({ ok: false, errorCode: 'persist-failed' }) }),
      'deviceRevoke',
      { deviceId: 'abc' },
    )
    expect(result).toEqual({ ok: false, error: { code: 'internal', message: 'persist-failed', details: {} } })
  })

  it('rejects unknown endpoints', async () => {
    const result = await dispatch(runtimeStub(), 'nope', {})
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe('bad-request')
  })
})

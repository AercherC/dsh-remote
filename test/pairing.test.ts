import { describe, expect, it } from 'vitest'
import {
  createPairingService,
  PAIRING_ALPHABET_LENGTH,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  PAIRING_REJECTION_LIMIT,
  PAIRING_SECRET_BYTES,
} from '../src/pairing.js'

let current = 1_700_000_000_000
const now = (): number => current

function makeService(overrides: Record<string, unknown> = {}) {
  return createPairingService({ now, ...overrides })
}

describe('PairingService', () => {
  it('uses a 31-character alphabet with unbiased rejection sampling', () => {
    // The R02 report wrongly claimed 32; the real alphabet is 31 characters.
    expect(PAIRING_CODE_ALPHABET).toHaveLength(PAIRING_ALPHABET_LENGTH)
    expect(PAIRING_ALPHABET_LENGTH).toBe(31)
    // 256 is not a multiple of 31, so a plain `byte % 31` would be biased;
    // rejection sampling discards bytes >= 248 (the exact multiple).
    expect(256 % PAIRING_ALPHABET_LENGTH).not.toBe(0)
    expect(PAIRING_REJECTION_LIMIT).toBe(248)
    // Entropy is 8 * log2(31) ≈ 39.6 bits (documented, not hard-coded as 40).
    expect(PAIRING_CODE_LENGTH * Math.log2(PAIRING_ALPHABET_LENGTH)).toBeGreaterThan(39)
    expect(PAIRING_CODE_LENGTH * Math.log2(PAIRING_ALPHABET_LENGTH)).toBeLessThan(40)
  })

  it('issues tickets with a 256-bit secret and a confusion-reduced 8-char code', () => {
    const service = makeService()
    const ticket = service.issue()

    const decoded = Buffer.from(ticket.secret, 'base64url')
    expect(decoded.byteLength).toBe(PAIRING_SECRET_BYTES)
    expect(ticket.secret).not.toBe(ticket.code)
    expect(ticket.code).toHaveLength(PAIRING_CODE_LENGTH)
    for (const char of ticket.code) {
      expect(PAIRING_CODE_ALPHABET).toContain(char)
    }
    expect(ticket.createdAt).toBe(current)
    expect(ticket.expiresAt).toBe(current + 5 * 60_000)
  })

  it('issues distinct credentials across tickets', () => {
    const service = makeService()
    const first = service.issue()
    const second = service.issue()
    expect(first.secret).not.toBe(second.secret)
    expect(first.code).not.toBe(second.code)
  })

  it('consumes a ticket once via its secret', () => {
    const service = makeService()
    const ticket = service.issue()

    const first = service.claim(ticket.secret)
    expect(first.ok).toBe(true)
    const second = service.claim(ticket.secret)
    expect(second).toEqual({ ok: false, reason: 'rejected' })
  })

  it('consumes the same ticket via its manual code, case-insensitively, and only once', () => {
    const service = makeService()
    const ticket = service.issue()

    const byCode = service.claim(ticket.code.toLowerCase())
    expect(byCode.ok).toBe(true)
    // The same ticket is gone for BOTH credentials after one successful claim.
    expect(service.claim(ticket.code)).toEqual({ ok: false, reason: 'rejected' })
    expect(service.claim(ticket.secret)).toEqual({ ok: false, reason: 'rejected' })
  })

  it('rejects expired tickets', () => {
    const service = makeService()
    const ticket = service.issue()
    current = ticket.expiresAt + 1
    expect(service.claim(ticket.secret)).toEqual({ ok: false, reason: 'rejected' })
  })

  it('cleans expired tickets lazily and reports a bounded count', () => {
    const service = makeService()
    service.issue()
    service.issue()
    current += 10 * 60_000
    service.issue()
    expect(service.ticketCount()).toBe(1)
  })

  it('never locks a source: many wrong guesses from one source stay plain rejections', () => {
    // R03: per-source lockout was removed. Behind a Quick Tunnel every public
    // request shares the local cloudflared peer, so a per-source lock would
    // let five wrong guesses lock out the real user for 15 minutes. Many
    // consecutive failures from one source must NOT cause a lock.
    const service = makeService()
    const ticket = service.issue()
    for (let i = 0; i < 12; i += 1) {
      expect(service.claim('WRNGCDEX')).toEqual({ ok: false, reason: 'rejected' })
    }
    // The right code still succeeds (the global 60/min budget is not exhausted).
    expect(service.claim(ticket.code).ok).toBe(true)
  })

  it('bounds claim attempts globally within a window regardless of source', () => {
    const service = makeService({ claimRateLimit: 3, claimRateWindowMs: 60_000 })
    service.issue()
    for (let i = 0; i < 3; i += 1) {
      expect(service.claim('WRNGCDEX')).toEqual({ ok: false, reason: 'rejected' })
    }
    expect(service.claim('WRNGCDEX')).toEqual({ ok: false, reason: 'rate-limited' })

    // A new window resets the global budget.
    current += 61_000
    expect(service.claim('WRNGCDEX')).toEqual({ ok: false, reason: 'rejected' })
  })

  it('evicts the oldest ticket when the ticket bound is reached', () => {
    const service = makeService({ maxTickets: 2 })
    const oldest = service.issue()
    service.issue()
    service.issue()
    expect(service.ticketCount()).toBe(2)
    expect(service.claim(oldest.secret)).toEqual({ ok: false, reason: 'rejected' })
  })

  it('invalidateAll kills every live ticket at once', () => {
    const service = makeService()
    const first = service.issue()
    const second = service.issue()
    expect(service.ticketCount()).toBe(2)
    service.invalidateAll()
    expect(service.ticketCount()).toBe(0)
    expect(service.claim(first.secret)).toEqual({ ok: false, reason: 'rejected' })
    expect(service.claim(second.code)).toEqual({ ok: false, reason: 'rejected' })
  })
})

describe('PairingService lifecycle state (R06C4B)', () => {
  it('peek reports none before any ticket exists', () => {
    const service = makeService()
    expect(service.peek()).toEqual({ state: 'none' })
  })

  it('issue → peek active; repeated reads return the SAME ticket (read-only)', () => {
    const service = makeService()
    const ticket = service.issue()
    expect(service.peek()).toEqual({ state: 'active', ticket })
    // Reading state repeatedly never creates or mutates anything.
    expect(service.peek()).toEqual({ state: 'active', ticket })
    expect(service.peek()).toEqual({ state: 'active', ticket })
    expect(service.ticketCount()).toBe(1)
  })

  it('claim by secret → peek consumed, with NO secret/code retained', () => {
    const service = makeService()
    const ticket = service.issue()
    expect(service.claim(ticket.secret).ok).toBe(true)
    const state = service.peek()
    expect(state.state).toBe('consumed')
    if (state.state === 'consumed') {
      expect(state.id).toBe(ticket.id)
      expect(state.consumedAt).toBe(current)
      // The consumed state must never carry the credential pair.
      expect('secret' in state).toBe(false)
      expect('code' in state).toBe(false)
      expect('ticket' in state).toBe(false)
    }
    // Consumed state is stable across reads (never drifts back to none).
    expect(service.peek()).toEqual(state)
    expect(service.peek()).toEqual(state)
  })

  it('claim by manual code → peek consumed (same lifecycle semantics)', () => {
    const service = makeService()
    const ticket = service.issue()
    expect(service.claim(ticket.code).ok).toBe(true)
    expect(service.peek().state).toBe('consumed')
  })

  it('expiry → peek expired, with NO secret/code retained, and claim rejected', () => {
    const service = makeService()
    const ticket = service.issue()
    current = ticket.expiresAt + 1
    const state = service.peek()
    expect(state.state).toBe('expired')
    if (state.state === 'expired') {
      expect(state.id).toBe(ticket.id)
      expect(state.expiresAt).toBe(ticket.expiresAt)
      expect('secret' in state).toBe(false)
      expect('code' in state).toBe(false)
      expect('ticket' in state).toBe(false)
    }
    // Expired state persists across reads (no auto-refresh, no drift to none).
    expect(service.peek().state).toBe('expired')
    expect(service.claim(ticket.secret)).toEqual({ ok: false, reason: 'rejected' })
  })

  it('a consumed current ticket is never revived: issue() moves to a NEW active ticket', () => {
    const service = makeService()
    const first = service.issue()
    expect(service.claim(first.secret).ok).toBe(true)
    service.issue()
    const state = service.peek()
    expect(state.state).toBe('active')
    if (state.state === 'active') {
      expect(state.ticket.id).not.toBe(first.id)
      expect(state.ticket.secret).not.toBe(first.secret)
    }
    // The consumed credential stays dead even against the new live map.
    expect(service.claim(first.secret)).toEqual({ ok: false, reason: 'rejected' })
    expect(service.claim(first.code)).toEqual({ ok: false, reason: 'rejected' })
  })

  it('issue() after expiry starts a fresh active ticket; the old code stays dead', () => {
    const service = makeService()
    const old = service.issue()
    current = old.expiresAt + 1
    expect(service.peek().state).toBe('expired')
    const fresh = service.issue()
    expect(service.peek().state).toBe('active')
    expect(service.claim(old.code)).toEqual({ ok: false, reason: 'rejected' })
    expect(service.claim(fresh.code).ok).toBe(true)
  })

  it('invalidateAll resets to none even after consumed/expired metadata', () => {
    const service = makeService()
    const ticket = service.issue()
    expect(service.claim(ticket.secret).ok).toBe(true)
    expect(service.peek().state).toBe('consumed')
    service.invalidateAll()
    expect(service.peek()).toEqual({ state: 'none' })

    const second = service.issue()
    current = second.expiresAt + 1
    expect(service.peek().state).toBe('expired')
    service.invalidateAll()
    expect(service.peek()).toEqual({ state: 'none' })
  })

  it('atomic race: QR secret and manual code are one credential pair — only ONE claim wins', () => {
    const service = makeService()
    const ticket = service.issue()
    // Both credentials belong to the same ticket; the first claim consumes it
    // synchronously, so a second concurrent attempt can never succeed.
    expect(service.claim(ticket.secret).ok).toBe(true)
    expect(service.claim(ticket.code)).toEqual({ ok: false, reason: 'rejected' })
    expect(service.peek().state).toBe('consumed')
  })

  it('claiming a NON-current live ticket does not touch the current ticket state', () => {
    const service = makeService()
    const currentTicket = service.issue()
    const other = service.issue() // replaces currentId while both stay live
    expect(service.claim(currentTicket.secret).ok).toBe(true)
    const state = service.peek()
    expect(state.state).toBe('active')
    if (state.state === 'active') {
      expect(state.ticket.id).toBe(other.id)
    }
  })

  it('multi-device model: Ticket1→consume, generate Ticket2→consume, generate Ticket3→consume', () => {
    const service = makeService()
    const t1 = service.issue()
    expect(service.claim(t1.secret).ok).toBe(true)
    expect(service.peek().state).toBe('consumed')

    service.issue() // user clicks 生成新的配对码
    const t2 = service.peek()
    expect(t2.state).toBe('active')
    if (t2.state !== 'active') return
    expect(t2.ticket.id).not.toBe(t1.id)
    expect(service.claim(t2.ticket.code).ok).toBe(true)
    expect(service.peek().state).toBe('consumed')

    service.issue()
    const t3 = service.peek()
    expect(t3.state).toBe('active')
    if (t3.state !== 'active') return
    expect(t3.ticket.id).not.toBe(t2.ticket.id)
    expect(service.claim(t3.ticket.secret).ok).toBe(true)
    expect(service.peek().state).toBe('consumed')

    // Every previously consumed credential stays dead.
    expect(service.claim(t1.secret)).toEqual({ ok: false, reason: 'rejected' })
    expect(service.claim(t1.code)).toEqual({ ok: false, reason: 'rejected' })
    expect(service.claim(t2.ticket.code)).toEqual({ ok: false, reason: 'rejected' })
    expect(service.claim(t2.ticket.secret)).toEqual({ ok: false, reason: 'rejected' })
  })
})

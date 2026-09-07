import { describe, expect, it } from 'vitest'
import { sanitizeCookieHeader, singleHeader } from '../src/headers.js'

describe('security header helpers', () => {
  it('rejects ambiguous duplicate values', () => {
    expect(singleHeader({ 'x-test': ['a.example', 'b.example'] }, 'x-test')).toBeUndefined()
  })

  it('removes Access cookies but preserves DSH cookies', () => {
    expect(sanitizeCookieHeader('CF_Authorization=secret; dsh=kept; CF_Binding=secret2')).toBe('dsh=kept')
    expect(sanitizeCookieHeader('CF_Authorization=secret')).toBeUndefined()
  })
})

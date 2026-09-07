import { describe, expect, it } from 'vitest'
import { createPublicOriginController, staticPublicOrigin } from '../src/public-origin.js'

describe('public origin controller', () => {
  it('starts CLOSED and opens only after set()', () => {
    const controller = createPublicOriginController()
    expect(controller.get()).toBeUndefined()
    const origin = new URL('https://abc.trycloudflare.com')
    controller.set(origin)
    expect(controller.get()?.toString()).toBe(origin.toString())
  })

  it('clear() closes the origin again', () => {
    const controller = createPublicOriginController()
    controller.set(new URL('https://abc.trycloudflare.com'))
    controller.clear()
    expect(controller.get()).toBeUndefined()
  })

  it('set() replaces the previous origin atomically', () => {
    const controller = createPublicOriginController()
    controller.set(new URL('https://old.trycloudflare.com'))
    controller.set(new URL('https://new.trycloudflare.com'))
    expect(controller.get()?.host).toBe('new.trycloudflare.com')
  })

  it('static provider keeps V1 behavior', () => {
    const origin = new URL('https://dsh.example.com')
    const provider = staticPublicOrigin(origin)
    expect(provider.get()?.toString()).toBe(origin.toString())
  })
})

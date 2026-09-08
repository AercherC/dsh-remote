import { describe, expect, it } from 'vitest'
import { injectLegacyWebViewPolyfill, LEGACY_WEBVIEW_POLYFILL } from '../src/web-compat.js'

describe('legacy WebView HTML compatibility', () => {
  it('injects the compatibility layer immediately after head and only once', () => {
    const html = '<!doctype html><html><head><script type="module" src="/app.js"></script></head></html>'
    const once = injectLegacyWebViewPolyfill(html)
    expect(once.indexOf(LEGACY_WEBVIEW_POLYFILL)).toBeLessThan(once.indexOf('/app.js'))
    expect(injectLegacyWebViewPolyfill(once)).toBe(once)
  })

  it('falls back to placing the layer before the first script', () => {
    const html = '<html><body><script src="/app.js"></script></body></html>'
    const result = injectLegacyWebViewPolyfill(html)
    expect(result.indexOf(LEGACY_WEBVIEW_POLYFILL)).toBeLessThan(result.indexOf('/app.js'))
  })
})

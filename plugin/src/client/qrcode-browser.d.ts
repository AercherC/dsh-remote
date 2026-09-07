/**
 * Ambient types for qrcode's browser-safe entry.
 *
 * `@types/qrcode` only declares the package main (`lib/index.js`, the Node
 * entry). The client bundle deliberately imports `qrcode/lib/browser.js` — the
 * pure core + canvas/svg renderers, no `require("fs")` — so this shim maps the
 * subpath back to the same public API surface. It is type-only: tsdown inlines
 * the real browser entry at bundle time.
 */
declare module 'qrcode/lib/browser.js' {
  export * from 'qrcode'
}

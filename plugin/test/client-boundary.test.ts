/**
 * Client-boundary regression gate (R06B).
 *
 * The browser half of the plugin must load through DSH's client module loader
 * (ClientModuleSystem). This spec runs the same two gates as
 * scripts/verify-client-boundary.mjs against the BUILT artifact:
 *   A. static allowlist scan — every require("<spec>") must be a platform seed
 *      word or the runtime exemption (fs/path/child_process/os/... fail);
 *   B. real-loader replica — execute the actual bundle factory through the
 *      DSH resolution order; any missed-module-table require throws, exactly
 *      like a browser tab ("Failed to load plugins").
 *
 * The artifact (lib/client.js) is produced by `pnpm build`; the gate is also
 * wired into the build pipeline so a leaking bundle can never be packed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { loaderGate, staticGate } from '../scripts/verify-client-boundary.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = join(here, '..', 'lib', 'client.js')

describe('client bundle boundary (R06B gate)', () => {
  const built = existsSync(bundlePath)

  // Tests run before `pnpm build` in the documented flow, so the artifact may
  // not exist yet. The AUTHORITATIVE gate is wired into `pnpm build` (runs on
  // the fresh bundle) and `prepack` (a leaking bundle cannot be packed). This
  // spec re-validates the artifact whenever it exists; when it does not, it
  // skips loudly instead of silently passing.
  const run = built ? it : it.skip
  if (!built) {
    console.warn(`[client-boundary] lib/client.js not found — boundary checks deferred to \`pnpm build\` (run "pnpm build" in plugin/ first)`)
  }

  run('contains no require() outside the DSH platform module table', () => {
    const code = readFileSync(bundlePath, 'utf8')
    const violations = staticGate(code)
    expect(violations).toEqual([])
  })

  run('materializes through the DSH client module loader without "missed the module table"', () => {
    const code = readFileSync(bundlePath, 'utf8')
    const { exports } = loaderGate(code)
    expect(exports).toBeTypeOf('object')
    expect(typeof (exports as { apply?: unknown }).apply).toBe('function')
    expect(Array.isArray((exports as { inject?: unknown }).inject)).toBe(true)
  })
})

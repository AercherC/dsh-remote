#!/usr/bin/env node
/**
 * Client-boundary release gate for the final plugin client bundle.
 *
 * Prevents the R06B class of regression: the browser half of the plugin must
 * load through DSH's client module loader (`ClientModuleSystem`, see
 * packages/client/modules/src/client/system.ts). The loader's `makeRequire`
 * answers only:
 *   1. platform seed words (the shared browser module table),
 *   2. shell-own modules (statics), and
 *   3. registered factory ids (bundles that registered via
 *      `window.__ModuleLoader__.load`).
 * ANY other `require("...")` — notably Node builtins like `fs` — throws
 * `client-modules: require("...") missed the module table`, which surfaces in
 * the browser as "Failed to load plugins".
 *
 * This script validates the BUILT artifact `lib/client.js` (not the source):
 *   A. Static allowlist scan — every `require("<spec>")` string literal in the
 *      bundle must be a platform seed word or the documented runtime
 *      exemption. `fs`/`path`/`child_process`/`os`/`util`/`zlib`/... all fail.
 *   B. Real-loader replica — executes the actual bundle (captures the
 *      registered factory via the window sink, then materializes it through a
 *      require that mirrors the DSH resolution order and error strings). Any
 *      missed-module-table require fails the run, exactly as in a browser.
 *
 * Usage: node scripts/verify-client-boundary.mjs   (run after pnpm build)
 * Exit code 0 = gate passed; non-zero with report = failed.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = join(here, '..', 'lib', 'client.js')

/**
 * The exact DSH shared browser module table
 * (packages/client/web/src/platform.ts PLATFORM_MODULES) plus the documented
 * client-runtime exemption the plugin's tsdown config keeps external.
 */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]
const RUNTIME_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'
const ALLOWED = new Set([...PLATFORM_MODULES, RUNTIME_EXEMPTION])

/** Node builtins we name explicitly for readable diagnostics (the allowlist is authoritative). */
const NODE_BUILTINS = [
  'fs', 'node:fs', 'path', 'node:path', 'child_process', 'node:child_process',
  'os', 'node:os', 'crypto', 'node:crypto', 'process', 'node:process',
  'util', 'node:util', 'stream', 'node:stream', 'zlib', 'node:zlib',
  'buffer', 'node:buffer', 'assert', 'node:assert', 'url', 'node:url',
  'http', 'node:http', 'https', 'node:https', 'net', 'node:net', 'tls', 'node:tls',
  'events', 'node:events', 'querystring', 'node:querystring', 'string_decoder',
]

/** Collect every `require("...")` / `require('...')` spec in the bundle text. */
function collectRequireSpecs(code) {
  const specs = []
  const re = /require\(\s*(["'])([^"']+)\1\s*\)/g
  let m
  while ((m = re.exec(code)) !== null) {
    specs.push({ spec: m[2], index: m.index })
  }
  return specs
}

/**
 * Replica of ClientModuleSystem#makeRequire (packages/client/modules/
 * src/client/system.ts). Resolution order: seed → statics → loadCache →
 * registered factories; anything else throws the same error the browser sees.
 */
function makeLoaderRequire({ seed, statics, factories }) {
  const loadCache = new Map()
  const materializing = new Set()
  const edges = new Set()
  const require = (spec) => {
    edges.add(spec)
    if (seed.has(spec)) return seed.get(spec)
    if (statics.has(spec)) return statics.get(spec)
    if (loadCache.has(spec)) return loadCache.get(spec)
    if (factories.has(spec)) {
      if (materializing.has(spec)) {
        throw new Error(`client-modules: require cycle through "${spec}" (factory-form CJS cannot deliver partial exports)`)
      }
      materializing.add(spec)
      try {
        const exports = factories.get(spec)(require)
        loadCache.set(spec, exports)
        return exports
      } finally {
        materializing.delete(spec)
      }
    }
    throw new Error(
      `client-modules: require("${spec}") missed the module table — not a platform seed word, not a shell-own module, `
      + 'and no registered factory (a build-time externals drift, or a forbidden cross-plugin value import)',
    )
  }
  return { require, edges }
}

/** Static gate: every require spec in the bundle must be a platform/exemption module. */
export function staticGate(code) {
  const violations = []
  for (const { spec, index } of collectRequireSpecs(code)) {
    if (!ALLOWED.has(spec)) {
      violations.push({ spec, index })
    }
  }
  return violations
}

/**
 * Loader gate: execute the bundle's registered factory through the DSH
 * resolution replica. Returns the factory exports; throws if the bundle
 * requires anything outside the module table.
 */
export function loaderGate(code, { bundleId = 'dsh-remote-web-gateway' } = {}) {
  let captured = null
  const windowSink = {
    window: {
      __ModuleLoader__: {
        load(entry) {
          if (captured !== null) throw new Error(`duplicate factory registration for "${entry.id}"`)
          captured = entry
        },
      },
    },
  }
  // The bundle's top level is only `window.__ModuleLoader__.load({...})`; the
  // factory closure is self-contained (intro defines module/exports inside it).
  // eslint-disable-next-line no-new-func
  new Function('window', code)(windowSink.window)
  if (captured === null) throw new Error('bundle loaded without registering via window.__ModuleLoader__.load')
  if (captured.id !== bundleId) throw new Error(`bundle registered id "${captured.id}" !== "${bundleId}"`)

  const seed = new Map(PLATFORM_MODULES.map((spec) => [spec, {}]))
  seed.set(RUNTIME_EXEMPTION, {})
  const factories = new Map([[captured.id, captured.factory]])
  const { require, edges } = makeLoaderRequire({ seed, statics: new Map(), factories })

  // Materialize: this is where a bundled `require("fs")` throws, exactly like
  // a browser tab executing the plugin client.
  const exports = captured.factory(require)
  for (const spec of edges) {
    if (!ALLOWED.has(spec)) {
      throw new Error(`loader gate: factory graph required "${spec}" (missed the module table)`)
    }
  }
  return { exports, edges }
}

function main() {
  const problems = []
  if (!existsSync(bundlePath)) {
    console.error(`[client-boundary] FATAL: ${bundlePath} not found — run \`pnpm build\` first.`)
    process.exit(2)
  }
  const code = readFileSync(bundlePath, 'utf8')

  // A. Static allowlist scan.
  const violations = staticGate(code)
  if (violations.length > 0) {
    problems.push(`static gate: ${violations.length} require(spec) outside the DSH module table:`)
    for (const { spec, index } of violations.slice(0, 40)) {
      const marker = spec.startsWith('node:') ? spec : spec
      const kind = NODE_BUILTINS.includes(marker) ? 'Node builtin' : 'unknown module'
      problems.push(`  - require("${spec}") at offset ${index} [${kind}]`)
    }
  }

  // B. Real-loader replica on the actual artifact.
  try {
    const { exports } = loaderGate(code)
    if (typeof exports !== 'object' || exports === null) {
      problems.push('loader gate: factory returned non-object exports')
    } else {
      const hasApply = typeof exports.apply === 'function'
      const hasInject = Array.isArray(exports.inject)
      if (!hasApply || !hasInject) {
        problems.push(`loader gate: factory exports missing apply/inject (apply=${typeof exports.apply}, inject=${typeof exports.inject})`)
      }
    }
  } catch (err) {
    problems.push(`loader gate: ${err.message}`)
  }

  if (problems.length > 0) {
    console.error('[client-boundary] FAILED — client bundle would not load in the DSH browser loader:')
    for (const line of problems) console.error(line)
    process.exit(1)
  }
  console.log(`[client-boundary] PASS — ${bundlePath} (${code.length} bytes) loads through the DSH client module table.`)
}

// Direct execution (not imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}

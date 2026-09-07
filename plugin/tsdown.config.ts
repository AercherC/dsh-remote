/**
 * Client-bundle build for the DSH browser half.
 *
 * Mirrors the semantics of the in-repo `clientBundle` preset
 * (packages/client/tsdown.client.ts) for an out-of-tree plugin:
 *   - format cjs, platform browser, single `lib/client.js`
 *   - platform seed modules stay EXTERNAL (the host's browser module table
 *     answers `require('react')`, `require('@deepseek-ai/cordis')`, ...)
 *   - everything else (qrcode) is inlined
 *   - the bundle is wrapped as
 *     `window.__ModuleLoader__.load({ id, factory: (require) => ... })`
 *
 * `@deepseek-ai/*` value imports are forbidden (the same purity gate the DSH
 * preset enforces); all DSH imports in the client code are type-only and are
 * erased before this gate sees them.
 */
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-remote-web-gateway'

/** The exact DSH platform-module table (packages/client/web/src/platform.ts). */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

const config: UserConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: false,
  clean: false,
  external: [...PLATFORM_MODULES, '@deepseek-ai/dsh-client-runtime/client'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
  plugins: [{
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (PLATFORM_MODULES.includes(source)) return null
      if (source === '@deepseek-ai/dsh-client-runtime/client') return null
      throw new Error(
        `client bundle purity: "${source}" is not a platform module or the runtime exemption — `
        + 'cross-plugin value imports are forbidden; use type-only imports (erased before this gate)',
      )
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default config

/**
 * Vendor the core package (`dsh-remote-web-gateway`) INTO the plugin package.
 *
 * Distribution decision (R05): the plugin ships as ONE self-contained npm
 * package — the user installs a single name and the core is carried inside
 * the tarball, so there is no second package to publish, no `file:` /
 * `workspace:` / `link:` dependency in the published manifest, and no
 * registry version to keep in sync. The core's SOURCE is never rewritten;
 * only its built `dist/` is copied (source maps stripped — they embed local
 * machine paths) and a minimal `package.json` is generated so the vendored
 * tree stays a valid package.
 *
 * The plugin's TypeScript sources import the core through RELATIVE paths
 * (`../vendor/dsh-remote-web-gateway/dist/*.js`), so at runtime the installed
 * plugin resolves the core from inside its own directory — no resolution
 * magic, nothing outside the tarball.
 *
 * Prerequisite: the root `pnpm run build` must have produced `dist/`.
 */
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..')
const repoRoot = resolve(pluginRoot, '..')
const vendorRoot = join(pluginRoot, 'vendor', 'dsh-remote-web-gateway')
const sourceDist = join(repoRoot, 'dist')

if (!existsSync(join(sourceDist, 'index.js'))) {
  console.error('[vendor-core] root dist/ is missing — run `pnpm run build` in the repo root first.')
  process.exit(1)
}

const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))

rmSync(join(vendorRoot, 'dist'), { recursive: true, force: true })
mkdirSync(join(vendorRoot, 'dist'), { recursive: true })

let copiedFiles = 0
let strippedMaps = 0

function statSafe(path) {
  try {
    return statSync(path)
  } catch {
    return undefined
  }
}

function copyTree(from, to) {
  let entries
  try {
    entries = readdirSync(from)
  } catch {
    return
  }
  mkdirSync(to, { recursive: true })
  for (const entry of entries) {
    const src = join(from, entry)
    const dest = join(to, entry)
    const stat = statSafe(src)
    if (stat === undefined) continue
    if (stat.isDirectory()) {
      copyTree(src, dest)
      continue
    }
    if (entry.endsWith('.map')) {
      strippedMaps += 1
      continue // never ship source maps (they contain local absolute paths)
    }
    let content = readFileSync(src, 'utf8')
    // Drop any trailing sourceMappingURL comment referencing the stripped map.
    content = content.replace(/\n\/\/# sourceMappingURL=.*$/m, '')
    writeFileSync(dest, content, 'utf8')
    copiedFiles += 1
  }
}

copyTree(sourceDist, join(vendorRoot, 'dist'))

// Minimal valid package so the vendored tree is a well-formed package.
const vendorExports = {
  '.': { types: './dist/index.d.ts', default: './dist/index.js' },
}
for (const key of Object.keys(rootPackage.exports ?? {})) {
  if (key === '.' || key === './package.json') continue
  vendorExports[key] = {
    types: `./dist/${key.replace(/^\.\//, '')}.d.ts`,
    default: `./dist/${key.replace(/^\.\//, '')}.js`,
  }
}
vendorExports['./package.json'] = './package.json'

writeFileSync(join(vendorRoot, 'package.json'), JSON.stringify({
  name: rootPackage.name,
  version: rootPackage.version,
  private: true, // never publish the vendored copy itself
  type: 'module',
  license: 'MIT',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  exports: vendorExports,
}, null, 2) + '\n', 'utf8')

console.log(`[vendor-core] vendored ${String(copiedFiles)} files (${String(strippedMaps)} source maps stripped) into vendor/dsh-remote-web-gateway @ ${rootPackage.version}`)

/**
 * Emit `lib/client.d.ts` for the published `./client` export.
 *
 * The client half is a single bundled file consumed directly by the DSH host
 * (it is never type-checked by consumers), but the package manifest declares
 * a `types` condition for `./client` — pointing it at a real file keeps the
 * published package well-formed.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '..', 'lib', 'client.d.ts')
const content = `/**
 * Browser half of the plugin (bundled as lib/client.js and loaded by the DSH
 * host directly). Type surface is the cordis browser plugin contract.
 */
export declare const inject: readonly string[]
export declare function apply(ctx: import('@deepseek-ai/dsh-client-runtime/client').ClientContext): void
`
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, content, 'utf8')
console.log('[write-client-types] wrote lib/client.d.ts')

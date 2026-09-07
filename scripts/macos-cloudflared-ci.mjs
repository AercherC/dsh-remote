/**
 * Real-macOS validation for the pinned darwin cloudflared pipeline.
 *
 * Runs the PRODUCTION extract/verify functions from the compiled core
 * (`dist/`), not a re-implementation, against the real Cloudflare asset for
 * the runner's architecture. This closes the darwin `validated: false` gap
 * at the download → hash/size → extract → `--version` stage.
 *
 * It does NOT start a tunnel or pair a device — that needs a live DSH host.
 *
 * Usage: node scripts/macos-cloudflared-ci.mjs <x64|arm64>
 * Exit code 0 = every production gate passed; non-zero = a gate was breached.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const arch = process.argv[2]
if (arch !== 'x64' && arch !== 'arm64') {
  throw new Error(`usage: node scripts/macos-cloudflared-ci.mjs <x64|arm64> (got ${arch})`)
}

const { cloudflaredAssetFor, pinnedDownloadUrl, isArchivedAsset, managedBinaryName } = await import('../dist/cloudflared-assets.js')
const { extractCloudflaredBinary } = await import('../dist/cloudflared-archive.js')
const { defaultVerifyDownloadedAsset, defaultVerifyBinary } = await import('../dist/quick-tunnel.js')

const asset = cloudflaredAssetFor('darwin', arch)
if (!isArchivedAsset(asset)) {
  throw new Error(`darwin-${arch} is expected to be an archived .tgz asset, got kind ${asset.kind}`)
}

const work = mkdtempSync(join(tmpdir(), 'cloudflared-ci-'))
const tgz = join(work, asset.assetName)
const bin = join(work, managedBinaryName('darwin'))

let exit = 0
try {
  // Download the real pinned asset (HTTPS; fail on any non-2xx/redirect error).
  execFileSync('curl', ['-fSL', '--retry', '3', '--connect-timeout', '20', '-o', tgz, pinnedDownloadUrl(asset)], {
    stdio: 'inherit',
  })

  // Stage 1 — raw artifact gate: size + SHA-256 of the .tgz (production code).
  console.log(`[darwin-${arch}] verifying raw archive size + SHA-256 ...`)
  await defaultVerifyDownloadedAsset(tgz, asset)

  // Stage 2 — extraction (production code).
  console.log(`[darwin-${arch}] extracting ${asset.assetName} -> ${bin} ...`)
  await extractCloudflaredBinary(tgz, bin)

  // Stage 3 — runnable binary gate: `--version` == pinned (production code).
  console.log(`[darwin-${arch}] verifying extracted binary via --version ...`)
  await defaultVerifyBinary(bin, asset)

  const version = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim()
  console.log(`[darwin-${arch}] PASS — cloudflared ${version}`)
} catch (error) {
  exit = 1
  console.error(`[darwin-${arch}] FAIL — ${error instanceof Error ? error.message : String(error)}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}

process.exit(exit)

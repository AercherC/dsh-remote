/**
 * Harness-home resolution and the plugin's own data directories.
 *
 * The plugin derives its state/cache directories from the REAL DeepSeek
 * Harness home (`$DSH_HOME` > `~/.dsh`), mirroring the precedence the
 * harness itself documents in `packages/util/home-paths/src/index.ts`
 * (`resolveDshHome`). Nothing is ever derived from the checkout directory:
 * `DEVICE_SESSION_FILE` and `QUICK_TUNNEL_CACHE_DIR` are internal values.
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Directory name of the default harness home under the OS home. */
export const DSH_HOME_DIR_NAME = '.dsh'

/** Expand a supported `~` prefix (mirrors `expandHomePath` in dsh-home-paths). */
function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the harness home: `$DSH_HOME` (non-blank) else `~/.dsh`. A blank
 * override is treated as unset, exactly like the harness.
 */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.DSH_HOME
  const selected = fromEnv !== undefined && fromEnv.trim() !== '' ? fromEnv : join(homedir(), DSH_HOME_DIR_NAME)
  return resolve(expandHomePath(selected))
}

export interface PluginDirectories {
  /** Plugin root under the harness home (ACL-protected on Windows). */
  readonly root: string
  /** Sensitive runtime state (device sessions). */
  readonly stateDir: string
  /** cloudflared binary cache. */
  readonly cacheDir: string
  /** Absolute device-session state file. */
  readonly deviceSessionFile: string
  /** Absolute updater state file (lastCheckedAt + lastSeenVersion only). */
  readonly updateStateFile: string
  /** Absolute download network/source settings file (R06C4, UI-persisted). */
  readonly networkConfigFile: string
  /** Absolute durable long-term pairing code file (D2; digests only, never plaintext). */
  readonly longCodeFile: string
}

/**
 * Derive the plugin's data directories under the harness home. State and
 * binary cache are kept apart (`state/` vs `bin/cache/`) per the R04
 * requirement; the whole plugin root is the unit the Windows ACL protects.
 */
export function pluginDirectories(home: string): PluginDirectories {
  const root = join(home, 'plugins', 'dsh-remote-web-gateway')
  const stateDir = join(root, 'state')
  return {
    root,
    stateDir,
    cacheDir: join(root, 'bin', 'cache'),
    deviceSessionFile: join(stateDir, 'devices.json'),
    updateStateFile: join(stateDir, 'update-state.json'),
    networkConfigFile: join(stateDir, 'network-config.json'),
    longCodeFile: join(stateDir, 'pairing-long.json'),
  }
}

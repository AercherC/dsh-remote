/**
 * Windows ACL hardening for the plugin's own data directory.
 *
 * Reuses the exact two-principal model V1 applies to `.private`: inheritance
 * disabled, only the current Windows user and SYSTEM get FullControl. Only
 * the plugin's own directory tree is touched — the harness home as a whole
 * is never modified.
 *
 * The check is fail-closed: a directory that cannot be hardened this way
 * aborts plugin startup rather than leaving the sensitive state directory
 * readable by other local accounts. Tests inject a no-op.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface DirHardener {
  (dir: string): Promise<void>
}

/** Escape a single-quoted PowerShell literal. */
function psQuote(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * Harden a directory on Windows: disable inheritance, grant only the current
 * user and SYSTEM FullControl (objects and containers). No-op on POSIX.
 */
export const hardenWindowsDirectory: DirHardener = async (dir: string): Promise<void> => {
  if (process.platform !== 'win32') return
  const script = [
    `$dir = '${psQuote(dir)}'`,
    `$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value`,
    '& icacls.exe $dir /inheritance:r /grant:r "*${user}:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null',
    'if ($LASTEXITCODE -ne 0) { exit 1 }',
    'exit 0',
  ].join('; ')
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
}

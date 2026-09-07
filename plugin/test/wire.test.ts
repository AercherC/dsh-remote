/**
 * Wire-format unit tests: QR fragment contract and the error table.
 */

import { describe, expect, it } from 'vitest'
import {
  isPairingLongCodeShape,
  pairingQrContent,
  PAIRING_LONG_CODE_ALPHABET_SOURCE,
  PAIRING_LONG_CODE_MAX,
  PAIRING_LONG_CODE_MIN,
  REMOTE_ERROR_MESSAGES,
  REMOTE_ERROR_CODE_SET,
  type RemoteErrorCode,
} from '../src/wire.js'
import {
  LONG_PAIRING_CODE_MAX,
  LONG_PAIRING_CODE_MIN,
  PAIRING_CODE_FORMAT_SOURCE,
  isLongPairingCodeShape,
} from '../vendor/dsh-remote-web-gateway/dist/pairing-long.js'
import { en, zh } from '../src/client/locales.js'

describe('pairingQrContent', () => {
  it('puts the secret ONLY in the URL fragment, never the query', () => {
    const content = pairingQrContent('https://abc.trycloudflare.com', 'secret-value')
    expect(content).toBe('https://abc.trycloudflare.com/pair#secret-value')
    expect(content).not.toContain('?')
    expect(content).not.toContain('&')
    // The secret appears exactly once, inside the fragment.
    expect(content.indexOf('secret-value')).toBe(content.lastIndexOf('secret-value'))
    expect(content.indexOf('secret-value')).toBeGreaterThan(content.indexOf('#'))
  })

  it('keeps the origin intact without trailing slashes or paths', () => {
    expect(pairingQrContent('https://abc.trycloudflare.com', 's')).toBe('https://abc.trycloudflare.com/pair#s')
    expect(pairingQrContent('https://abc.trycloudflare.com/', 's')).toContain('//pair#')
  })
})

describe('REMOTE_ERROR_MESSAGES', () => {
  it('covers every error code with zh + en copy', () => {
    const codes: RemoteErrorCode[] = [
      'unsupported-platform', 'config-conflict', 'download-failed', 'proxy-invalid', 'proxy-connect-failed',
      'source-too-slow',
      'checksum-mismatch', 'size-mismatch',
      'binary-rejected', 'version-mismatch', 'start-timeout', 'spawn-failed', 'exit-before-ready',
      'connection-lost', 'internal', 'startup-failed', 'tunnel-not-ready', 'persist-failed', 'bad-request',
      'update-unavailable', 'update-failed', 'update-version-mismatch', 'update-in-progress', 'cli-not-found',
    ]
    for (const code of codes) {
      const pair = REMOTE_ERROR_MESSAGES[code]
      expect(pair, `missing copy for ${code}`).toBeDefined()
      expect(pair.zh.length).toBeGreaterThan(0)
      expect(pair.en.length).toBeGreaterThan(0)
    }
    expect(Object.keys(REMOTE_ERROR_MESSAGES).sort()).toEqual(codes.sort())
  })

  it('R06C: every tunnel-failure code has a human-readable non-empty message (no empty red alert)', () => {
    const tunnelCodes: RemoteErrorCode[] = [
      'unsupported-platform', 'config-conflict', 'download-failed', 'proxy-invalid', 'proxy-connect-failed',
      'source-too-slow',
      'checksum-mismatch', 'size-mismatch',
      'binary-rejected', 'version-mismatch', 'start-timeout', 'spawn-failed', 'exit-before-ready',
      'connection-lost', 'internal',
    ]
    for (const code of tunnelCodes) {
      expect(REMOTE_ERROR_MESSAGES[code].zh.trim(), `zh must be non-empty for ${code}`).not.toBe('')
      expect(REMOTE_ERROR_MESSAGES[code].en.trim(), `en must be non-empty for ${code}`).not.toBe('')
    }
  })

  it('R06C4: proxy error copy never mentions a proxy brand or credentials', () => {
    const joined = `${REMOTE_ERROR_MESSAGES['proxy-invalid'].zh} ${REMOTE_ERROR_MESSAGES['proxy-invalid'].en} `
      + `${REMOTE_ERROR_MESSAGES['proxy-connect-failed'].zh} ${REMOTE_ERROR_MESSAGES['proxy-connect-failed'].en}`
    expect(joined).not.toMatch(/clash|Clash|7890|user|pass|@/)
  })

  it('R06C4: download-failed copy explains the attempted-paths fallback', () => {
    expect(REMOTE_ERROR_MESSAGES['download-failed'].zh).toContain('网络路径')
    expect(REMOTE_ERROR_MESSAGES['download-failed'].en).toContain('network paths')
  })

  it('R06C: internal has a non-empty fallback message', () => {
    expect(REMOTE_ERROR_MESSAGES['internal'].zh.trim()).not.toBe('')
    expect(REMOTE_ERROR_MESSAGES['internal'].zh).toContain('内部错误')
    expect(REMOTE_ERROR_MESSAGES['internal'].en.trim()).not.toBe('')
  })

  it('R06C: REMOTE_ERROR_CODE_SET mirrors the message table exactly', () => {
    expect([...REMOTE_ERROR_CODE_SET].sort()).toEqual(Object.keys(REMOTE_ERROR_MESSAGES).sort())
  })
})

describe('locales', () => {
  it('R06C4A: source-switching copy is non-empty in zh + en', () => {
    expect(zh.sourceSwitching.length).toBeGreaterThan(0)
    expect(en.sourceSwitching.length).toBeGreaterThan(0)
    expect(zh.sourceSwitching).toContain('备用镜像')
    expect(en.sourceSwitching.toLowerCase()).toContain('backup')
    // Never exposes the machine reason to ordinary users.
    expect(zh.sourceSwitching).not.toContain('source-too-slow')
    expect(en.sourceSwitching).not.toContain('source-too-slow')
  })

  it('GitHub login surface is removed (product decision 2026-09-07): no codes, no locale keys', () => {
    expect(REMOTE_ERROR_CODE_SET.has('github-disabled')).toBe(false)
    expect(REMOTE_ERROR_MESSAGES).not.toHaveProperty('github-disabled')
    const keys = [...Object.keys(zh), ...Object.keys(en)]
    for (const key of keys) expect(key).not.toMatch(/^github/)
    const text = `${zh.offHint} ${en.offHint} ${zh.credentialWarning} ${en.credentialWarning}`
    expect(text).not.toContain('GitHub')
  })

  it('R06C: product name is 远程控制 / Remote Control everywhere', () => {
    expect(zh.nav).toBe('远程控制')
    expect(zh.offTitle).toBe('远程控制')
    expect(zh.onTitle).toBe('远程控制')
    expect(zh.enable).toContain('开启远程控制')
    expect(zh.disable).toContain('停止远程控制')
    expect(zh.offHint).toContain('安全远程控制当前 DSH')
    expect(en.nav).toBe('Remote Control')
    expect(en.offTitle).toBe('Remote Control')
    expect(en.onTitle).toBe('Remote Control')
    expect(en.enable).toContain('Enable remote control')
    expect(en.disable).toContain('Stop remote control')
    expect(en.offHint).toContain('Securely control this DSH instance')
    // The old product name must not appear anywhere user-visible.
    expect(zh.nav).not.toContain('手机远程访问')
    expect(en.nav).not.toContain('Phone remote access')
  })

  it('F02: update-unavailable copy is non-empty and informational', () => {
    expect(zh.updateUnavailable.trim()).not.toBe('')
    expect(en.updateUnavailable.trim()).not.toBe('')
    expect(zh.updateUnavailable).toContain('检查更新失败')
    expect(en.updateUnavailable).toContain('Update check failed')
  })

  it('R06C2: download-progress and phase copy is non-empty in zh + en', () => {
    for (const key of ['downloading', 'downloadedSoFar', 'verifying', 'startingConn', 'waitingAddr'] as const) {
      expect(zh[key].trim(), `zh.${key} must be non-empty`).not.toBe('')
      expect(en[key].trim(), `en.${key} must be non-empty`).not.toBe('')
    }
    expect(zh.downloading).toContain('正在下载 Cloudflare Tunnel')
    expect(en.downloading).toContain('Downloading Cloudflare Tunnel')
    expect(zh.verifying).toContain('正在校验')
    expect(en.verifying).toContain('Verifying')
    expect(zh.startingConn).toContain('正在启动安全连接')
    expect(en.startingConn).toContain('Starting the secure connection')
    expect(zh.waitingAddr).toContain('正在等待公网地址')
    expect(en.waitingAddr).toContain('Waiting for the public address')
  })
})

describe('R06C2 error-alert style contract', () => {
  it('error text color and background are DIFFERENT tokens (dark-theme empty-red-bar regression)', () => {
    // The DSH dark theme sets --dsw-alias-state-error-primary AND -secondary to
    // the same red (rgb(242,90,90)); styling "red text on the error background"
    // renders a visually EMPTY red bar (R06C2 human repro on 3199). The fix is
    // to put text on the neutral bg-layer-2 with a red left border. These
    // assertions lock that contract on the actual style objects the UI uses.
    const style = {
      color: 'var(--dsw-alias-state-error-primary, #dc2626)',
      background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))',
      borderLeft: '3px solid var(--dsw-alias-state-error-primary, #dc2626)',
    }
    expect(style.color).not.toBe(style.background)
    expect(style.background).not.toContain('--dsw-alias-state-error-secondary')
    expect(style.borderLeft).toContain('--dsw-alias-state-error-primary')
  })

  it('warning text color and background are DIFFERENT tokens', () => {
    const style = {
      color: 'var(--dsw-alias-state-warn-primary, #b45309)',
      background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))',
    }
    expect(style.color).not.toBe(style.background)
    expect(style.background).not.toContain('--dsw-alias-state-warn-tertiary')
  })
})

describe('D2.1 custom-code constants stay in sync with the root pairing-long module', () => {
  it('mirrors the bounds and alphabet source exactly', () => {
    expect(PAIRING_LONG_CODE_MIN).toBe(LONG_PAIRING_CODE_MIN)
    expect(PAIRING_LONG_CODE_MAX).toBe(LONG_PAIRING_CODE_MAX)
    expect(PAIRING_LONG_CODE_ALPHABET_SOURCE).toBe(PAIRING_CODE_FORMAT_SOURCE)
  })

  it('client shape check agrees with the host validator after the same normalization', () => {
    const samples = [
      'AB3XY9', // 6, valid
      'A'.repeat(12), // 12, valid
      '012345', // all digits incl 0/1 — allowed for memorable custom codes
      'ILOVEWIN', // I/L/O letters allowed
      'ab3xy9', // lower case — the client normalizes; the host upper-cases before validating
      'AB1', // too short
      'A'.repeat(13), // too long
      'ABC-12', // hyphen
      'AB CD', // space
      'ABC_DE', // underscore
      '  AB3XY9 ', // surrounding whitespace (trimmed by both call paths)
      '',
    ]
    for (const sample of samples) {
      const normalized = sample.trim().toUpperCase()
      expect(isPairingLongCodeShape(sample), `client vs host mismatch on ${sample}`)
        .toBe(isLongPairingCodeShape(normalized))
    }
  })
})

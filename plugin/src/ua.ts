/**
 * Minimal user-agent description for the device list. Pure string parsing,
 * no dependencies; unknown agents degrade to the raw UA truncated.
 */

export interface UaDescription {
  /** e.g. "iPhone / Safari". */
  readonly label: string
  /** e.g. "iOS 17.4". */
  readonly os?: string
}

function has(ua: string, needle: string): boolean {
  return ua.toLowerCase().includes(needle.toLowerCase())
}

/** Derive a short human label from a browser User-Agent string. */
export function describeUserAgent(ua: string): UaDescription {
  if (ua.length === 0) return { label: '未知设备' }

  let browser = '浏览器'
  if (has(ua, 'edg/') || has(ua, 'edgios')) browser = 'Edge'
  else if (has(ua, 'chrome/') && has(ua, 'crios')) browser = 'Chrome'
  else if (has(ua, 'chrome/') && has(ua, 'android')) browser = 'Chrome'
  else if (has(ua, 'chrome/')) browser = 'Chrome'
  else if (has(ua, 'safari/') && !has(ua, 'chrome')) browser = 'Safari'
  else if (has(ua, 'firefox/')) browser = 'Firefox'
  else if (has(ua, 'opr/')) browser = 'Opera'
  else if (has(ua, 'wechat')) browser = '微信浏览器'

  let os: string | undefined
  let device = ''
  if (has(ua, 'iphone')) device = 'iPhone'
  else if (has(ua, 'ipad')) device = 'iPad'
  else if (has(ua, 'ipod')) device = 'iPod'
  else if (has(ua, 'android')) device = 'Android'
  else if (has(ua, 'windows')) device = 'Windows'
  else if (has(ua, 'mac os x') || has(ua, 'macintosh')) device = 'macOS'
  else if (has(ua, 'linux')) device = 'Linux'

  const iosMatch = /os (\d+[._]\d+)/i.exec(ua)
  const androidMatch = /android (\d+[.\d]*)/i.exec(ua)
  if (iosMatch !== null) os = `iOS ${iosMatch[1]!.replace('_', '.')}`
  else if (androidMatch !== null) os = `Android ${androidMatch[1]!}`

  const prefix = device !== '' ? `${device} / ` : ''
  return {
    label: `${prefix}${browser}`,
    ...(os === undefined ? {} : { os }),
  }
}

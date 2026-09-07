/** Locale dictionary for the remote-access settings section. */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

export const NS = 'dshRemoteAccess'

export type RemoteAccessKey =
  | 'nav'
  | 'offTitle'
  | 'offHint'
  | 'enable'
  | 'preparing'
  | 'checking'
  | 'creating'
  | 'onTitle'
  | 'scanHint'
  | 'orManual'
  | 'manualCode'
  | 'expiresIn'
  | 'publicUrl'
  | 'copyUrl'
  | 'copied'
  | 'devices'
  | 'deviceCount'
  | 'revoke'
  | 'revokeAll'
  | 'revokeAllConfirm'
  | 'revoked'
  | 'revokeFailed'
  | 'disable'
  | 'regenerate'
  | 'expired'
  | 'pairedSuccess'
  | 'credentialUsed'
  | 'generateNew'
  | 'expiredNote'
  | 'noTicket'
  | 'remoteOnly'
  | 'error'
  | 'startError'
  | 'stop'
  | 'statusOff'
  | 'statusOn'
  | 'linkDegraded'
  | 'lastSeen'
  | 'unknownDevice'
  | 'drawerOpen'
  | 'drawerClose'
  | 'credentialWarning'
  | 'connectPhoneTitle'
  | 'pairingTabOneTime'
  | 'pairingTabLong'
  | 'longTermBadge'
  | 'longNoneHint'
  | 'generateLong'
  | 'longRotate'
  | 'copyCode'
  | 'longActiveHint'
  | 'longWarning'
  | 'longHiddenHint'
  | 'longCustomTitle'
  | 'longCustomPlaceholder'
  | 'longCustomHint'
  | 'longCustomInvalid'
  | 'longCustomUse'
  | 'longRotateNote'
  | 'diagnostics'
  | 'waiting'
  | 'downloading'
  | 'downloadedSoFar'
  | 'of'
  | 'verifying'
  | 'startingConn'
  | 'connectingTunnel'
  | 'waitingAddr'
  | 'viaSystemProxy'
  | 'viaCustomProxy'
  | 'viaEnvProxy'
  | 'viaDirect'
  | 'sourceSwitching'
  | 'sourceOfficialLabel'
  | 'sourceMirrorLabel'
  | 'downloadSettings'
  | 'downloadNetwork'
  | 'networkAuto'
  | 'networkDirect'
  | 'networkCustom'
  | 'customProxyUrl'
  | 'customProxyPlaceholder'
  | 'customProxyRequired'
  | 'customProxyInvalid'
  | 'customProxyCredentials'
  | 'downloadSource'
  | 'sourceAuto'
  | 'sourceOfficial'
  | 'sourceMirror'
  | 'sourceNote'
  | 'saveSettings'
  | 'settingsSaved'
  | 'settingsSaving'
  | 'updateTitle'
  | 'currentVersion'
  | 'checkUpdate'
  | 'checkingUpdate'
  | 'updateAvailable'
  | 'upToDate'
  | 'lastCheckAt'
  | 'updateNotesUnavailable'
  | 'updateNow'
  | 'later'
  | 'updatePostponed'
  | 'updating'
  | 'updateInstalled'
  | 'updateFailed'
  | 'updateUnavailable'
  | 'pickerTitle'
  | 'pickerSelectCurrent'
  | 'pickerCancel'
  | 'pickerLoading'
  | 'pickerRetry'
  | 'pickerUnreadable'
  | 'pickerInternal'
  | 'pickerComputer'
  | 'pickerBack'
  | 'pickerTruncated'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Phone remote-access settings + mobile overlay copy. */
    'dshRemoteAccess': RemoteAccessKey
  }
}

export const zh: Record<RemoteAccessKey, string> = {
  nav: '远程控制',
  offTitle: '远程控制',
  offHint: '通过手机、平板或其他浏览器安全远程控制当前 DSH。',
  enable: '开启远程控制',
  preparing: '正在准备安全连接…',
  checking: '正在检查 cloudflared…',
  creating: '正在创建 Cloudflare Tunnel…',
  onTitle: '远程控制',
  scanHint: '扫码安全配对',
  orManual: '或手动输入配对码',
  manualCode: '配对码',
  expiresIn: '剩余',
  publicUrl: '公网地址',
  copyUrl: '复制地址',
  copied: '已复制',
  devices: '已授权设备',
  deviceCount: '台',
  revoke: '撤销',
  revokeAll: '撤销全部设备',
  revokeAllConfirm: '确定要撤销全部设备吗？所有手机将需要重新配对。',
  revoked: '已撤销',
  revokeFailed: '撤销失败',
  disable: '停止远程控制',
  regenerate: '重新生成',
  expired: '配对码已过期',
  pairedSuccess: '设备已成功配对',
  credentialUsed: '当前配对凭证已使用。如需连接另一台设备，请生成新的配对码。',
  generateNew: '生成新的配对码',
  expiredNote: '为了安全，已过期的二维码和配对码不可继续使用。',
  noTicket: '当前没有可用的配对凭证',
  remoteOnly: '请在电脑上的 DSH 设置中管理远程控制',
  error: '错误',
  startError: '开启失败',
  stop: '停止',
  statusOff: '未开启',
  statusOn: '已开启',
  linkDegraded: '公网连接短暂波动，正在自动恢复…连接地址不变，无需重新扫码。',
  lastSeen: '最近使用',
  unknownDevice: '未知设备',
  drawerOpen: '打开目录',
  drawerClose: '关闭目录',
  credentialWarning: '二维码包含一次性配对凭据，请勿分享。公网访问地址本身不授予访问权限。',
  connectPhoneTitle: '手机连接',
  pairingTabOneTime: '一次性配对',
  pairingTabLong: '长期配对码',
  longTermBadge: '长期有效',
  longNoneHint: '还没有长期配对码。点击下方按钮生成后，手机可以随时用同一组码 / 二维码连接，直到你在此「换一组」。',
  generateLong: '生成长配对码',
  longRotate: '换一组新码（旧码全失效）',
  copyCode: '复制码',
  longActiveHint: '此码永久有效；扫码或输码均可连接。换一组后旧码立即失效。',
  longWarning: '长期配对码是长期有效的强凭据：任何拿到码的人都能连上你的电脑。不要截图分享或发给他人；需要时可随时「换一组」让旧码全部失效。',
  longHiddenHint: '检测到旧版长期码（仍可连接，但为安全不再显示原码）。点「换一组新码」或「设置自定义码」即可升级为新格式并重新显示。',
  longCustomTitle: '设置自定义码',
  longCustomPlaceholder: '输入自定义码',
  longCustomHint: '自定义码 6–12 位：字母 A–Z 与数字 0–9（不区分大小写，不含空格或符号）。',
  longCustomInvalid: '自定义码无效：请输入 6–12 位字母或数字（A–Z、0–9）。',
  longCustomUse: '使用自定义码',
  longRotateNote: '换一组 / 自定义只影响“未来”的新配对：已连接设备不受影响（如需强制下线请用「撤销全部设备」）。',
  diagnostics: '诊断信息',
  waiting: '已等待',
  downloading: '正在下载 Cloudflare Tunnel',
  downloadedSoFar: '已下载',
  of: '/',
  verifying: '正在校验 Cloudflare Tunnel…',
  startingConn: '正在启动安全连接…',
  connectingTunnel: '正在建立安全连接…',
  waitingAddr: '正在等待公网地址…',
  viaSystemProxy: '通过系统代理',
  viaCustomProxy: '通过自定义代理',
  viaEnvProxy: '通过环境代理',
  viaDirect: '直接连接',
  sourceSwitching: '官方源下载较慢，正在尝试备用镜像…',
  sourceOfficialLabel: '官方源',
  sourceMirrorLabel: '备用镜像',
  downloadSettings: '下载设置',
  downloadNetwork: '下载网络',
  networkAuto: '自动（推荐）',
  networkDirect: '直连',
  networkCustom: '自定义代理',
  customProxyUrl: '自定义代理地址',
  customProxyPlaceholder: 'http://127.0.0.1:7890',
  customProxyRequired: '请填写自定义代理地址',
  customProxyInvalid: '代理地址格式无效，仅支持 http:// 或 https://',
  customProxyCredentials: '当前版本不支持在自定义代理设置中保存账号密码，请使用 HTTPS_PROXY 环境变量。',
  downloadSource: '下载源',
  sourceAuto: '自动（推荐）',
  sourceOfficial: '仅官方源',
  sourceMirror: '备用镜像',
  sourceNote: '自动模式优先使用 Cloudflare 官方源。官方源不可用时会尝试备用下载镜像。所有下载文件均会经过完整性和数字签名校验。',
  saveSettings: '保存设置',
  settingsSaved: '已保存',
  settingsSaving: '正在保存…',
  updateTitle: '插件更新',
  currentVersion: '当前版本',
  checkUpdate: '检查更新',
  checkingUpdate: '正在检查更新…',
  updateAvailable: '发现新版本',
  upToDate: '当前已经是最新版本',
  lastCheckAt: '上次检查',
  updateNotesUnavailable: '更新说明暂时无法加载',
  updateNow: '立即更新',
  later: '稍后',
  updatePostponed: '已选择稍后更新',
  updating: '正在更新…',
  updateInstalled: '更新已安装，需要重启 DSH 后生效',
  updateFailed: '更新失败，当前版本继续运行',
  updateUnavailable: '检查更新失败，请稍后重试',
  pickerTitle: '选择工作区目录',
  pickerSelectCurrent: '选择当前目录',
  pickerCancel: '取消',
  pickerLoading: '加载中…',
  pickerRetry: '重试',
  pickerUnreadable: '无法读取该目录，请检查权限后重试。',
  pickerInternal: '读取目录时发生错误，请重试。',
  pickerComputer: '此电脑',
  pickerBack: '返回',
  pickerTruncated: '文件夹过多，仅显示开头部分。',
}

export const en: Record<RemoteAccessKey, string> = {
  nav: 'Remote Control',
  offTitle: 'Remote Control',
  offHint: 'Securely control this DSH instance from your phone, tablet, or another browser.',
  enable: 'Enable remote control',
  preparing: 'Preparing a secure connection…',
  checking: 'Checking cloudflared…',
  creating: 'Creating the Cloudflare Tunnel…',
  onTitle: 'Remote Control',
  scanHint: 'Scan to pair securely',
  orManual: 'Or enter the pairing code',
  manualCode: 'Pairing code',
  expiresIn: 'Expires in',
  publicUrl: 'Public address',
  copyUrl: 'Copy address',
  copied: 'Copied',
  devices: 'Authorized devices',
  deviceCount: '',
  revoke: 'Revoke',
  revokeAll: 'Revoke all devices',
  revokeAllConfirm: 'Revoke every device? All phones will need to pair again.',
  revoked: 'Revoked',
  revokeFailed: 'Revocation failed',
  disable: 'Stop remote control',
  regenerate: 'Regenerate',
  expired: 'Pairing code expired',
  pairedSuccess: 'Device paired successfully',
  credentialUsed: 'This pairing credential has been used. Generate a new pairing code to connect another device.',
  generateNew: 'Generate new pairing code',
  expiredNote: 'For security, the expired QR code and pairing code can no longer be used.',
  noTicket: 'No pairing credential is available',
  remoteOnly: 'Manage remote control from the DSH settings on your computer',
  error: 'Error',
  startError: 'Failed to enable',
  stop: 'Stop',
  statusOff: 'Off',
  statusOn: 'On',
  linkDegraded: 'The public link is briefly unstable and is recovering automatically… the address is unchanged, no re-pairing needed.',
  lastSeen: 'Last used',
  unknownDevice: 'Unknown device',
  drawerOpen: 'Open directory',
  drawerClose: 'Close directory',
  credentialWarning: 'The QR code contains a one-time pairing credential — never share it. The public address itself grants no access.',
  connectPhoneTitle: 'Connect your phone',
  pairingTabOneTime: 'One-time pairing',
  pairingTabLong: 'Long-term code',
  longTermBadge: 'Long-term',
  longNoneHint: 'No long-term code yet. Generate one below and your phone can keep connecting with the same code / QR until you rotate it here.',
  generateLong: 'Generate long-term code',
  longRotate: 'Get a new code (the old one stops working)',
  copyCode: 'Copy code',
  longActiveHint: 'Valid forever — connect by scanning or by typing the code. Rotating invalidates the old code immediately.',
  longWarning: 'A long-term code is a standing credential: anyone holding it can reach your computer. Never screenshot or share it; rotate it anytime to invalidate the old one.',
  longHiddenHint: 'A legacy-format long-term code is active and still connects, but for security its plaintext is no longer shown. Rotate or set a custom code to upgrade to the current format and display it again.',
  longCustomTitle: 'Set a custom code',
  longCustomPlaceholder: 'Type a custom code',
  longCustomHint: 'Custom codes are 6–12 characters: letters A–Z and digits 0–9 (case-insensitive; no spaces or symbols).',
  longCustomInvalid: 'Invalid custom code: use 6–12 letters or digits (A–Z, 0–9).',
  longCustomUse: 'Use this code',
  longRotateNote: 'Rotating / setting a custom code only affects FUTURE pairing attempts: already-connected devices keep working (force them offline with "Revoke all devices").',
  diagnostics: 'Diagnostics',
  waiting: 'waiting',
  downloading: 'Downloading Cloudflare Tunnel',
  downloadedSoFar: 'Downloaded',
  of: 'of',
  verifying: 'Verifying Cloudflare Tunnel…',
  startingConn: 'Starting the secure connection…',
  connectingTunnel: 'Establishing the secure connection…',
  waitingAddr: 'Waiting for the public address…',
  viaSystemProxy: 'via system proxy',
  viaCustomProxy: 'via custom proxy',
  viaEnvProxy: 'via environment proxy',
  viaDirect: 'direct connection',
  sourceSwitching: 'The official source is slow; trying a backup mirror…',
  sourceOfficialLabel: 'official source',
  sourceMirrorLabel: 'backup mirror',
  downloadSettings: 'Download settings',
  downloadNetwork: 'Download network',
  networkAuto: 'Auto (recommended)',
  networkDirect: 'Direct',
  networkCustom: 'Custom proxy',
  customProxyUrl: 'Custom proxy URL',
  customProxyPlaceholder: 'http://127.0.0.1:7890',
  customProxyRequired: 'Enter the custom proxy URL',
  customProxyInvalid: 'Invalid proxy URL — only http:// and https:// are supported',
  customProxyCredentials: 'This version cannot store credentials in the custom proxy setting; use the HTTPS_PROXY environment variable instead.',
  downloadSource: 'Download source',
  sourceAuto: 'Auto (recommended)',
  sourceOfficial: 'Official source only',
  sourceMirror: 'Backup mirrors',
  sourceNote: 'Auto mode prefers the official Cloudflare source. When it is unavailable, verified backup mirrors are tried. Every downloaded file passes full integrity and digital-signature verification.',
  saveSettings: 'Save settings',
  settingsSaved: 'Saved',
  settingsSaving: 'Saving…',
  updateTitle: 'Plugin updates',
  currentVersion: 'Current version',
  checkUpdate: 'Check for updates',
  checkingUpdate: 'Checking for updates…',
  updateAvailable: 'New version available',
  upToDate: 'You are up to date',
  lastCheckAt: 'Last checked',
  updateNotesUnavailable: 'Release notes are unavailable right now',
  updateNow: 'Update now',
  later: 'Later',
  updatePostponed: 'Update postponed',
  updating: 'Updating…',
  updateInstalled: 'Update installed — restart DSH to apply',
  updateFailed: 'Update failed — the current version keeps running',
  updateUnavailable: 'Update check failed — try again later',
  pickerTitle: 'Select Workspace Directory',
  pickerSelectCurrent: 'Select this directory',
  pickerCancel: 'Cancel',
  pickerLoading: 'Loading…',
  pickerRetry: 'Retry',
  pickerUnreadable: 'Cannot read this directory; check permissions and try again.',
  pickerInternal: 'An error occurred while reading the directory; try again.',
  pickerComputer: 'This computer',
  pickerBack: 'Back',
  pickerTruncated: 'Too many folders to list; only the beginning is shown.',
}

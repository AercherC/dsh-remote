/**
 * Wire types shared by the host RPC surface and the browser client.
 * This module is PURE (no node imports) so the client bundle can import it
 * freely; every host-side value here is type-only or a static table.
 */
/**
 * D2.1 custom long-code bounds, mirrored from the root pairing-long module so
 * the client can pre-validate before calling the mutation RPC (the host still
 * re-validates authoritatively). `wire.test` asserts these stay in sync with
 * the vendored root constants.
 */
export const PAIRING_LONG_CODE_MIN = 6;
export const PAIRING_LONG_CODE_MAX = 12;
export const PAIRING_LONG_CODE_ALPHABET_SOURCE = 'A-Z0-9';
/** Client-side shape check for a custom long code (6–12 chars, A–Z + 0–9). */
export function isPairingLongCodeShape(value) {
    const code = value.trim().toUpperCase();
    if (code.length < PAIRING_LONG_CODE_MIN || code.length > PAIRING_LONG_CODE_MAX)
        return false;
    return /^[A-Z0-9]+$/.test(code);
}
/**
 * The QR payload for one pairing ticket: `https://<origin>/pair#<secret>`.
 *
 * The secret travels ONLY in the URL fragment — never in the query string,
 * the HTML source, logs, or localStorage. The fragment is stripped from the
 * address bar by the /pair page before it posts the claim.
 */
export function pairingQrContent(publicUrl, secret) {
    return `${publicUrl}/pair#${secret}`;
}
/** Every stable error code the plugin can emit (host + client use this set). */
export const REMOTE_ERROR_CODE_SET = new Set([
    'unsupported-platform', 'config-conflict', 'download-failed', 'proxy-invalid', 'proxy-connect-failed',
    'source-too-slow',
    'checksum-mismatch', 'size-mismatch',
    'binary-rejected', 'version-mismatch', 'start-timeout', 'spawn-failed', 'exit-before-ready',
    'connection-lost', 'internal', 'startup-failed', 'tunnel-not-ready', 'persist-failed', 'bad-request',
    'update-unavailable', 'update-failed', 'update-version-mismatch', 'update-in-progress', 'cli-not-found',
]);
/** User copy for every error code (zh + en). NEVER an empty string. */
export const REMOTE_ERROR_MESSAGES = {
    'unsupported-platform': { zh: '当前平台暂未支持 Cloudflare Tunnel 组件', en: 'Cloudflare Tunnel is not supported on this platform yet' },
    'config-conflict': {
        zh: '检测到现有 Cloudflare 配置。为避免修改你的配置，本次未启动远程访问。',
        en: 'An existing Cloudflare configuration was detected. Remote access was not started to avoid modifying your configuration.',
    },
    'download-failed': {
        zh: '无法下载 Cloudflare Tunnel。已尝试当前可用的网络路径，请检查网络或下载网络设置后重试。',
        en: 'Could not download Cloudflare Tunnel. The available network paths were tried; check the network or the download network setting and try again.',
    },
    'proxy-invalid': { zh: '代理配置无效，请检查下载网络设置。', en: 'The proxy configuration is invalid; check the download network setting.' },
    'proxy-connect-failed': {
        zh: '无法通过代理下载 Cloudflare Tunnel。请检查代理地址或网络后重试。',
        en: 'Could not download Cloudflare Tunnel through the proxy. Check the proxy address or the network and try again.',
    },
    // Internal fallback REASON, not a final user error (the route loop converts
    // an exhausted all-too-slow run into download-failed); the copy is a safe
    // defense if it ever reaches the surface.
    'source-too-slow': {
        zh: '下载源速度过慢，已尝试切换备用下载镜像。',
        en: 'The download source was too slow; a backup mirror was tried instead.',
    },
    'checksum-mismatch': { zh: 'Cloudflare Tunnel 组件下载校验失败，已停止启动。', en: 'The downloaded Cloudflare Tunnel component failed verification; startup was stopped.' },
    'size-mismatch': { zh: 'Cloudflare Tunnel 组件下载校验失败，已停止启动。', en: 'The downloaded Cloudflare Tunnel component failed verification; startup was stopped.' },
    'binary-rejected': { zh: 'Cloudflare Tunnel 组件校验失败，已停止启动。', en: 'The Cloudflare Tunnel component failed verification; startup was stopped.' },
    'version-mismatch': { zh: 'Cloudflare Tunnel 组件版本校验失败，已停止启动。', en: 'The Cloudflare Tunnel component version failed verification; startup was stopped.' },
    'start-timeout': { zh: 'Cloudflare Tunnel 在规定时间内未就绪，请检查网络后重试。', en: 'Cloudflare Tunnel did not become ready in time; check the network and try again.' },
    'spawn-failed': { zh: 'Cloudflare Tunnel 组件启动失败，请重试。', en: 'Failed to start the Cloudflare Tunnel component; try again.' },
    'exit-before-ready': { zh: 'Cloudflare Tunnel 连接建立失败，请重试。', en: 'The Cloudflare Tunnel connection failed to establish; try again.' },
    'connection-lost': { zh: '远程连接已断开。', en: 'The remote connection was lost.' },
    'internal': { zh: '发生未预期的内部错误。请查看诊断信息后重试。', en: 'An unexpected internal error occurred. Check the diagnostics and try again.' },
    'startup-failed': { zh: '远程访问组件启动失败，请查看本地日志', en: 'The remote-access component failed to start; see local logs' },
    'tunnel-not-ready': { zh: '请先开启远程控制', en: 'Enable remote control first' },
    'persist-failed': { zh: '操作失败，请重试', en: 'The operation failed; try again' },
    'bad-request': { zh: '请求无效', en: 'Invalid request' },
    'update-unavailable': { zh: '暂时无法检查更新，请稍后再试', en: 'Update check is unavailable right now; try again later' },
    'update-failed': { zh: '更新失败，当前版本继续运行，请重试', en: 'Update failed — the current version keeps running; try again' },
    'update-version-mismatch': { zh: '更新后版本校验失败，当前版本继续运行', en: 'Version verification failed after the update; the current version keeps running' },
    'update-in-progress': { zh: '正在更新中，请稍候', en: 'An update is already in progress' },
    'cli-not-found': { zh: '未找到 DSH 命令行工具，无法更新', en: 'The DSH CLI was not found; cannot update' },
};
/* ---------- R14: mobile workspace directory browse ---------- */
/**
 * Logical connection-RPC channel for the mobile workspace directory browse.
 * Deliberately NOT under the `/dsh-remote` prefix: the gateway denies public
 * requests by `path.startsWith('/dsh-remote')` (defense in depth for the
 * management plane), and this channel must stay reachable from paired phones
 * through the gateway — still behind the device-session / pairing
 * authentication the gateway applies to every public request.
 */
export const WORKSPACE_BROWSE_CHANNEL = '/dsh-workspace-browse';

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PairingService } from './pairing.js'
import type { LongPairingStore } from './pairing-long.js'
import { LONG_PAIRING_CODE_MAX, LONG_PAIRING_CODE_MIN, PAIRING_CODE_FORMAT_RE, PAIRING_CODE_FORMAT_SOURCE } from './pairing-long.js'
import type { DeviceSessionStore, DeviceSessionError } from './device-session.js'
import { DEVICE_SESSION_COOKIE } from './device-session.js'
import type { GatewayLogger } from './logger.js'
import { safePath } from './logger.js'

/**
 * Gateway-owned pairing surface.
 *
 *   GET  /pair        minimal safe page shown to unauthenticated browsers
 *   POST /pair/claim  redeem a pairing credential (one-time ticket secret or
 *                     manual code, OR — when a long-term code is configured —
 *                     the durable long code/secret) and mint a long-lived
 *                     device session cookie
 *
 * Both routes run AFTER the gateway's Host/Origin/sec-fetch-site policy, so
 * a cross-site claim is already impossible. The claim endpoint deliberately
 * reads credentials only from the JSON body: query-string claims are never
 * accepted (and the future QR deep link will use the URL fragment
 * `https://<host>/pair#<secret>`, which browsers never send to the server).
 *
 * Failure responses are intentionally uniform: 403 for any unknown/expired/
 * mismatched credential (nothing reveals whether a ticket exists or how close
 * a code was), 429 for rate limiting (no Retry-After detail), and 400/405/415
 * for request-shape errors only. Logs carry sanitized event names only —
 * never secrets, codes, cookies, or token hashes.
 */

/**
 * Optional GitHub Device-Flow login on the /pair page (R05).
 *
 * The gateway stays transport-only: this interface is provided by the
 * plugin's GitHubAuthService, and the pairing surface merely renders the
 * flow state and mints OUR Device Session (never a GitHub token) when the
 * flow reports `ready`. Everything here is bounded server-side (concurrent
 * flows, start rate, TTL) by the implementing service.
 */
export interface PairingGithubFlowStart {
  readonly flowId: string
  readonly verificationUri: string
  readonly userCode: string
  readonly expiresAt: number
  readonly intervalMs: number
}

export type PairingGithubPollResult =
  | { readonly status: 'pending'; readonly intervalMs: number }
  | { readonly status: 'slow_down'; readonly intervalMs: number }
  | { readonly status: 'ready'; readonly login?: string }
  | { readonly status: 'denied' | 'expired' | 'wrong-user' | 'not-found' }

export interface PairingGithubRoutes {
  /** Whether the host has bound an allowed GitHub identity AND configured an OAuth App. */
  readonly enabled: boolean
  start(): Promise<PairingGithubFlowStart | { readonly error: 'rate-limited' | 'unavailable' }>
  poll(flowId: string): Promise<PairingGithubPollResult | { readonly error: 'bad-request' }>
  cancel(flowId: string): Promise<boolean>
}

export interface PairingRouteDependencies {
  readonly pairing: PairingService
  readonly sessions: DeviceSessionStore
  /** Session TTL in milliseconds; used to size the cookie Max-Age. */
  readonly sessionTtlMs: number
  readonly logger: GatewayLogger
  readonly now?: () => Date
  /** Optional GitHub Device-Flow login; absent = pairing-code only (kept from D1; root cleanup is a separate task). */
  readonly github?: PairingGithubRoutes
  /**
   * Optional durable long-term pairing credential (D2). When present, a claim
   * that misses every one-time ticket falls back to the long code (manual
   * code or QR secret), which never expires until the user rotates it. The
   * fallback runs AFTER the shared claim budget, so it can never bypass rate
   * limiting.
   */
  readonly long?: LongPairingStore
  /**
   * Optional resolver for a browser-authenticated root URL. After a successful
   * claim the phone is bounced to this URL instead of bare `/`: DSH's web
   * server requires its OWN browser-session cookie (minted by the `?token=`
   * launch URL), which the gateway's device-session cookie cannot satisfy. When
   * the host cannot supply one (e.g. tests) the page falls back to `/`.
   */
  readonly resolveAuthRoot?: () => string | undefined
}

export interface PairingRoutes {
  /** Returns true when the request was handled by the pairing surface. */
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>
  /** Pairing HTML for an unauthenticated HTML navigation, or undefined for API/WS traffic. */
  pageFor(request: IncomingMessage): string | undefined
}

/**
 * The /pair page. GitHub Device-Flow login markup is included only when the
 * host configured + bound an identity; all remote-controlled values (the
 * verification URI and user code) are rendered with textContent, never
 * innerHTML, and navigation is the only cross-origin interaction.
 */
function pairPageHtml(githubEnabled: boolean): string {
  const githubButton = githubEnabled
    ? '<button id="github" type="button">使用 GitHub 登录</button>\n'
      + '    <div id="githubBox" hidden>\n'
      + '      <p style="text-align:center;font-size:22px;letter-spacing:3px;color:#e6e8ec" id="githubCode"></p>\n'
      + '      <p style="font-size:13px;text-align:center"><a id="githubLink" href="#" target="_blank" rel="noopener noreferrer">打开 GitHub 授权页面</a></p>\n'
      + '      <p style="font-size:12px;line-height:1.6;color:#eab308;margin:10px 0 0">只批准由你本人刚刚在当前设备发起的 GitHub 验证。不要输入或批准他人发送给你的设备验证码。</p>\n'
      + '    </div>\n'
      + '    <p id="or" hidden>或使用配对码</p>'
    : ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>设备配对 · DSH Remote Gateway</title>
  <style>
    :root{color-scheme:dark light;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1115;color:#e6e8ec}
    main{width:min(420px,calc(100vw - 40px));padding:32px 26px;border:1px solid #2a2f3a;border-radius:18px;background:#161a22}
    h1{font-size:20px;margin:0 0 12px}
    p{font-size:14px;line-height:1.7;color:#9aa3b2;margin:8px 0}
    strong{color:#e6e8ec}
    label{display:block;font-size:13px;color:#9aa3b2;margin:14px 0 6px}
    input{width:100%;box-sizing:border-box;padding:10px 12px;font-size:18px;letter-spacing:4px;text-align:center;
      border:1px solid #2a2f3a;border-radius:10px;background:#0f1115;color:#e6e8ec;font-variant-numeric:tabular-nums}
    button{width:100%;margin-top:16px;padding:11px;font-size:15px;font-weight:600;color:#fff;
      background:#2f6fed;border:none;border-radius:10px;cursor:pointer}
    button:disabled{opacity:.5;cursor:default}
    [hidden]{display:none!important}
    #error{color:#f87171;background:rgba(248,113,113,.08);border-radius:10px;padding:8px 12px}
  </style>
</head>
<body>
  <main>
    <h1>配对设备</h1>
    ${githubButton}
    <p id="status">正在安全配对…</p>
    <p id="error" hidden></p>
    <form id="manual" hidden>
      <label for="code">手动配对码</label>
      <input id="code" inputmode="text" autocomplete="one-time-code" maxlength="${LONG_PAIRING_CODE_MAX}" placeholder="输入 6–12 位配对码">
      <button type="submit">完成配对</button>
    </form>
  </main>
  <script>
    (function () {
      'use strict';
      var statusEl = document.getElementById('status');
      var errorEl = document.getElementById('error');
      var form = document.getElementById('manual');
      var input = document.getElementById('code');
      function fail(message) {
        statusEl.hidden = true;
        errorEl.textContent = message;
        errorEl.hidden = false;
        form.hidden = false;
        if (github) { github.disabled = false; orEl.hidden = false; githubBox.hidden = true; }
      }
      function claim(payload) {
        return fetch('/pair/claim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin'
        }).then(function (response) {
          if (response.ok) {
            return response.json().then(function (body) {
              location.href = (body && body.redirect) || '/';
            });
          }
          return response.json().then(function (body) {
            throw new Error(body && body.error === 'try-later'
              ? '尝试过于频繁，请稍后再试'
              : body && body.error === 'device-limit'
                ? '已授权设备数量已达上限，请先在电脑上撤销一台设备'
                : '配对码无效或已过期');
          });
        });
      }
      // QR deep link: the secret lives ONLY in the fragment (browsers never
      // send it to the server). Clear the fragment FIRST, then claim — the
      // secret never appears in the address bar, history, Referer, or logs.
      var raw = location.hash;
      if (raw.length > 1) {
        var secret = raw.slice(1);
        history.replaceState(null, '', location.pathname + location.search);
        if (secret.length > 0 && secret.length <= 128 && /^[A-Za-z0-9_-]+$/.test(secret)) {
          claim({ secret: secret }).catch(function (error) {
            fail(error instanceof Error ? error.message : '配对失败，请重试');
          });
          return;
        }
      }
      fail('请输入电脑上显示的配对码');
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var code = input.value.trim().toUpperCase();
        if (!/^[${PAIRING_CODE_FORMAT_SOURCE}]{${LONG_PAIRING_CODE_MIN},${LONG_PAIRING_CODE_MAX}}$/.test(code)) {
          fail('配对码格式不正确');
          return;
        }
        statusEl.hidden = false;
        statusEl.textContent = '正在安全配对…';
        errorEl.hidden = true;
        form.hidden = true;
        if (github) { github.hidden = true; orEl.hidden = true; githubBox.hidden = true; }
        claim({ code: code }).catch(function (error) {
          fail(error instanceof Error ? error.message : '配对失败，请重试');
        });
      });
      // Optional GitHub Device-Flow login (rendered only when the host bound
      // an identity and configured an OAuth App). Short-lived and bounded
      // server-side; polling respects authorization_pending/slow_down and
      // every remote value is written with textContent only.
      var github = document.getElementById('github');
      var githubBox = document.getElementById('githubBox');
      var githubCode = document.getElementById('githubCode');
      var githubLink = document.getElementById('githubLink');
      var orEl = document.getElementById('or');
      if (github) {
        github.addEventListener('click', function () {
          github.disabled = true;
          errorEl.hidden = true;
          form.hidden = true;
          orEl.hidden = true;
          githubBox.hidden = true;
          statusEl.hidden = false;
          statusEl.textContent = '正在获取 GitHub 授权…';
          fetch('/pair/github/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
            credentials: 'same-origin'
          }).then(function (response) {
            return response.json().then(function (body) {
              return { ok: response.ok, body: body };
            });
          }).then(function (res) {
            if (!res.ok) {
              throw new Error(res.body && res.body.error === 'try-later'
                ? '尝试过于频繁，请稍后再试'
                : 'GitHub 登录暂时不可用，请稍后再试');
            }
            statusEl.hidden = true;
            githubCode.textContent = res.body.userCode;
            githubLink.href = res.body.verificationUri;
            githubBox.hidden = false;
            return pollGithub(res.body);
          }).then(function (body) {
            location.href = (body && body.redirect) || '/';
          }).catch(function (error) {
            github.disabled = false;
            githubBox.hidden = true;
            fail(error instanceof Error ? error.message : 'GitHub 登录失败，请重试');
          });
        });
        function pollGithub(flow) {
          var delay = flow.intervalMs > 0 ? flow.intervalMs : 5;
          function tick() {
            return fetch('/pair/github/poll', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ flowId: flow.flowId }),
              credentials: 'same-origin'
            }).then(function (response) {
              return response.json().then(function (body) {
                return { ok: response.ok, body: body };
              });
            }).then(function (res) {
              var body = res.body || {};
              if (res.ok && body.status === 'ready') return body;
              if (res.ok && (body.status === 'pending' || body.status === 'slow_down')) {
                if (body.intervalMs > 0) delay = body.intervalMs;
                return new Promise(function (resolve) { setTimeout(resolve, delay * 1000); }).then(tick);
              }
              if (body.error === 'wrong-user') throw new Error('该 GitHub 账号未绑定，无法登录');
              if (body.error === 'denied') throw new Error('授权已被拒绝');
              if (body.error === 'expired') throw new Error('授权已过期，请重新开始');
              if (body.error === 'try-later') throw new Error('尝试过于频繁，请稍后再试');
              if (body.status === 'not-found') throw new Error('登录已失效，请重新开始');
              throw new Error('GitHub 登录失败，请重试');
            });
          }
          return tick();
        }
      }
    })();
  </script>
</body>
</html>`
}

const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  // Inline script is required by the pairing page's fragment auto-claim;
  // connect-src 'self' limits it to same-origin fetches. No secrets are
  // ever embedded in this page or its script.
  'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
} as const

const CLAIM_BODY_LIMIT = 4096
const SECRET_MAX_LENGTH = 128
const CODE_MAX_LENGTH = 16
// Manual-entry shape: one-time tickets (8 chars) and long codes (custom
// 6–12 chars) share the same confusion-reduced alphabet; the shared regex
// comes from pairing-long so it can never drift from the store's bounds.
const CODE_PATTERN = PAIRING_CODE_FORMAT_RE

function send(response: ServerResponse, status: number, contentType: string, body: string, headOnly: boolean): void {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-length': Buffer.byteLength(body),
    'content-type': contentType,
  })
  response.end(headOnly ? undefined : body)
}

function sendEmpty(response: ServerResponse, status: number): void {
  response.writeHead(status, { ...SECURITY_HEADERS, 'content-length': '0' })
  response.end()
}

async function readJsonBody(request: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > limit) throw new Error('body-too-large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export function createPairingRoutes(dependencies: PairingRouteDependencies): PairingRoutes {
  const { pairing, sessions, sessionTtlMs, logger, github, long, resolveAuthRoot } = dependencies
  const cookieMaxAgeSeconds = Math.max(1, Math.floor(sessionTtlMs / 1000))

  async function handleClaim(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = safePath(request.url)
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST')
      sendEmpty(response, 405)
      return
    }
    const contentType = typeof request.headers['content-type'] === 'string'
      ? request.headers['content-type'].split(';', 1)[0]?.trim().toLowerCase()
      : undefined
    if (contentType !== 'application/json') {
      logger.warn({ event: 'pair_claim_bad_request', method: request.method, path, status: 415 })
      send(response, 415, 'application/json; charset=utf-8', '{"error":"content-type-must-be-json"}', false)
      return
    }
    let parsed: unknown
    try {
      parsed = await readJsonBody(request, CLAIM_BODY_LIMIT)
    } catch {
      logger.warn({ event: 'pair_claim_bad_request', method: request.method, path, status: 400 })
      send(response, 400, 'application/json; charset=utf-8', '{"error":"invalid-request"}', false)
      return
    }
    if (typeof parsed !== 'object' || parsed === null) {
      logger.warn({ event: 'pair_claim_bad_request', method: request.method, path, status: 400 })
      send(response, 400, 'application/json; charset=utf-8', '{"error":"invalid-request"}', false)
      return
    }
    const body = parsed as Record<string, unknown>
    const hasSecret = body.secret !== undefined
    const hasCode = body.code !== undefined
    if (hasSecret === hasCode) {
      logger.warn({ event: 'pair_claim_bad_request', method: request.method, path, status: 400 })
      send(response, 400, 'application/json; charset=utf-8', '{"error":"exactly-one-credential-required"}', false)
      return
    }
    let credential: string
    if (hasSecret) {
      if (typeof body.secret !== 'string' || body.secret.length === 0 || body.secret.length > SECRET_MAX_LENGTH) {
        logger.warn({ event: 'pair_claim_bad_request', method: request.method, path, status: 400 })
        send(response, 400, 'application/json; charset=utf-8', '{"error":"invalid-request"}', false)
        return
      }
      credential = body.secret
    } else {
      if (typeof body.code !== 'string' || body.code.length === 0 || body.code.length > CODE_MAX_LENGTH) {
        logger.warn({ event: 'pair_claim_bad_request', method: request.method, path, status: 400 })
        send(response, 400, 'application/json; charset=utf-8', '{"error":"invalid-request"}', false)
        return
      }
      credential = body.code.trim().toUpperCase()
      if (!CODE_PATTERN.test(credential)) {
        logger.warn({ event: 'pair_claim_bad_request', method: request.method, path, status: 400 })
        send(response, 400, 'application/json; charset=utf-8', '{"error":"invalid-request"}', false)
        return
      }
    }

    // Mint a device session from a successfully-authenticated credential and
    // answer 200. Shared by the one-time ticket path and the durable long-code
    // path (D2) so device-limit / cookie / redirect semantics never diverge.
    const mintSession = async (event: string): Promise<void> => {
      const name = typeof body.name === 'string' ? body.name : undefined
      const ua = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined
      let created: { rawToken: string }
      try {
        created = await sessions.create(name, ua)
      } catch (error) {
        if ((error as DeviceSessionError).code === 'device-limit') {
          logger.warn({ event: 'pair_claim_device_limit', method: request.method, path, status: 403 })
          send(response, 403, 'application/json; charset=utf-8', '{"error":"device-limit"}', false)
          return
        }
        logger.warn({ event: 'pair_claim_internal', method: request.method, path, status: 500 })
        send(response, 500, 'application/json; charset=utf-8', '{"error":"internal"}', false)
        return
      }
      response.setHeader('set-cookie', [
        `${DEVICE_SESSION_COOKIE}=${created.rawToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${String(cookieMaxAgeSeconds)}`,
      ])
      logger.info({ event, method: request.method, path, status: 200 })
      const authRoot = resolveAuthRoot?.()
      send(response, 200, 'application/json; charset=utf-8',
        authRoot === undefined ? '{"ok":true}' : JSON.stringify({ ok: true, redirect: authRoot }), false)
    }

    // Claim protection is the PairingService's GLOBAL short-window rate limit
    // only. Per-source locking was removed (R03): behind a Quick Tunnel every
    // public request arrives from the local cloudflared peer, so per-source
    // failures would let five wrong guesses lock out the real user. Forwarded
    // headers remain untrusted for any security decision.
    const outcome = pairing.claim(credential)
    if (!outcome.ok) {
      // A rate-limited attempt NEVER falls through to the long code: the long
      // code is durable and shares this same global budget, so bypassing it
      // here would defeat brute-force protection for both credential kinds.
      if (outcome.reason === 'rate-limited') {
        logger.warn({ event: 'pair_claim_rate_limited', method: request.method, path, status: 429 })
        send(response, 429, 'application/json; charset=utf-8', '{"error":"try-later"}', false)
        return
      }
      // Rejected by every one-time ticket → the durable long code (manual code
      // or QR secret) is the fallback. match() never consumes, never expires.
      if (long !== undefined && long.match(credential)) {
        await mintSession('pair_claim_long_succeeded')
        return
      }
      logger.warn({ event: 'pair_claim_rejected', method: request.method, path, status: 403 })
      send(response, 403, 'application/json; charset=utf-8', '{"error":"invalid-credential"}', false)
      return
    }
    await mintSession('pair_claim_succeeded')
  }

  const JSON_CT = 'application/json; charset=utf-8'

  function githubUnavailable(request: IncomingMessage, response: ServerResponse, status: number, error: string): void {
    logger.warn({ event: 'pair_github_rejected', method: request.method, path: safePath(request.url), status })
    send(response, status, JSON_CT, JSON.stringify({ error }), false)
  }

  async function handleGithubStart(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (github === undefined || !github.enabled) {
      sendEmpty(response, 404)
      return
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST')
      sendEmpty(response, 405)
      return
    }
    const result = await github.start()
    if ('error' in result) {
      githubUnavailable(request, response, result.error === 'rate-limited' ? 429 : 503,
        result.error === 'rate-limited' ? 'try-later' : 'unavailable')
      return
    }
    logger.info({ event: 'pair_github_flow_started', method: request.method, path: safePath(request.url), status: 200 })
    send(response, 200, JSON_CT, JSON.stringify(result), false)
  }

  async function handleGithubPoll(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (github === undefined || !github.enabled) {
      sendEmpty(response, 404)
      return
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST')
      sendEmpty(response, 405)
      return
    }
    let parsed: unknown
    try {
      parsed = await readJsonBody(request, CLAIM_BODY_LIMIT)
    } catch {
      send(response, 400, JSON_CT, '{"error":"invalid-request"}', false)
      return
    }
    const body = (typeof parsed === 'object' && parsed !== null) ? parsed as Record<string, unknown> : null
    const flowId = body !== null && typeof body.flowId === 'string' && body.flowId.length > 0 && body.flowId.length <= 128
      ? body.flowId
      : undefined
    if (flowId === undefined) {
      send(response, 400, JSON_CT, '{"error":"invalid-request"}', false)
      return
    }
    const result = await github.poll(flowId)
    if ('error' in result) {
      send(response, 400, JSON_CT, '{"error":"invalid-request"}', false)
      return
    }
    if (result.status === 'ready') {
      const ua = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined
      const displayName = result.login === undefined || result.login === ''
        ? 'GitHub'
        : `GitHub (${result.login})`
      let created: { rawToken: string }
      try {
        created = await sessions.create(displayName, ua)
      } catch (error) {
        if ((error as DeviceSessionError).code === 'device-limit') {
          githubUnavailable(request, response, 403, 'device-limit')
          return
        }
        logger.warn({ event: 'pair_github_internal', method: request.method, path: safePath(request.url), status: 500 })
        send(response, 500, JSON_CT, '{"error":"internal"}', false)
        return
      }
      response.setHeader('set-cookie', [
        `${DEVICE_SESSION_COOKIE}=${created.rawToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${String(cookieMaxAgeSeconds)}`,
      ])
      logger.info({ event: 'pair_github_flow_ready', method: request.method, path: safePath(request.url), status: 200 })
      const authRoot = resolveAuthRoot?.()
      send(response, 200, JSON_CT,
        authRoot === undefined ? '{"status":"ready","ok":true}' : JSON.stringify({ status: 'ready', ok: true, redirect: authRoot }), false)
      return
    }
    if (result.status === 'pending' || result.status === 'slow_down') {
      send(response, 200, JSON_CT, JSON.stringify({ status: result.status, intervalMs: result.intervalMs }), false)
      return
    }
    // Terminal rejections: wrong-user/denied/expired → 403, unknown flow → 404.
    const status = result.status === 'not-found' ? 404 : 403
    githubUnavailable(request, response, status, result.status)
  }

  async function handleGithubCancel(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (github === undefined || !github.enabled) {
      sendEmpty(response, 404)
      return
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST')
      sendEmpty(response, 405)
      return
    }
    let parsed: unknown
    try {
      parsed = await readJsonBody(request, CLAIM_BODY_LIMIT)
    } catch {
      send(response, 400, JSON_CT, '{"error":"invalid-request"}', false)
      return
    }
    const body = (typeof parsed === 'object' && parsed !== null) ? parsed as Record<string, unknown> : null
    const flowId = body !== null && typeof body.flowId === 'string' ? body.flowId : undefined
    if (flowId === undefined) {
      send(response, 400, JSON_CT, '{"error":"invalid-request"}', false)
      return
    }
    await github.cancel(flowId)
    send(response, 200, JSON_CT, '{"ok":true}', false)
  }

  return {
    async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
      const pathname = safePath(request.url)
      if (pathname === '/pair') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('allow', 'GET, HEAD')
          sendEmpty(response, 405)
          return true
        }
        logger.info({ event: 'pair_page', method: request.method, path: pathname, status: 200 })
        send(response, 200, 'text/html; charset=utf-8', pairPageHtml(github?.enabled === true), request.method === 'HEAD')
        return true
      }
      if (pathname === '/pair/claim') {
        await handleClaim(request, response)
        return true
      }
      if (pathname === '/pair/github/start') {
        await handleGithubStart(request, response)
        return true
      }
      if (pathname === '/pair/github/poll') {
        await handleGithubPoll(request, response)
        return true
      }
      if (pathname === '/pair/github/cancel') {
        await handleGithubCancel(request, response)
        return true
      }
      return false
    },

    pageFor(request: IncomingMessage): string | undefined {
      if (request.method !== 'GET' && request.method !== 'HEAD') return undefined
      const accept = typeof request.headers.accept === 'string' ? request.headers.accept : ''
      return accept.includes('text/html') ? pairPageHtml(github?.enabled === true) : undefined
    },
  }
}

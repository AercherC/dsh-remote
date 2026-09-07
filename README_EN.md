<div align="right">

[简体中文](README.md) · English

</div>

# dsh-remote — DSH Remote Web Gateway (enhanced)

**Keep using the DeepSeek Harness (DSH) that is running on your computer, from a phone / tablet browser:**
**check progress, continue conversations, see results, and handle actions that need your confirmation —
while projects and tools stay on the computer.**

This repository is a **derivative (fork) build** of the open-source project
[**summer1238/dsh-remote-web-gateway**](https://github.com/summer1238/dsh-remote-web-gateway)
(by summer1238, MIT licensed). Credit for the upstream work stays with the upstream project;
this repository is accountable only for its own additions. **Upstream first, then what I designed.**

---

## 1. Upstream project declaration

| | |
|---|---|
| Upstream project | [dsh-remote-web-gateway](https://github.com/summer1238/dsh-remote-web-gateway) by summer1238 |
| Upstream baseline | v0.2.2 (main @ `5b2db96`, 2026-08-28), MIT |
| This repository | A derivative built on that baseline; copyright of the additional modifications belongs to AercherC (see [LICENSE](LICENSE)) |

**Core capabilities inherited from upstream — NOT original to this repository** (they are mature and device-verified upstream, reused as-is rather than reinvented):

- Secure pairing via one-time QR code / 8-digit code (ticket: 5-minute TTL, single-use atomic claim)
- Per-device authorization: each device gets its own Device Session, revocable individually or globally (only SHA-256 hashes are stored on disk)
- One-click Cloudflare Quick Tunnel transport: established outbound by the computer — no public IP, port forwarding, or VPS
- The gateway authentication layer: a loopback-only reverse proxy that rewrites Host / Origin and transparently proxies the official DSH Web UI
- A mobile UI injection layer (only applied to real phones) and a read-only remote workspace directory picker
- Update reminders (you confirm before install; a running DSH is never restarted behind your back) with download-source / proxy network fallback
- cloudflared supply-chain checks: pinned version + SHA-256 re-verification, Windows Authenticode signature check, automatic re-download on corruption

The plugin also adapts fragments of other MIT open-source projects
([dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile) and
[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)); item-by-item attribution is in
[plugin/NOTICE](plugin/NOTICE).

> Want the original? Install the upstream npm package `dsh-remote-web-gateway`, or visit the upstream repository.
> This repository is an independent enhanced fork — it neither occupies nor replaces the upstream release channel.

---

## 2. My design & feature additions

The fork keeps the upstream architecture (transport / authentication decoupled, pairing + device sessions, loopback-only management) and adds its own work under a simple discipline: investigate first, then implement — and automated tests passing is not the same as real-device acceptance. Everything below is committed to the code in this repository and maintained with the version:

### 🪟 Windows / DSH Desktop installation experience

- [scripts/install-windows.ps1](scripts/install-windows.ps1): a one-click installer that puts the plugin into the **DSH Desktop `desktop` profile** — ASCII-path staging, automatic snapshot before touching dependencies, automatic rollback on failure, and it only goes through the official `dsh plugin` command. End-to-end "phone remote" flow verified on DSH Desktop 2.0.5 / core 0.1.2-rc.1.
- A matching Windows CI quality gate ([.github/workflows/ci.yml](.github/workflows/ci.yml)): typecheck + test + build + pack on Windows for every push / PR.

### 🔢 Long-term pairing code (alongside one-time pairing, ToDesk-style)

- The settings "Phone connection" card gains two tabs: **One-time pairing / Long-term pairing code**; the long code can be used by scanning the QR or typing the code.
- The long code is **permanent until manually reset**: hidden by default; once remote control is enabled, entering the "Long-term code" tab with no code auto-generates a random code + QR once (never auto-rotated); one click on "New code" instantly invalidates the old one.
- **Custom codes** are supported: 6–12 characters of letters (A–Z) / digits (0–9) for easy memorization; the server re-validates the format.
- **The code stays viewable after a restart**: plaintext is stored only under an ACL-protected directory (current user + SYSTEM, same trust domain as the device credentials); rotating or setting a custom code atomically overwrites it and leaves no plaintext history.
- Clear semantics: rotating / customizing affects only **future pairing**; already-connected devices keep working (force them offline with "revoke all devices").
- Security: shares the **same claim rate-limit budget** as one-time pairing; credential comparison is timing-safe; the long code is only accepted via the `/pair#<secret>` deep link or typed input, never as query plaintext.
- Where: root library `src/pairing-long.ts` plus the claim fallback in `src/pairing-routes.ts`; plugin-side runtime / rpc / wire interfaces and the settings UI (zh / en copy).

### 📡 Quick Tunnel disconnection diagnostics & recovery UX

- `src/quick-tunnel.ts` now keeps **watching the edge connection after the tunnel is ready**, recording outage / recovery events and their durations (edgeState, degraded window, event timeline).
- Momentary loss of connectivity → the settings page shows "**Briefly offline — recovering automatically**"; the public URL and authorized devices are unchanged and there is **no need to re-scan**. Only a process exit (new URL) shows a clear error plus a one-click "restart".
- A diagnostics area shows the recent edge-event timeline; fail-closed semantics are unchanged (the public entry is closed only on process exit or explicit user stop).

### ⚖️ Product differences vs. upstream

- **GitHub identity binding is removed** by product decision: the upstream-optional GitHub Device Flow login no longer exists in this repository's settings page / pairing entry / RPC / configuration. Authentication now consists of: one-time pairing, the long-term pairing code, and per-device sessions.

> This repository is accountable only for the additions above; issues with any upstream capability should be reported to the upstream repository first.

---

## 3. Quick start (from source)

> This fork has not published an npm package or a formal Release yet — the path below is "build locally, then install".

**Environment**: Node `^22.19 || >=24`, pnpm 11.

```bash
# 1) Repository root: install dependencies and build (the root build emits the gateway runtime dist)
pnpm install
pnpm run check        # typecheck + test + build

# 2) plugin: install dependencies and build an installable artifact
cd plugin
pnpm install
pnpm run build
pnpm pack             # produces dsh-remote-web-gateway-0.2.2.tgz
```

**DSH Desktop (Windows GUI)**: fully quit Desktop first, then from an external terminal run

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 -TarballPath <path to plugin .tgz>
```

Restart DSH Desktop → Settings → Remote Control → enable → scan / type the code from your phone.

**Headless `dsh web`**: `dsh plugin --profile web add <path to plugin .tgz>`, restart DSH Web, then the same path as above.

> ⚠️ The npm package `dsh-remote-web-gateway` is the **original** published by upstream summer1238;
> the changes in this repository are not published under that npm name — do not mix them up.

---

## 4. How it works (diagram)

```text
Phone browser ── HTTPS ──▶ Cloudflare Quick Tunnel (established outbound by the computer)
                                  │
                                  ▼
                    Loopback Remote Gateway on the PC
                  (pairing / long code / device-session auth + transparent reverse proxy)
                                  │  127.0.0.1
                                  ▼
                     The running DeepSeek Harness
                 (projects, sessions, tools & agents stay on the PC)
```

The "transport layer (bring public traffic back to the PC)" vs. "authentication layer (who gets in)"
decoupling comes from the upstream design. This repository does not rebuild those two layers; it layers the additions above on top.

---

## 5. Security & vulnerability reporting

- **A link is not permission**: having the public URL does not grant access to DSH — you still need a one-time pairing or the long code to obtain an independent device session.
- The long code is a **long-lived strong credential**: the UI warns not to share screenshots; one click on "new code" invalidates it immediately.
- Every device is authorized independently and can be revoked individually or all at once; management actions (start / stop / revoke / update) are loopback-only and unreachable from the public side.
- To report a security vulnerability, use GitHub's **private reporting on the Security tab** (do not open a public issue).

---

## 6. License

[MIT License](LICENSE). Copyright of the upstream dsh-remote-web-gateway belongs to summer1238;
the additional modifications in this repository belong to AercherC.
Item-by-item attribution of adapted third-party components is in [plugin/NOTICE](plugin/NOTICE).

---

## 7. Acknowledgements

Thanks to summer1238 for the upstream work, and to the authors of dsh-web-mobile, DeepSeek Harness, and the other MIT projects — without those public efforts, this repository would not exist.

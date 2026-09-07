# Security Policy

## Scope

DSH Remote Web Gateway is a DeepSeek Harness (DSH) native plugin that gives you
phone / tablet browser access to the DSH Web GUI running on your computer. The
project combines:

- a loopback-only remote gateway (pairing + device-session authentication)
- a Cloudflare Quick Tunnel as the public transport (outbound only)
- one-time pairing tickets (QR / pairing code)
- a durable long-term pairing code (with user rotation / revocation)
- per-device Device Sessions with revoke / revoke-all
- automatic update checks (user-confirmed installs only)

An authenticated user gains the same high-privilege capabilities as the person
sitting at the host computer (local files, shells, tool execution, configured
model capabilities through the proxied DSH UI). We therefore treat security as a
first-class concern.

## Supported versions

Releases for this project are tagged on the [Releases](https://github.com/AercherC/dsh-remote/releases) page. Currently supported:

- the latest stable release — `0.2.2`
- the latest commit on the `main` branch

Earlier release candidates remain on the Releases page for reference but are superseded by the latest stable release.

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability.

Use GitHub's private reporting flow instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, including reproduction steps, affected version/commit, and impact.

If private vulnerability reporting is not yet enabled on this repository, reach out to the maintainer directly through a private channel.

What to include:

- a clear description of the vulnerability;
- the affected version or commit;
- steps to reproduce;
- the impact (what an attacker could do);
- any suggested mitigation (optional).

Please redact any real tokens, cookies, pairing credentials, GitHub verification
codes, personal emails, public URLs, or DSH conversation content from your report.

## Expectations

- We aim to acknowledge a report promptly and keep you informed of progress.
- We credit reporters who follow responsible disclosure (unless you prefer to remain anonymous).
- Please allow a reasonable window for a fix before disclosing publicly.

## Security model

For the security boundaries, threats, and residual risks, see the security
section of the [README](README.md) and the [User Guide](docs/USER_GUIDE.md).

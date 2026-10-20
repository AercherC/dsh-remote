/**
 * UpdateService (R05): check + one-click apply for the plugin itself.
 *
 * Product rules (frozen):
 *   - automatic CHECK on plugin load, but only when the last check is older
 *     than the configured interval (default 24h) — never per-render polling;
 *   - the user can force a check any time;
 *   - an available update is always SURFACED (reminder ON); background
 *     silent auto-install is OFF by default — nothing replaces code without
 *     the user pressing 立即更新;
 *   - the apply step shells out to DSH's official command
 *     `dsh plugin --profile <profile> update <package>` and verifies the
 *     installed version afterwards; a failure never reports success;
 *   - version source of truth: the npm registry `latest` (the only thing
 *     actually installable via DSH). GitHub Releases provide the human-
 *     readable notes for the matching `v<version>` tag; notes being
 *     unavailable never blocks a security fix from being offered. When npm is
 *     REACHABLE it always wins; when npm is unreachable (e.g. the China-region
 *     npm block) GitHub Releases act as a read-only fallback so the user is at
 *     least TOLD a new stable release exists, even though applying is still
 *     npm-backed;
 *   - restart: NOT auto-performed (see {@link restartBehaviorNote}) — the UI
 *     reports 更新已安装，需要重启 DSH 后生效.
 *
 * State persisted to disk is exactly `{ lastCheckedAt, lastSeenVersion }`.
 * No tokens, no URLs, no paths.
 */
import type { GatewayLogger } from '../vendor/dsh-remote-web-gateway/dist/logger.js';
export type UpdatePhase = 'idle' | 'checking' | 'up-to-date' | 'available' | 'applying' | 'installed-restart-required' | 'failed' | 'unavailable';
/** Stable machine-readable update status; the client maps it to user copy. */
export interface UpdateStatusView {
    readonly currentVersion: string;
    readonly phase: UpdatePhase;
    readonly latestVersion?: string;
    /** Plain-text release notes (safe-rendered; never raw HTML). */
    readonly notes?: string;
    readonly notesUnavailable?: boolean;
    readonly lastCheckedAt?: number;
    readonly lastSeenVersion?: string;
    /** Stable error code: network | registry | cli-not-found | apply-failed | version-mismatch | in-progress. */
    readonly error?: string;
}
/** What is persisted between checks: nothing but the two timestamps/versions. */
export interface UpdateStateFile {
    lastCheckedAt?: number;
    lastSeenVersion?: string;
}
export interface UpdateServiceOptions {
    /** Installed plugin package root (reads package.json for the current version). */
    readonly pluginRootDir: string;
    /** Absolute state file (update-state.json in the plugin state dir). */
    readonly stateFile: string;
    /** npm package name whose `latest` is the update source of truth. */
    readonly registryPackage: string;
    /** `owner/repo` whose `v<version>` release tag carries the notes. */
    readonly githubRepo: string;
    /** `dsh plugin --profile <profile> update ...` — validated by config. */
    readonly cliProfile: string;
    /** Minimum time between automatic checks. */
    readonly minCheckIntervalMs: number;
    readonly logger: GatewayLogger;
    readonly now?: () => number;
    /** Injectable network (tests use fakes; default: global fetch). */
    readonly fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
    /** Injectable CLI runner; default spawns the resolved `dsh` invocation. */
    readonly runCli?: (args: string[]) => Promise<{
        exitCode: number;
        stdout: string;
    }>;
    /** Injectable current-version reader (default: the plugin's package.json). */
    readonly readVersion?: () => string;
    /** Injectable CLI resolution (default: derive from this process's argv). */
    readonly resolveCli?: () => {
        command: string;
        args: string[];
    } | undefined;
}
export interface UpdateService {
    /** Force/throttled check; never throws (failures are surfaced as a view). */
    check(force: boolean): Promise<UpdateStatusView>;
    /** Apply the latest known version; never throws. */
    apply(): Promise<UpdateStatusView>;
    status(): UpdateStatusView;
}
export declare const NPM_LATEST_URL: (pkg: string) => string;
export declare const GITHUB_RELEASE_URL: (repo: string, version: string) => string;
/** GitHub Releases list URL (up to 30 releases) — the read-only fallback source. */
export declare const GITHUB_RELEASES_URL: (repo: string) => string;
/**
 * Sanitize remote release-note text into SAFE PLAIN TEXT for the UI:
 * strip HTML tags, control characters, and cap the length. The client
 * renders the result with React text interpolation only — never
 * dangerouslySetInnerHTML. Unit-tested.
 */
export declare function sanitizeReleaseNotes(raw: string): string;
/** A read-only update signal derived from a GitHub release (not installable). */
export interface GithubReleaseView {
    readonly version: string;
    /** Sanitized plain-text release notes (absent when the release has no body). */
    readonly notes?: string;
    /** True when the release has no usable notes body. */
    readonly notesUnavailable: boolean;
}
/**
 * Extract a strict semver from a GitHub release tag. Only `v<version>` tags are
 * accepted (the author's convention); anything else — a tag without the `v`
 * prefix, a non-semver tag, or a non-string — yields `undefined`.
 */
export declare function githubTagVersion(tag: unknown): string | undefined;
/**
 * Pick the highest stable release from a GitHub Releases API array. Drafts,
 * prereleases, and non-`v<semver>` tags are skipped; among the rest the maximum
 * version wins (via {@link compareVersions}). Notes are sanitized to plain
 * text; a release with no body sets `notesUnavailable`.
 */
export declare function pickLatestStableRelease(items: unknown): GithubReleaseView | undefined;
/**
 * Why the updater does NOT auto-restart DSH (documented decision, R05):
 * the plugin runs INSIDE the `dsh web` process, so a restart means killing
 * its own parent and respawning it with reconstructed argv — original
 * args/profile/port cannot be recovered reliably (verified on the live
 * harness process: `node --import tsx/esm apps/cli/src/bin.ts web ...`),
 * and a botched respawn takes the user's DSH down. DSH exposes no restart
 * RPC (R04 investigation). Safe + reliable wins: the update is applied and
 * verified, then the UI tells the user to restart DSH.
 */
export declare const restartBehaviorNote = "Auto-restart is NOT implemented (R05): the plugin cannot safely kill/respawn its own host process; the UI reports the installed update and asks the user to restart DSH.";
/**
 * Derive how to invoke the `dsh` CLI from the CURRENT process: prefer the
 * DSH_CLI env override, otherwise reuse the same node interpreter + entry
 * script that started this process (argv[1]) so the profile/install that
 * runs us also runs the update. Returns undefined when nothing is derivable.
 */
export declare function resolveCliInvocation(env: NodeJS.ProcessEnv, argv: readonly string[], cwd: string, execArgv?: readonly string[], execPath?: string): {
    command: string;
    args: string[];
} | undefined;
export declare function createUpdateService(options: UpdateServiceOptions): UpdateService;
/** Read the plugin's own package.json version (default reader). */
export declare function readPluginVersion(pluginRootDir: string): string;

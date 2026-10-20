/**
 * Strict semantic-version comparison (R05).
 *
 * Deliberately dependency-free and small: neither the core nor DSH's runtime
 * exposes a reusable semver (verified — no `semver` dependency exists in the
 * harness's own package.json), and the plugin must not grow a heavyweight
 * dependency for one comparison. This implementation follows the semver 2.0.0
 * spec exactly for the subset the updater needs:
 *
 *   - `MAJOR.MINOR.PATCH` numeric comparison,
 *   - prerelease identifiers (`-alpha.1`): a version WITHOUT a prerelease is
 *     always higher than one WITH; identifiers compare per spec (numeric
 *     identifiers compare numerically and rank below alphanumeric ones;
 *     alphanumeric identifiers compare ASCII-lexically; a longer identifier
 *     list wins when the shared prefix is equal),
 *   - build metadata (`+build`) is ignored for precedence.
 *
 * The updater uses `isStableNewer()` for "is there an update": the candidate
 * must be strictly higher AND stable (prereleases are ignored — a stable
 * channel never offers a prerelease as an update).
 */
export interface ParsedVersion {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
    /** Prerelease identifiers, split on `.`; empty = stable. */
    readonly prerelease: readonly string[];
}
/**
 * Parse a strict semver string (an optional leading `v` is tolerated).
 * Returns undefined for anything that is not a valid version — the caller
 * treats that as "not a version", never guesses.
 */
export declare function parseStrictSemver(input: string): ParsedVersion | undefined;
/** Whether the version carries a prerelease tag (stable channel ignores it). */
export declare function isPrereleaseVersion(input: string): boolean;
/** Compare two parsed versions: -1 (a < b), 0 (a === b), 1 (a > b). */
export declare function compareParsed(a: ParsedVersion, b: ParsedVersion): -1 | 0 | 1;
/**
 * Strict full comparison of two version strings (invalid input is treated as
 * LOWER than any valid version — an invalid "latest" can never win).
 */
export declare function compareVersions(a: string, b: string): -1 | 0 | 1;
/**
 * The updater's rule: `latest` is an offerable update only when it is
 * strictly newer than `current` AND stable (prerelease candidates are
 * ignored on the stable channel).
 */
export declare function isStableNewer(current: string, latest: string): boolean;

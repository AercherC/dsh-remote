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
  readonly major: number
  readonly minor: number
  readonly patch: number
  /** Prerelease identifiers, split on `.`; empty = stable. */
  readonly prerelease: readonly string[]
}

// Strict semver 2.0.0: no leading zeros on numeric identifiers; prerelease
// identifiers are dot-separated; build metadata is tolerated and ignored.
const STRICT_SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/

/**
 * Parse a strict semver string (an optional leading `v` is tolerated).
 * Returns undefined for anything that is not a valid version — the caller
 * treats that as "not a version", never guesses.
 */
export function parseStrictSemver(input: string): ParsedVersion | undefined {
  const match = STRICT_SEMVER.exec(input.trim())
  if (match === null) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined || match[4] === '' ? [] : match[4]!.split('.'),
  }
}

/** Whether the version carries a prerelease tag (stable channel ignores it). */
export function isPrereleaseVersion(input: string): boolean {
  const parsed = parseStrictSemver(input)
  return parsed !== undefined && parsed.prerelease.length > 0
}

/** Compare two parsed versions: -1 (a < b), 0 (a === b), 1 (a > b). */
export function compareParsed(a: ParsedVersion, b: ParsedVersion): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  // Same core: no prerelease > prerelease.
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0
  if (a.prerelease.length === 0) return 1
  if (b.prerelease.length === 0) return -1
  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let i = 0; i < length; i += 1) {
    const left = a.prerelease[i]
    const right = b.prerelease[i]
    if (left === undefined) return -1 // shorter list < longer list
    if (right === undefined) return 1
    const compared = compareIdentifier(left, right)
    if (compared !== 0) return compared
  }
  return 0
}

function compareIdentifier(left: string, right: string): -1 | 0 | 1 {
  const leftNumeric = /^\d+$/.test(left)
  const rightNumeric = /^\d+$/.test(right)
  if (leftNumeric && rightNumeric) {
    const a = Number(left)
    const b = Number(right)
    if (a === b) return 0
    return a < b ? -1 : 1
  }
  if (leftNumeric) return -1 // numeric identifiers always rank lower
  if (rightNumeric) return 1
  if (left === right) return 0
  return left < right ? -1 : 1
}

/**
 * Strict full comparison of two version strings (invalid input is treated as
 * LOWER than any valid version — an invalid "latest" can never win).
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parsedA = parseStrictSemver(a)
  const parsedB = parseStrictSemver(b)
  if (parsedA === undefined && parsedB === undefined) return 0
  if (parsedA === undefined) return -1
  if (parsedB === undefined) return 1
  return compareParsed(parsedA, parsedB)
}

/**
 * The updater's rule: `latest` is an offerable update only when it is
 * strictly newer than `current` AND stable (prerelease candidates are
 * ignored on the stable channel).
 */
export function isStableNewer(current: string, latest: string): boolean {
  if (isPrereleaseVersion(latest)) return false
  return compareVersions(latest, current) > 0
}

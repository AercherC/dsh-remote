/**
 * Strict semver comparison (R05): the updater's version logic must never be
 * a naive string compare — prereleases, build metadata, and invalid input
 * are all specified here.
 */

import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  isPrereleaseVersion,
  isStableNewer,
  parseStrictSemver,
} from '../src/semver.js'

describe('parseStrictSemver', () => {
  it('parses stable versions and tolerates a leading v', () => {
    expect(parseStrictSemver('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0, prerelease: [] })
    expect(parseStrictSemver('v1.2.3')?.major).toBe(1)
    expect(parseStrictSemver('1.2.3-beta.1')?.prerelease).toEqual(['beta', '1'])
    expect(parseStrictSemver('1.2.3+build.7')?.prerelease).toEqual([])
  })

  it('rejects anything that is not strict semver', () => {
    for (const bad of ['1.0', '1', '1.0.0.1', '01.0.0', 'a.b.c', '', 'latest', '1.0.0-', '1.0.0-01']) {
      expect(parseStrictSemver(bad), `expected invalid: ${bad}`).toBeUndefined()
    }
  })
})

describe('compareVersions', () => {
  it('compares the numeric core', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1)
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
  })

  it('implements the prerelease precedence rules', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0')).toBe(-1) // stable > prerelease
    expect(compareVersions('1.0.0', '1.0.0-alpha')).toBe(1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1) // lexical
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1) // numeric ids
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1) // numeric < alphanumeric
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1) // shorter < longer
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1) // numeric compare, not string
  })

  it('ignores build metadata', () => {
    expect(compareVersions('1.0.0', '1.0.0+build.5')).toBe(0)
  })

  it('treats invalid input as lower than any valid version', () => {
    expect(compareVersions('', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', 'garbage')).toBe(1)
    expect(compareVersions('nope', 'also-nope')).toBe(0)
  })
})

describe('isStableNewer', () => {
  it('offers only strictly-newer STABLE versions', () => {
    expect(isStableNewer('1.0.0', '1.0.1')).toBe(true)
    expect(isStableNewer('1.0.0', '1.0.0')).toBe(false)
    expect(isStableNewer('1.0.1', '1.0.0')).toBe(false)
  })

  it('ignores prereleases on the stable channel', () => {
    expect(isStableNewer('1.0.0', '1.1.0-rc.1')).toBe(false)
    expect(isStableNewer('1.0.0', '2.0.0-beta')).toBe(false)
  })

  it('never treats an invalid latest as an update', () => {
    expect(isStableNewer('1.0.0', 'not-a-version')).toBe(false)
  })
})

describe('isPrereleaseVersion', () => {
  it('detects prerelease tags', () => {
    expect(isPrereleaseVersion('1.0.0')).toBe(false)
    expect(isPrereleaseVersion('1.0.0-alpha.1')).toBe(true)
    expect(isPrereleaseVersion('garbage')).toBe(false)
  })
})

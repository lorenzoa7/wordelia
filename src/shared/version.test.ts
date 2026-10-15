import { describe, expect, it } from 'vitest'
import { isOlderVersion } from './version'

describe('isOlderVersion', () => {
  it('compares each number', () => {
    expect(isOlderVersion('2.1.198', '2.1.280')).toBe(true)
    expect(isOlderVersion('2.1.280', '2.1.198')).toBe(false)
    expect(isOlderVersion('2.1.9', '2.1.10')).toBe(true)
    expect(isOlderVersion('2.1', '2.1.0')).toBe(false)
  })
  it('reads versions with text around them', () => {
    expect(isOlderVersion('codex-cli 0.40.0', '0.41.0')).toBe(true)
  })
  it('does not guess when a version is unknown', () => {
    expect(isOlderVersion(undefined, '1.0.0')).toBe(false)
    expect(isOlderVersion('dev', '1.0.0')).toBe(false)
  })
})

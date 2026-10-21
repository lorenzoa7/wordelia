import { describe, expect, it } from 'vitest'
import { cleanProgramPath } from './paths'

describe('cleanProgramPath', () => {
  it('takes away the quotes of "Copy as path" and the spaces', () => {
    expect(cleanProgramPath('"C:\\Program Files\\claude\\claude.exe"')).toBe('C:\\Program Files\\claude\\claude.exe')
    expect(cleanProgramPath("  '/usr/local/bin/claude'  ")).toBe('/usr/local/bin/claude')
    expect(cleanProgramPath(' /opt/homebrew/bin/codex\n')).toBe('/opt/homebrew/bin/codex')
  })

  it('gives undefined for an empty path', () => {
    expect(cleanProgramPath('')).toBeUndefined()
    expect(cleanProgramPath('  ""  ')).toBeUndefined()
    expect(cleanProgramPath(undefined)).toBeUndefined()
  })
})

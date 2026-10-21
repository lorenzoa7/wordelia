import { describe, expect, it } from 'vitest'
import { localeForSystem } from './index'

describe('the interface language of a new install', () => {
  it('follows the language of the system', () => {
    expect(localeForSystem('pt-BR')).toBe('pt-BR')
    expect(localeForSystem('pt-PT')).toBe('pt-BR')
    expect(localeForSystem('es-419')).toBe('es')
    expect(localeForSystem('es')).toBe('es')
    expect(localeForSystem('en-GB')).toBe('en')
  })

  it('is English for a language that the app does not have', () => {
    expect(localeForSystem('de-DE')).toBe('en')
    expect(localeForSystem('')).toBe('en')
    expect(localeForSystem(undefined)).toBe('en')
  })
})

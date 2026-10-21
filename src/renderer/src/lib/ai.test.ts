import { afterEach, describe, expect, it } from 'vitest'
import type { AppSettings, CompletionResult } from '@shared/types'
import { useApp } from '@/stores/app'
import { useUi } from '@/stores/ui'
import { describeError, friendlyError, useProviderFocus } from './ai'

const fail = (r: Partial<CompletionResult>): CompletionResult => ({ ok: false, text: '', ...r })
const language = (l: AppSettings['language']): void => useApp.setState({ settings: { language: l } as AppSettings })

afterEach(() => language('en'))

describe('describeError', () => {
  it('says that a login expired, in plain words, with the raw text only in the details', () => {
    const raw = 'OAuth token has expired. Please obtain a new token or refresh your existing token.'
    const e = describeError(fail({ errorKind: 'login-expired', error: raw, provider: 'claude-code' }))
    expect(e.message).toBe('Your Claude Code login has expired. Open Settings → AI to log in again.')
    expect(e.message).not.toMatch(/OAuth/)
    expect(e.detail).toBe(raw)
  })

  it('speaks the language of the interface', () => {
    language('pt-BR')
    expect(friendlyError(fail({ errorKind: 'login-expired', error: 'OAuth token has expired.', provider: 'claude-code' }))).toBe(
      'O login do Claude Code expirou. Abra Configurações → IA para entrar de novo.'
    )
  })

  it('keeps a busy server apart from a usage limit, and keeps the reset time', () => {
    expect(friendlyError(fail({ errorKind: 'overloaded', provider: 'anthropic' }))).toBe('Anthropic API is busy right now. Try again in a moment.')
    expect(friendlyError(fail({ errorKind: 'rate-limit', provider: 'claude-code', resets: '3pm (Europe/London)' }))).toBe(
      'You reached the usage limit of your plan. It resets at 3pm (Europe/London).'
    )
    expect(friendlyError(fail({ errorKind: 'rate-limit', provider: 'claude-code' }))).toBe('You reached the usage limit of your plan. Try again later.')
  })

  it('has a message for a bad key, no credit, no key and a provider that is off', () => {
    expect(friendlyError(fail({ errorKind: 'bad-key', provider: 'openai' }))).toBe('OpenAI API did not accept your API key. Check the key in Settings → AI.')
    expect(friendlyError(fail({ errorKind: 'no-credit', provider: 'anthropic' }))).toMatch(/no credit/)
    expect(friendlyError(fail({ errorKind: 'not-logged-in', provider: 'anthropic' }))).toBe('Add an API key for Anthropic API in Settings → AI.')
    expect(friendlyError(fail({ errorKind: 'off', provider: 'codex' }))).toBe('Codex is off. Turn it on in Settings → AI.')
  })

  it('gives a fix that opens the row of the provider in Settings → AI', () => {
    const e = describeError(fail({ errorKind: 'bad-key', provider: 'anthropic' }))
    expect(e.fix?.label).toBe('Open settings')
    e.fix?.run()
    expect(useUi.getState().settingsOpen).toBe(true)
    expect(useUi.getState().settingsTab).toBe('ai')
    expect(useProviderFocus.getState().provider).toBe('anthropic')
    expect(describeError(fail({ errorKind: 'overloaded', provider: 'anthropic' })).fix).toBeUndefined()
  })

  it('starts with a capital letter when the provider is not known', () => {
    expect(friendlyError(fail({ errorKind: 'other' }))).toBe('The AI could not answer. Try again.')
  })
})

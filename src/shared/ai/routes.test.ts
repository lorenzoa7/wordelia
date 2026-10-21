import { describe, expect, it } from 'vitest'
import type { ModelInfo, ModelRoutes, ProviderId, ProviderStatus } from '../types'
import { readyProviders, repairRoutes } from './routes'

const EMPTY: ModelRoutes = { chat: null, action: null, sync: null, background: null }
const claude: ModelInfo[] = ['opus', 'sonnet', 'haiku'].map((id) => ({ id, label: id, efforts: ['low', 'medium', 'high'] }))
const codex: ModelInfo[] = [{ id: 'gpt-5.5', label: 'GPT-5.5', isDefault: true, efforts: ['low', 'medium', 'high'] }]
const models = { 'claude-code': claude, codex }
const on = (...ids: ProviderId[]) => (p: ProviderId): boolean => ids.includes(p)

describe('readyProviders', () => {
  const ok = (provider: ProviderId): ProviderStatus => ({ provider, installed: true, loggedIn: true })
  it('keeps the providers that are on, installed and not logged out, in the usual order', () => {
    const providers = { 'claude-code': { enabled: true }, codex: { enabled: true }, anthropic: { enabled: false }, openai: { enabled: true } }
    const status = { openai: ok('openai'), anthropic: ok('anthropic'), codex: { ...ok('codex'), loggedIn: false }, 'claude-code': ok('claude-code') }
    expect(readyProviders({ providers }, status)).toEqual(['claude-code', 'openai'])
    expect(readyProviders({ providers }, { 'claude-code': { ...ok('claude-code'), installed: false } })).toEqual([])
    // A status that cannot tell (loggedIn null) counts as ready.
    expect(readyProviders({ providers }, { codex: { ...ok('codex'), loggedIn: null } })).toEqual(['codex'])
  })
})

describe('repairRoutes', () => {
  it('fills empty routes with the provider that the writer just connected', () => {
    const r = repairRoutes(EMPTY, on('claude-code', 'codex'), ['claude-code', 'codex'], models, 'codex')
    expect(r?.provider).toBe('codex')
    expect(r?.changed).toEqual(['chat', 'action', 'sync', 'background'])
    expect(r?.routes.chat?.provider).toBe('codex')
  })

  it('uses the first ready provider when no provider is preferred', () => {
    const r = repairRoutes(EMPTY, on('claude-code', 'codex'), ['claude-code', 'codex'], models)
    expect(r?.routes).toMatchObject({ chat: { provider: 'claude-code', model: 'opus' }, action: { model: 'sonnet' }, background: { model: 'haiku' } })
  })

  it('moves the routes of a provider that is off to a ready provider', () => {
    const routes: ModelRoutes = { chat: { provider: 'claude-code', model: 'opus' }, action: { provider: 'claude-code', model: 'sonnet' }, sync: { provider: 'codex', model: '' }, background: null }
    const r = repairRoutes(routes, on('codex'), ['codex'], models)
    expect(r?.provider).toBe('codex')
    expect(r?.changed).toEqual(['chat', 'action', 'background'])
    // A working route stays as it is.
    expect(r?.routes.sync).toBe(routes.sync)
    expect(r?.routes.chat?.provider).toBe('codex')
  })

  it('empties the routes of a provider that is off when no other provider is ready', () => {
    const routes: ModelRoutes = { chat: { provider: 'claude-code', model: 'opus' }, action: null, sync: { provider: 'claude-code', model: 'opus' }, background: null }
    const r = repairRoutes(routes, on(), [], models)
    expect(r?.provider).toBeNull()
    expect(r?.changed).toEqual(['chat', 'sync'])
    expect(r?.routes).toEqual(EMPTY)
  })

  it('changes nothing when every route works, or when nothing can be done', () => {
    const routes: ModelRoutes = { chat: { provider: 'claude-code', model: 'opus' }, action: { provider: 'claude-code', model: 'sonnet' }, sync: { provider: 'claude-code', model: 'opus' }, background: { provider: 'claude-code', model: 'haiku' } }
    expect(repairRoutes(routes, on('claude-code'), ['claude-code'], models, 'codex')).toBeNull()
    expect(repairRoutes(EMPTY, on('claude-code'), [], models)).toBeNull()
  })

  it('keeps a route of a provider that is on but logged out: a new login fixes it', () => {
    const routes: ModelRoutes = { ...EMPTY, chat: { provider: 'claude-code', model: 'opus' } }
    const r = repairRoutes(routes, on('claude-code', 'codex'), ['codex'], models)
    expect(r?.routes.chat).toBe(routes.chat)
    expect(r?.changed).toEqual(['action', 'sync', 'background'])
  })
})

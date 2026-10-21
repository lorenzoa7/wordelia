import { describe, expect, it } from 'vitest'
import type { ModelInfo } from '../types'
import { isGeneralOpenAiModel, openaiEfforts, openaiModelLabel } from './openai'
import { suggestRoutes } from './routes'

describe('OpenAI models', () => {
  it('knows the general chat models', () => {
    for (const id of ['gpt-5', 'gpt-5.1', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4o', 'o3', 'o4-mini']) expect(isGeneralOpenAiModel(id), id).toBe(true)
    for (const id of ['gpt-5-pro', 'o3-deep-research', 'gpt-5-chat-latest', 'gpt-5-codex', 'chatgpt-4o-latest', 'gpt-oss-120b']) expect(isGeneralOpenAiModel(id), id).toBe(false)
  })

  it('gives effort levels only to reasoning models', () => {
    expect(openaiEfforts('gpt-5.1')).toEqual(['low', 'medium', 'high'])
    expect(openaiEfforts('o3')).toEqual(['low', 'medium', 'high'])
    expect(openaiEfforts('gpt-5-pro')).toEqual(['high'])
    expect(openaiEfforts('gpt-4.1')).toEqual([])
    expect(openaiEfforts('gpt-4o')).toEqual([])
    expect(openaiEfforts('gpt-5-chat-latest')).toEqual([])
    expect(openaiEfforts('chatgpt-4o-latest')).toEqual([])
    expect(openaiEfforts('something-new')).toBeUndefined()
  })

  it('shows names for people', () => {
    expect(openaiModelLabel('gpt-5.1')).toBe('GPT-5.1')
    expect(openaiModelLabel('gpt-5-mini')).toBe('GPT-5 mini')
    expect(openaiModelLabel('gpt-4o')).toBe('GPT-4o')
    expect(openaiModelLabel('gpt-5-pro')).toBe('GPT-5 Pro')
    expect(openaiModelLabel('o4-mini')).toBe('o4 mini')
    expect(openaiModelLabel('gpt-5-chat-latest')).toBe('GPT-5 chat latest')
  })
})

describe('suggested OpenAI routes', () => {
  const m = (id: string): ModelInfo => ({ id, label: openaiModelLabel(id), tier: /mini|nano/.test(id) ? 'fast' : 'best', efforts: openaiEfforts(id) })
  // Newest first, as the transport sorts them.
  const models = ['o3-deep-research', 'gpt-5-pro', 'gpt-5.1-chat-latest', 'gpt-5.1-codex', 'gpt-5.1', 'gpt-5-nano', 'gpt-5-mini', 'gpt-4o'].map(m)

  it('uses a general model, never a pro, research or chat-latest model', () => {
    const r = suggestRoutes('openai', models)
    expect(r.chat?.model).toBe('gpt-5.1')
    expect(r.action?.model).toBe('gpt-5.1')
    expect(r.sync?.model).toBe('gpt-5.1')
    expect(r.background?.model).toBe('gpt-5-mini')
  })

  it('sends no effort to a model without reasoning', () => {
    const r = suggestRoutes('openai', [m('gpt-4o'), m('gpt-4o-mini')])
    expect(r.chat).toEqual({ provider: 'openai', model: 'gpt-4o' })
    expect(r.background).toEqual({ provider: 'openai', model: 'gpt-4o-mini' })
  })
})

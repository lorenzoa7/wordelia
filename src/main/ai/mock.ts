// A scripted provider for end-to-end tests and screenshots (WORDELIA_MOCK_AI=1).
// It never calls a real AI. Its replies follow the same protocols as real replies.

import type { CompletionRequest, CompletionResult, ModelInfo, ProviderId, ProviderStatus, StreamEvent } from '@shared/types'
import type { ProviderTransport } from './transport'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const SWAPS: Array<[RegExp, string]> = [
  [/\bmuito\s+/gi, ''],
  [/\bvery\s+/gi, ''],
  [/\bdisse\b/g, 'murmurou'],
  [/\bsaid\b/g, 'murmured'],
  [/\bentão,?\s*/gi, ''],
  [/\bthen\s+/gi, ''],
  [/\bolhou\b/g, 'fitou'],
  [/\blooked\b/g, 'gazed'],
  [/\s{2,}/g, ' ']
]

function polish(text: string): string {
  let out = text
  for (const [re, rep] of SWAPS) out = out.replace(re, rep)
  out = out.replace(/(^|[.!?]\s+)([a-zà-ú])/g, (_m, a: string, b: string) => a + b.toUpperCase())
  // A selection that starts in the middle of a sentence keeps its small first letter.
  if (/^[a-zà-ú]/.test(text)) out = out.charAt(0).toLowerCase() + out.slice(1)
  if (out === text) out = text.replace(/,\s*/, ' — ')
  return out
}

function between(src: string, open: string, close: string): string | null {
  const a = src.indexOf(open)
  if (a < 0) return null
  const b = src.indexOf(close, a + open.length)
  return b < 0 ? null : src.slice(a + open.length, b)
}

function reply(req: CompletionRequest): string {
  const last = req.messages[req.messages.length - 1]?.content ?? ''
  const english = /language="[^"]*English/.test(req.system)
  if (req.purpose === 'action') {
    const sel = between(last, '<selection>\n', '\n</selection>') ?? between(last, '<selection>', '</selection>') ?? last
    return `<rewrite>\n${polish(sel.trim())}\n</rewrite>`
  }
  if (req.purpose === 'background' && /short title/i.test(req.system)) return 'The opening paragraph'
  if (req.purpose === 'background') {
    return '- The writer and the assistant discussed the current chapter.\n- Decision: keep the tone dark and quiet.'
  }
  if (req.purpose === 'sync' && english) {
    return [
      'I found one new character in the changed chapters.',
      '',
      '<create file="planning/Characters/The Visitor.md">',
      '---',
      'aliases: [the man from the blue boat]',
      'summary: A stranger found in a blue boat. He speaks of streets that do not exist on the island.',
      '---',
      '## Role',
      'A mystery that arrives with the storm.',
      '## Appearance',
      '- Hands of someone who never worked at sea.',
      '- A silver ring with a lighthouse engraved on it.',
      '</create>'
    ].join('\n')
  }
  if (req.purpose === 'sync') {
    return [
      'I found one new character in the changed chapters.',
      '',
      '<create file="planning/Characters/O Viajante.md">',
      '---',
      'aliases: [Viajante]',
      'summary: A mysterious old man who visits Father Miguel.',
      '---',
      '## Role',
      'A stranger who knows the way to the Lost Paradise.',
      '</create>'
    ].join('\n')
  }
  // Chat: propose an edit to the first paragraph of the current chapter.
  const chapter = /<chapter file="([^"]+)"[^>]*current="true"[^>]*>\n([\s\S]*?)\n<\/chapter>/.exec(req.system)
  // The first paragraph with words to improve, so the diff shows real changes.
  const paras = chapter?.[2].split(/\n\n/).filter((p) => p.trim().length > 40) ?? []
  const improvable = (p: string): boolean => SWAPS.slice(0, -1).some(([re]) => new RegExp(re.source, re.flags.replace('g', '')).test(p))
  const firstPara = paras.find(improvable) ?? paras[0]
  if (chapter && firstPara && /edit|change|improve|rewrite|melhor|mude|reescrev/i.test(last)) {
    return [
      'Here is a tighter version of this paragraph. It keeps the facts and the voice.',
      '',
      `<edit file="${chapter[1]}">`,
      `<find>${firstPara.trim()}</find>`,
      `<replace>${polish(firstPara.trim())}</replace>`,
      '</edit>',
      '',
      'Tell me if you want a bolder version.'
    ].join('\n')
  }
  return [
    'Good question. Three things stand out in this chapter:',
    '',
    '1. **The opening image is strong.** The lamp lit at six sharp sets the tone at once.',
    '2. **The visitor needs one concrete detail** that the reader can remember: a smell, a scar, a way of speaking.',
    "3. **Marta's reaction** comes a little fast. One more beat of doubt would make the blue boat more frightening.",
    '',
    'Do you want me to propose an edit for one of these?'
  ].join('\n')
}

export function mockProvider(id: ProviderId): ProviderTransport {
  return {
    id,
    async status(): Promise<ProviderStatus> {
      return { provider: id, installed: true, loggedIn: true, version: 'mock', detail: 'Scripted test provider', account: 'test@example.com' }
    },
    async listModels(): Promise<ModelInfo[]> {
      return [
        { id: 'opus', label: 'Opus', tier: 'best' },
        { id: 'sonnet', label: 'Sonnet', tier: 'balanced' },
        { id: 'haiku', label: 'Haiku', tier: 'fast' }
      ]
    },
    async complete(req: CompletionRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal): Promise<CompletionResult> {
      const text = reply(req)
      onEvent({ type: 'start', model: req.route.model })
      let sent = ''
      const step = Math.max(4, Math.ceil(text.length / 60))
      for (let i = 0; i < text.length; i += step) {
        if (signal.aborted) return { ok: false, text: sent, error: 'Cancelled.', errorKind: 'cancelled' }
        const delta = text.slice(i, i + step)
        sent += delta
        onEvent({ type: 'text', delta })
        await sleep(12)
      }
      return { ok: true, text, model: req.route.model, usage: { inputTokens: 1200, outputTokens: 180 } }
    }
  }
}

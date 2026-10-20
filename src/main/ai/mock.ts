// A scripted provider for end-to-end tests and screenshots (WORDELIA_MOCK_AI=1).
// It never calls a real AI. Its replies follow the same protocols as real replies.

import type { CompletionResult, ModelInfo, ProviderId, ProviderStatus, StreamEvent } from '@shared/types'
import type { ProviderTransport } from './transport'
import type { AiRequest } from './images'

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

function reply(req: AiRequest): string {
  const last = req.messages[req.messages.length - 1]?.content ?? ''
  const english = /language="[^"]*English/.test(req.system)
  // A message with images: describe the person, and propose the image as the portrait of the entry
  // that the message names. The count is the images that the main process read from the book.
  const images = req.messages[req.messages.length - 1]?.images ?? []
  if (req.purpose === 'chat' && images.length) {
    const seen = req.images?.[req.messages.length - 1]?.length ?? 0
    const entry = [...req.system.matchAll(/^- (planning\/[^:]+\.md): ([^(—\n]+)/gm)].find((m) => last.includes(m[2].trim()))
    const name = entry?.[2].trim() ?? (english ? 'this person' : 'esta pessoa')
    return [
      english ? `I see ${seen} image(s).` : `Vejo ${seen} imagem(ns).`,
      '',
      english
        ? `**${name}** has a thin face and the dark eyes of someone who stays awake at night. Gray hair, tied low.`
        : `**${name}** tem o rosto magro e os olhos escuros de quem passa a noite acordada. Cabelo grisalho, preso baixo.`,
      ...(entry ? ['', `<portrait file="${entry[1]}">${images[0].file}</portrait>`] : [])
    ].join('\n')
  }
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
      '</create>',
      '',
      'Elias reacts to the visitor in the new chapter.',
      '',
      '<edit file="planning/Characters/Elias.md">',
      '<find>Speaks little; watches a lot.</find>',
      '<replace>Speaks little; watches a lot. He does not trust the man from the blue boat.</replace>',
      '</edit>'
    ].join('\n')
  }
  if (req.purpose === 'sync') {
    return [
      'Encontrei um personagem novo nos capítulos que mudaram.',
      '',
      '<create file="planning/Characters/O Visitante.md">',
      '---',
      'aliases: [o homem do bote azul]',
      'summary: Um estranho encontrado num bote azul. Fala de ruas que não existem na ilha.',
      '---',
      '## Papel',
      'Um mistério que chega com a tempestade.',
      '</create>',
      '',
      'Elias reage ao visitante no capítulo novo.',
      '',
      '<edit file="planning/Characters/Elias.md">',
      '<find>Fala pouco; observa muito.</find>',
      '<replace>Fala pouco; observa muito. Desconfia do homem do bote azul.</replace>',
      '</edit>'
    ].join('\n')
  }
  // Chat: propose an edit to the first paragraph of the current chapter.
  const chapter = /<chapter file="([^"]+)"[^>]*current="true"[^>]*>\n([\s\S]*?)\n<\/chapter>/.exec(req.system)
  // The first paragraph with words to improve, so the diff shows real changes.
  const paras = chapter?.[2].split(/\n\n/).filter((p) => p.trim().length > 40) ?? []
  const improvable = (p: string): boolean => SWAPS.slice(0, -1).some(([re]) => new RegExp(re.source, re.flags.replace('g', '')).test(p))
  const firstPara = paras.find(improvable) ?? paras[0]
  const wantsEdit = /edit|change|improve|rewrite|melhor|mude|reescrev/i.test(last)
  // "Improve the first two paragraphs": several proposals in one reply, for the bar that applies them all.
  if (chapter && wantsEdit && /\b(two|both|several|dois|duas|ambos)\b/i.test(last)) {
    const picked = [...paras.filter(improvable), ...paras].filter((p, i, all) => all.indexOf(p) === i).slice(0, 2)
    return [
      english ? 'Here are tighter versions of two paragraphs, and a note for the planning.' : 'Aqui estão versões mais enxutas de dois parágrafos, e uma nota para o planejamento.',
      '',
      ...picked.flatMap((p) => [`<edit file="${chapter[1]}">`, `<find>${p.trim()}</find>`, `<replace>${polish(p.trim())}</replace>`, '</edit>', '']),
      english ? '<create file="planning/Places/The Harbor.md">' : '<create file="planning/Places/O Porto.md">',
      '---',
      english ? 'summary: The harbor below the lighthouse, where Elias counts the boats each night.' : 'summary: O porto embaixo do farol, onde Elias conta os barcos todas as noites.',
      '---',
      english ? '## Description' : '## Descrição',
      english ? 'A small harbor of gray stone. The boats come back before dark.' : 'Um porto pequeno de pedra cinza. Os barcos voltam antes de escurecer.',
      '</create>'
    ].join('\n')
  }
  if (chapter && firstPara && wantsEdit) {
    return [
      'Here is a tighter version of this paragraph. It keeps the facts and the voice.',
      '',
      `<edit file="${chapter[1]}">`,
      `<find>${firstPara.trim()}</find>`,
      `<replace>${polish(firstPara.trim())}</replace>`,
      '</edit>'
    ].join('\n')
  }
  return [
    "**Marta's reaction is the weakest part:** it comes too fast. One more beat of doubt would make the blue boat more frightening.",
    '',
    'The visitor also needs one concrete detail that the reader can remember: a smell, a scar, a way of speaking.'
  ].join('\n')
}

/** A short thinking summary for chat replies, so the chat can show what the AI thinks about. */
function thinking(req: AiRequest): string {
  if (req.purpose !== 'chat') return ''
  const last = req.messages[req.messages.length - 1]?.content ?? ''
  const edit = /edit|change|improve|rewrite|melhor|mude|reescrev/i.test(last)
  return [
    'Reading the request against the current chapter and the planning notes.',
    edit
      ? 'The opening paragraph carries the tone. Some verbs are soft, so a tighter version can keep the facts and the voice.'
      : 'Three things stand out: the opening image, the visitor, and the pace of the reaction.',
    edit ? 'I will propose one change and keep the rest as it is.' : 'I will name them in order of weight.'
  ].join('\n\n')
}

const EFFORTS: ModelInfo['efforts'] = ['low', 'medium', 'high', 'xhigh', 'max']

export function mockProvider(id: ProviderId): ProviderTransport {
  return {
    id,
    async status(): Promise<ProviderStatus> {
      return { provider: id, installed: true, loggedIn: true, version: 'mock', detail: 'Scripted test provider', account: 'test@example.com' }
    },
    async listModels(): Promise<ModelInfo[]> {
      // Labels with versions, like the real claude CLI after the app reads its aliases.
      return [
        { id: 'fable', label: 'Fable 5.1', tier: 'best', efforts: EFFORTS },
        { id: 'opus', label: 'Opus 5.5', tier: 'best', efforts: EFFORTS },
        { id: 'sonnet', label: 'Sonnet 5.5', tier: 'balanced', efforts: EFFORTS },
        { id: 'haiku', label: 'Haiku 5.5', tier: 'fast', efforts: EFFORTS }
      ]
    },
    async complete(req: AiRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal): Promise<CompletionResult> {
      const text = reply(req)
      // Screenshot scenarios can slow the reply down (milliseconds for each piece).
      const delay = Number(process.env['WORDELIA_MOCK_DELAY'] ?? '') || 12
      onEvent({ type: 'start', model: req.route.model })
      const cancelled = (sent: string): CompletionResult => ({ ok: false, text: sent, error: 'Cancelled.', errorKind: 'cancelled' })
      const thought = thinking(req)
      for (const word of thought.split(/(?<=\s)/)) {
        if (signal.aborted) return cancelled('')
        onEvent({ type: 'thinking', delta: word })
        await sleep(Math.max(4, delay / 3))
      }
      let sent = ''
      const step = Math.max(4, Math.ceil(text.length / 60))
      for (let i = 0; i < text.length; i += step) {
        if (signal.aborted) return cancelled(sent)
        const delta = text.slice(i, i + step)
        sent += delta
        onEvent({ type: 'text', delta })
        await sleep(delay)
      }
      return { ok: true, text, model: req.route.model, usage: { inputTokens: 1200, outputTokens: 180 } }
    }
  }
}

import { describe, expect, it } from 'vitest'
import { newManifest } from '../book'
import type { Chapter, Entry, Thread } from '../types'
import { buildChatSystem } from './chat'
import { buildActionSystem, buildActionUser, extractRewrite } from './action'
import { entriesMentionedIn } from './context'

const manifest = newManifest({ title: 'O Farol', author: 'Ana', language: 'pt-BR' })
const ch = (id: string, title: string, body: string): Chapter => ({ id, file: `${title}.md`, title, body, meta: {} })
const chapters = [ch('c1', 'Um', 'Elias acendeu a lâmpada.'), ch('c2', 'Dois', 'Marta subiu a escada.'), ch('c3', 'Três', 'O bote azul chegou.')]
const entries: Entry[] = [
  { id: 'e1', category: 'Characters', file: 'Characters/Elias.md', name: 'Elias', aliases: ['o faroleiro'], summary: 'Faroleiro.', image: null, body: '## Papel\nProtagonista.', meta: {} },
  { id: 'e2', category: 'Characters', file: 'Characters/Marta.md', name: 'Marta', aliases: [], summary: 'Companheira.', image: null, body: 'Notas.', meta: {} }
]
const thread: Thread = { id: 't1', title: 'Tema', brief: 'O arco de Elias', digest: '- Decidido: tom sombrio.', digestedCount: 0, createdAt: '', updatedAt: '', pinned: false, route: null, messages: [] }
const other: Thread = { ...thread, id: 't2', title: 'Marta', brief: '', digest: '- Marta sabe nadar.' }

function system(currentChapterId: string, budget = 100000, summaries: Record<string, string> = {}): string {
  return buildChatSystem({
    book: { manifest, writingRules: '- Frases curtas.', chapters, entries, threads: [thread, other] },
    thread,
    currentChapterId,
    currentEntryId: null,
    mentions: [],
    quotes: [],
    message: 'O que acha?',
    summaries,
    manuscriptBudget: budget
  })
}

describe('chat system prompt', () => {
  it('puts the stable parts first and the open chapter after them', () => {
    const s = system('c2')
    const iOther = s.indexOf('Elias acendeu')
    const iCurrent = s.indexOf('Marta subiu')
    const iDigest = s.indexOf('Marta sabe nadar')
    expect(iOther).toBeGreaterThan(0)
    expect(iCurrent).toBeGreaterThan(iOther)
    expect(iDigest).toBeGreaterThan(iCurrent)
    expect(s).toMatch(/<chapter file="manuscript\/Dois.md" number="2" title="Dois" current="true">/)
  })

  it('keeps the prefix the same when only the open chapter changes', () => {
    const a = system('c2')
    const prefix = a.slice(0, a.indexOf('# Manuscript: outline'))
    chapters[1].body = 'Marta subiu a escada devagar.'
    const b = system('c2')
    expect(b.startsWith(prefix)).toBe(true)
  })

  it('includes the planning entries named in the open chapter', () => {
    expect(system('c1')).toContain('<planning_entry file="planning/Characters/Elias.md"')
  })

  it('uses summaries when the book does not fit', () => {
    const s = system('c1', 12, { c3: 'Resumo do capítulo três.' })
    expect(s).toContain('Resumo do capítulo três.')
    expect(s).not.toContain('O bote azul chegou.')
  })
})

describe('action prompt', () => {
  const input = {
    book: { manifest, writingRules: '- Frases curtas.', entries },
    action: { id: 'polish', name: 'Polish', icon: 'Sparkle', builtIn: true, route: null, contextChars: 100, instructions: 'Melhore.' },
    before: 'Antes. ',
    selection: 'Elias *olhou* o mar.',
    after: ' Depois.',
    chapterTitle: 'Um'
  }

  it('asks for a rewrite in the book language with the rules', () => {
    const sys = buildActionSystem(input)
    expect(sys).toContain('Brazilian Portuguese')
    expect(sys).toContain('- Frases curtas.')
    expect(sys).toContain('Elias')
    expect(buildActionUser(input)).toContain('<selection>\nElias *olhou* o mar.\n</selection>')
  })

  it('extracts the rewrite, also while it streams', () => {
    expect(extractRewrite('ok <rewrite>\nNovo texto.\n</rewrite>')).toEqual({ text: 'Novo texto.', complete: true })
    expect(extractRewrite('<rewrite>\nNovo te')).toEqual({ text: 'Novo te', complete: false })
  })
})

describe('entriesMentionedIn', () => {
  it('finds names and aliases as whole words, any case', () => {
    expect(entriesMentionedIn('O FAROLEIRO dormiu.', entries).map((e) => e.id)).toEqual(['e1'])
    expect(entriesMentionedIn('Martarola', entries)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import type { Entry } from '../types'
import { entryFromFile, entryToFile } from '../book'
import { entryNames } from '../prompts/context'
import { cleanObsidian, planImport } from './import'
import {
  compareNames,
  entryPath,
  freeName,
  inFolder,
  nameOwner,
  parseWikiTarget,
  renameLinks,
  renameMentions,
  renameMentionsInBoard,
  textUsesName,
  topFolder
} from './notes'

function entry(id: string, name: string, extra: Partial<Entry> = {}): Entry {
  return { id, category: 'Characters', file: `Characters/${name}.md`, name, aliases: [], summary: '', image: null, body: '', meta: {}, ...extra }
}

describe('wiki link targets', () => {
  it('reads the name, the heading and the shown text', () => {
    expect(parseWikiTarget('Marta')).toMatchObject({ name: 'Marta', heading: '', alias: '' })
    expect(parseWikiTarget('Marta#Papel')).toMatchObject({ name: 'Marta', heading: 'Papel', alias: '' })
    expect(parseWikiTarget('Marta|ela')).toMatchObject({ name: 'Marta', heading: '', alias: 'ela' })
    expect(parseWikiTarget(' Marta #Papel|a moça')).toMatchObject({ name: 'Marta', heading: 'Papel', alias: 'a moça' })
  })
})

describe('rename of links and mentions', () => {
  it('changes every link to the old name, and keeps the heading and the shown text', () => {
    const md = 'Ver [[Santa Ilha]], [[santa ilha#Descrição]] e [[Santa Ilha|a ilha]]. Não [[Santa Ilhas]].'
    const r = renameLinks(md, 'Santa Ilha', 'Ilha de Santa Clara')
    expect(r.count).toBe(3)
    expect(r.text).toBe('Ver [[Ilha de Santa Clara]], [[Ilha de Santa Clara#Descrição]] e [[Ilha de Santa Clara|a ilha]]. Não [[Santa Ilhas]].')
  })

  it('changes the mentions by the old name on a card; a mention by an alias stays', () => {
    const notes = [entry('p', 'Santa Ilha', { aliases: ['a ilha'] }), entry('m', 'Marta')]
    const r = renameMentions('@Santa Ilha e @a ilha, com @Marta.', 'p', 'Santa Ilha', 'Ilha de Santa Clara', notes)
    expect(r).toEqual({ text: '@Ilha de Santa Clara e @a ilha, com @Marta.', count: 1 })
  })

  it('changes the cards of a story line body', () => {
    const body = ['# Cards', '- ^c1 @Marta chega a @Santa Ilha.', '- ^c2 Sem nomes.', '', '# By chapter', '## Um ^k1', '^c1 ^c2'].join('\n')
    const notes = [entry('p', 'Santa Ilha'), entry('m', 'Marta')]
    const r = renameMentionsInBoard(body, 'p', 'Santa Ilha', 'Ilha Nova', notes, [])
    expect(r?.count).toBe(1)
    expect(r?.body).toContain('- ^c1 @Marta chega a @Ilha Nova.')
    expect(renameMentionsInBoard(body, 'm', 'Elias', 'X', notes, [])).toBeNull()
  })

  it('finds a name in plain text as a whole word', () => {
    expect(textUsesName('Ele viu Santa  Ilha ao longe.', 'Santa Ilha')).toBe(true)
    expect(textUsesName('Santa Ilhas', 'Santa Ilha')).toBe(false)
  })
})

describe('names', () => {
  it('finds the note that already has a name or an alias, without case', () => {
    const notes = [entry('e', 'Elias', { aliases: ['o faroleiro'] }), entry('m', 'Marta')]
    expect(nameOwner(notes, 'elias')?.id).toBe('e')
    expect(nameOwner(notes, 'O Faroleiro')?.id).toBe('e')
    expect(nameOwner(notes, 'Marta', 'm')).toBeUndefined()
    expect(nameOwner(notes, 'Pedro')).toBeUndefined()
  })

  it('makes a free name', () => {
    expect(freeName('Elias', ['elias', 'Elias 2'])).toBe('Elias 3')
    expect(freeName('Pedro', ['Elias'])).toBe('Pedro')
  })

  it('sorts names in natural order', () => {
    expect(['Nota 10', 'Nota 2', 'nota 100', 'Ana'].sort(compareNames)).toEqual(['Ana', 'Nota 2', 'Nota 10', 'nota 100'])
  })

  it('counts each name of a note once', () => {
    expect(entryNames(entry('e', 'Elias', { aliases: ['Elias', 'elias', 'o faroleiro'] }))).toEqual(['Elias', 'o faroleiro'])
  })
})

describe('folders', () => {
  it('puts a note of a folder under a category in the category', () => {
    expect(topFolder('Characters/Secundarios')).toBe('Characters')
    expect(inFolder({ category: 'Characters/Secundarios' }, 'Characters')).toBe(true)
    expect(inFolder({ category: 'Characters' }, 'Characters')).toBe(true)
    expect(inFolder({ category: 'CharactersX' }, 'Characters')).toBe(false)
    expect(inFolder({ category: '' }, '')).toBe(true)
    expect(entryPath('', 'Solta.md')).toBe('Solta.md')
    expect(entryPath('Places', 'Porto.md')).toBe('Places/Porto.md')
  })
})

describe('the name of a note on disk', () => {
  it('keeps a name with signs that a file name cannot have in the front matter', () => {
    const e = entry('e', 'Dr. Silva: o médico', { file: 'Characters/Dr. Silva o médico.md' })
    const src = entryToFile(e)
    expect(src).toContain('title: "Dr. Silva: o médico"')
    expect(entryFromFile(e.file, src, 'x').name).toBe('Dr. Silva: o médico')
  })

  it('writes no title when the name is the file name', () => {
    expect(entryToFile(entry('m', 'Marta'))).not.toContain('title:')
  })
})

describe('import of notes', () => {
  it('turns an embed of a note into a link and removes an embed of a file without a loose space', () => {
    expect(cleanObsidian('Veja [[Marta]] e ![[mapa.png]].')).toBe('Veja [[Marta]] e.')
    expect(cleanObsidian('Antes ![[mapa.png]] depois')).toBe('Antes depois')
    expect(cleanObsidian('![[foto.jpg]] Texto')).toBe('Texto')
    expect(cleanObsidian('Ver ![[Marta]] aqui')).toBe('Ver [[Marta]] aqui')
    expect(cleanObsidian('Um\n\n![[a.png]]\n\nDois')).toBe('Um\n\nDois')
  })

  it('renames a note whose name is taken, and keeps the front matter', () => {
    const items = planImport(
      [
        { name: 'Elias', text: '---\ntags: [personagem, farol]\n---\nTexto.' },
        { name: 'Pedro', text: 'Um.' },
        { name: 'pedro', text: 'Dois.' }
      ],
      'Characters',
      ['Elias', 'Marta']
    )
    expect(items.map((i) => [i.name, i.renamedFrom])).toEqual([
      ['Elias 2', 'Elias'],
      ['Pedro', undefined],
      ['pedro 2', 'pedro']
    ])
    expect(items[0].extra.meta).toEqual({ tags: ['personagem', 'farol'] })
  })
})

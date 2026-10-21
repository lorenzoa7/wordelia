import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { readImport, splitHtml } from './import'

let dir = ''
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wordelia-import-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function file(name: string, text: string): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, text)
  return path
}

describe('plain text import', () => {
  it('splits on chapter headings in words', async () => {
    const book = await readImport(
      await file('farol.txt', 'O Farol de Santa Ilha\n\nCapítulo Um\n\nElias acendeu o farol.\n* * *\nA noite caiu.\n\nCapítulo Dois\n\nMarta chegou de barco.\n- Quem está aí?\n')
    )
    expect(book.title).toBe('O Farol de Santa Ilha')
    expect(book.chapters.map((c) => c.title)).toEqual(['Capítulo Um', 'Capítulo Dois'])
    // A real marker is a scene break, and a dash at the start of a line stays text (not a list).
    expect(book.chapters[0].markdown).toBe('Elias acendeu o farol.\n\n* * *\n\nA noite caiu.')
    expect(book.chapters[1].markdown).toBe('Marta chegou de barco.\n\n\\- Quem está aí?')
  })

  it('a text without headings is one chapter without a title', async () => {
    const book = await readImport(await file('notas.txt', 'Elias acendeu o farol.\nA noite caiu.\n'))
    expect(book.chapters).toHaveLength(1)
    expect(book.chapters[0].title).toBe('')
  })
})

describe('Markdown import', () => {
  it('"# Book title" and "## Capítulo N": the book title, then one chapter for each heading', async () => {
    const book = await readImport(
      await file('farol.md', '# O Farol de Santa Ilha\n\n## Capítulo 1\n\nElias acendeu o farol.\n\n#\n\nA noite caiu.\n\n## Capítulo 2: O Visitante\n\nMarta chegou.\n')
    )
    expect(book.title).toBe('O Farol de Santa Ilha')
    expect(book.chapters.map((c) => c.title)).toEqual(['Capítulo 1', 'O Visitante'])
    // "#" alone is a scene break, not an empty heading.
    expect(book.chapters[0].markdown).toBe('Elias acendeu o farol.\n\n* * *\n\nA noite caiu.\n')
  })

  it('"# Chapter" headings with "## Scene" headings inside: one chapter for each "#"', async () => {
    const book = await readImport(await file('cenas.md', '# Capítulo 1\n\n## Cena 1\n\nTexto.\n\n## Cena 2\n\nMais texto.\n'))
    expect(book.chapters.map((c) => c.title)).toEqual(['Capítulo 1'])
  })

  it('parts and chapters: the chapters are the headings that say "Chapter"', async () => {
    const book = await readImport(await file('partes.md', '# Part One\n\n## Chapter 1\n\nA.\n\n## Chapter 2\n\nB.\n\n# Part Two\n\n## Chapter 3\n\nC.\n'))
    expect(book.chapters).toHaveLength(3)
  })
})

describe('DOCX import', () => {
  const docx = async (name: string, paragraphs: Paragraph[]): Promise<string> => {
    const buffer = await Packer.toBuffer(new Document({ sections: [{ children: paragraphs }] }))
    const path = join(dir, name)
    await writeFile(path, buffer)
    return path
  }

  it('Heading 1 chapters; the title page gives the title and the author', async () => {
    const book = await readImport(
      await docx('farol.docx', [
        new Paragraph({ text: 'O Farol de Santa Ilha', heading: HeadingLevel.TITLE }),
        new Paragraph('Ana Exemplo'),
        new Paragraph({ text: 'Capítulo 1', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Elias acendeu o farol.'),
        new Paragraph({ text: 'Capítulo 2: O Visitante', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Marta chegou.')
      ])
    )
    expect(book.title).toBe('O Farol de Santa Ilha')
    expect(book.author).toBe('Ana Exemplo')
    expect(book.chapters.map((c) => c.title)).toEqual(['Capítulo 1', 'O Visitante'])
  })

  it('no heading styles: paragraphs like "Capítulo Um" start the chapters', () => {
    const r = splitHtml('<p>O Farol</p><p>Capítulo Um</p><p>Elias.</p><p></p><p>Capítulo Dois</p><p>Marta.</p>')
    expect(r.chapters.map((c) => c.title)).toEqual(['Capítulo Um', 'Capítulo Dois'])
    expect(r.front).toBe('<p>O Farol</p>')
  })
})

describe('a folder of notes', () => {
  it('each Markdown file is one chapter, in the order of the names', async () => {
    const notes = join(dir, 'Notas')
    await mkdir(notes)
    await writeFile(join(notes, '10 Fim.md'), 'O fim.\n')
    await writeFile(join(notes, '2 Meio.md'), '# O Meio\n\nO meio.\n')
    await writeFile(join(notes, '1 Início.md'), '---\ntitle: O Começo\n---\nO começo.\n')
    const book = await readImport(notes)
    expect(book.title).toBe('Notas')
    expect(book.chapters.map((c) => c.title)).toEqual(['O Começo', 'O Meio', '10 Fim'])
    expect(book.chapters[1].markdown).toBe('O meio.\n')
  })
})

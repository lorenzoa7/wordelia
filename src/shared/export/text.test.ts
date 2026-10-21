import { describe, expect, it } from 'vitest'
import { DEFAULT_EXPORT, newManifest } from '../book'
import type { Chapter } from '../types'
import { buildExportBook } from './model'
import { bookToMarkdown, bookToPlainText } from './text'

function book(body: string, sceneBreak: 'asterisks' | 'fleuron' = 'asterisks') {
  const m = newManifest({ title: 'The Lighthouse', author: 'Ana Exemplo', language: 'en' })
  const ch: Chapter = { id: 'ch_1', file: 'The Storm.md', title: 'The Storm', body, meta: {} }
  return buildExportBook(m, [ch], 10, { ...DEFAULT_EXPORT, sceneBreak })
}

describe('plain text export', () => {
  it('writes the scene break symbol and real line breaks', () => {
    const txt = bookToPlainText(book('Line one\\\nline two.\n\n* * *\n\nA new scene.\n', 'fleuron'))
    expect(txt).toContain('Line one\nline two.\n\n❦\n\nA new scene.')
    expect(txt).not.toContain('\\')
  })
  it('keeps real asterisks and underscores', () => {
    const txt = bookToPlainText(book('A star \\* and a \\_line\\_ and *italic*.\n'))
    expect(txt).toContain('A star * and a _line_ and italic.')
  })
  it('leaves out the marks that only Wordelia reads', () => {
    const txt = bookToPlainText(book('Centered.\n{align=center}\n\n<!-- page break -->\n\n&nbsp;\n\nBig [word]{size=18}.\n'))
    expect(txt).toContain('Centered.\n\nBig word.')
    expect(txt).not.toMatch(/\{|<!--|&nbsp;/)
  })
  it('starts with the title and the author, then the chapters', () => {
    expect(bookToPlainText(book('Text.\n'))).toBe('The Lighthouse\nAna Exemplo\n\n\n1\nThe Storm\n\nText.\n')
  })
})

describe('Markdown export', () => {
  it('puts a heading of the chapter text under the chapter title', () => {
    const md = bookToMarkdown(book('## Part one\n\nText.\n'))
    expect(md).toContain('## The Storm\n\n### Part one\n\nText.')
  })
  it('leaves out alignment, spans, page breaks and empty paragraphs', () => {
    const md = bookToMarkdown(book('Centered.\n{align=center}\n\n<!-- page break -->\n\n&nbsp;\n\nBig [word]{size=18} and *more*.\n\nOne\\\ntwo.\n'))
    expect(md).toContain('Centered.\n\nBig word and *more*.\n\nOne\\\ntwo.')
    expect(md).not.toMatch(/\{|<!--|&nbsp;/)
  })
  it('keeps scene breaks', () => {
    expect(bookToMarkdown(book('A.\n\n* * *\n\nB.\n'))).toContain('A.\n\n* * *\n\nB.')
  })
})

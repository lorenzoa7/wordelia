import { describe, expect, it } from 'vitest'
import { newManifest } from '../book'
import type { Chapter } from '../types'
import { buildPrintHtml } from './html'
import { buildExportBook, exportSettingsToKeep, presetSettings, startExportSettings } from './model'

function manifest(language = 'pt-BR') {
  return newManifest({ title: 'O Farol', author: 'Ana Exemplo', language })
}
const chapter = (body: string): Chapter => ({ id: 'ch_1', file: 'A Tempestade.md', title: 'A Tempestade', body, meta: {} })

describe('manuscript PDF', () => {
  it('has page numbers without the running header', () => {
    const m = manifest()
    const s = { ...presetSettings('manuscript', m.export, m), runningHeader: false }
    const html = buildPrintHtml(buildExportBook(m, [chapter('Texto.\n')], 1200, s), '')
    expect(html).toContain('@top-right { content: counter(page);')
  })
  it('has a running header without page numbers', () => {
    const m = manifest()
    const s = { ...presetSettings('manuscript', m.export, m), pageNumbers: false }
    const html = buildPrintHtml(buildExportBook(m, [chapter('Texto.\n')], 1200, s), '')
    expect(html).toContain('content: "Exemplo / O FAROL";')
    expect(html).not.toContain('counter(page)')
  })
  it('writes the title page in the language of the book', () => {
    const m = manifest()
    const html = buildPrintHtml(buildExportBook(m, [chapter('Texto.\n')], 81234, presetSettings('manuscript', m.export, m)), '')
    expect(html).toContain('cerca de 81.000 palavras')
    expect(html).toContain('por Ana Exemplo')
    expect(html).not.toContain('about')
  })
})

describe('book PDF', () => {
  it('keeps a paragraph alignment that differs from the book', () => {
    const m = manifest()
    const html = buildPrintHtml(buildExportBook(m, [chapter('Um.\n\nDois.\n{align=left}\n')], 2), '')
    expect(html).toContain('<p class="a-left">Dois.</p>')
  })
  it('indents the first paragraph when the book typography says so', () => {
    const m = manifest()
    m.typography.indentFirstParagraph = true
    const html = buildPrintHtml(buildExportBook(m, [chapter('Um.\n\nDois.\n')], 2), '')
    expect(html).toContain('<p>Um.</p>')
  })
})

describe('export settings', () => {
  it('give the book preset the page and the typography of the Write view', () => {
    const m = manifest()
    m.export.margins = { top: 15, bottom: 15, inner: 12, outer: 12 }
    const s = presetSettings('book', presetSettings('manuscript', m.export, m), m)
    expect(s.pageSize).toBe(m.export.pageSize)
    expect(s.margins).toEqual(m.export.margins)
    expect(s.typography.fontSize).toBe(m.typography.fontSize)
    expect(s.typography.lineHeight).toBe(m.typography.lineHeight)
  })
  it('never keep the page of a manuscript export in the book', () => {
    const m = manifest()
    const used = presetSettings('manuscript', m.export, m)
    expect(used.pageSize).toBe('A4')
    const kept = exportSettingsToKeep(m, used)
    expect(kept.pageSize).toBe('A5')
    expect(kept.margins).toEqual(m.export.margins)
    expect(kept.preset).toBe('manuscript')
    // The next export of the manuscript has the manuscript page again.
    expect(startExportSettings({ ...m, export: kept }).pageSize).toBe('A4')
  })
})

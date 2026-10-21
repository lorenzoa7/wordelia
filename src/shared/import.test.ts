import { describe, expect, it } from 'vitest'
import { blankLineStats, chooseBlankLines, isChapterHeading, isSceneBreakMarker, sceneBreakPlan, stripChapterLabel, type BlockKind } from './import'

describe('chapter headings in imported text', () => {
  it('finds headings with digits, roman numerals and number words', () => {
    for (const line of [
      'Capítulo Um',
      'CAPÍTULO DOIS',
      'Capítulo 3',
      'Capítulo Vinte e Um',
      'Capítulo Primeiro',
      'Chapter Twenty-One',
      'Chapter XII',
      'Capítulo 4: O Farol',
      'Chapter Two — The Storm',
      'Capítulo 5 A Visita',
      'Capítulo Diez',
      'Prólogo',
      'Epilogue'
    ]) {
      expect(isChapterHeading(line), line).toBe(true)
    }
  })

  it('does not take prose for a heading', () => {
    for (const line of [
      'Capítulo um da minha vida foi difícil.',
      'Part of me wanted to stay,',
      'Parte do problema era o farol.',
      'Livro de receitas',
      'Chapter one was the hardest to write, she said, and the rest came later in the year.',
      'Elias acendeu o farol.'
    ]) {
      expect(isChapterHeading(line), line).toBe(false)
    }
  })

  it('strips the label and the number from a heading', () => {
    expect(stripChapterLabel('Capítulo Um: A Tempestade')).toBe('A Tempestade')
    expect(stripChapterLabel('Chapter 2 — The Visitor')).toBe('The Visitor')
    expect(stripChapterLabel('Capítulo Vinte e Um')).toBe('')
    expect(stripChapterLabel('A Tempestade')).toBe('A Tempestade')
  })
})

describe('scene break markers', () => {
  it('knows the common markers', () => {
    for (const m of ['* * *', '***', '*', '#', '⁂', '~', '* * * *', '---', '———', ' * * * ', '# # #']) {
      expect(isSceneBreakMarker(m), m).toBe(true)
    }
  })

  it('does not take text or a single dash for a marker', () => {
    for (const m of ['', '—', '-', 'Fim', '* Olá', '...', '— Quem é?']) {
      expect(isSceneBreakMarker(m), m).toBe(false)
    }
  })
})

/** "T" text, "_" empty, "M" marker, "O" other */
const kinds = (s: string): BlockKind[] => [...s].map((c) => (c === 'T' ? 'text' : c === '_' ? 'empty' : c === 'M' ? 'marker' : 'other'))

describe('blank lines in an imported document', () => {
  it('a blank line between most paragraphs is spacing (Google Docs)', () => {
    const doc = [kinds('T_T_T_T_T_T'), kinds('T_T_T_T')]
    expect(chooseBlankLines(blankLineStats(doc))).toBe('spacing')
  })

  it('rare blank lines are scene breaks', () => {
    const doc = [kinds('TTTTTTTTTT_TTTTTTTTTTTT'), kinds('TTTTTTTTT_TTTTTTTT')]
    expect(chooseBlankLines(blankLineStats(doc))).toBe('breaks')
  })

  it('a document with markers uses the markers for its breaks', () => {
    const doc = [kinds('TTTTTTTTTTT_TTTTTTTTT_M_TTTTTTTTTTT')]
    expect(chooseBlankLines(blankLineStats(doc))).toBe('spacing')
  })

  it('no blank lines: nothing to decide', () => {
    expect(chooseBlankLines(blankLineStats([kinds('TTTT')]))).toBe('spacing')
  })
})

describe('the scene breaks of a chapter', () => {
  it('spacing: only markers are breaks; the blank lines go away', () => {
    expect(sceneBreakPlan(kinds('T_T_M_T_T'), 'spacing')).toEqual([0, 2, 'break', 6, 8])
  })

  it('breaks: blank lines are breaks, and a marker with blank lines around it is one break', () => {
    expect(sceneBreakPlan(kinds('TT__T_M_T'), 'breaks')).toEqual([0, 1, 'break', 4, 'break', 8])
  })

  it('a chapter never starts or ends with a break', () => {
    expect(sceneBreakPlan(kinds('_M_T_TM__'), 'breaks')).toEqual([3, 'break', 5])
  })
})

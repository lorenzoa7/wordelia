import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './parse'
import { serializeMarkdown } from './serialize'
import { readFrontmatter, writeFrontmatter } from './frontmatter'
import type { DocNode } from '../types'

const p = (text: string, marks?: DocNode['marks']): DocNode => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const para = (...content: DocNode[]): DocNode => ({ type: 'paragraph', ...(content.length ? { content } : {}) })
const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content })

function roundTrip(md: string): string {
  return serializeMarkdown(parseMarkdown(md))
}

describe('parseMarkdown', () => {
  it('parses paragraphs and dialogue dashes', () => {
    const d = parseMarkdown('— Sentiu isso? — perguntou o velho.\n\nOutro parágrafo.\n')
    expect(d).toEqual(doc(para(p('— Sentiu isso? — perguntou o velho.')), para(p('Outro parágrafo.'))))
  })

  it('parses italic, bold and underline', () => {
    const d = parseMarkdown('A *carta* e **ouro** e <u>sublinhado</u>.')
    expect(d.content?.[0].content).toEqual([
      p('A '),
      p('carta', [{ type: 'italic' }]),
      p(' e '),
      p('ouro', [{ type: 'bold' }]),
      p(' e '),
      p('sublinhado', [{ type: 'underline' }]),
      p('.')
    ])
  })

  it('parses scene breaks in several forms', () => {
    for (const src of ['* * *', '***', '---', '⁂', '#']) {
      const d = parseMarkdown(`Antes.\n\n${src}\n\nDepois.`)
      expect(d.content?.[1]).toEqual({ type: 'sceneBreak' })
    }
  })

  it('parses bracketed spans with font and size', () => {
    const d = parseMarkdown('Texto [grande *e itálico*]{font="EB Garamond" size=18} aqui.')
    const span = { type: 'textStyle', attrs: { fontFamily: 'EB Garamond', fontSize: '18pt' } }
    expect(d.content?.[0].content).toEqual([
      p('Texto '),
      p('grande ', [span]),
      p('e itálico', [span, { type: 'italic' }]),
      p(' aqui.')
    ])
  })

  it('parses paragraph alignment and no-indent attributes', () => {
    const d = parseMarkdown('Fim.\n{align=center}\n\nCarta.\n{align=right indent=0}')
    expect(d.content?.[0]).toEqual({ type: 'paragraph', attrs: { textAlign: 'center' }, content: [p('Fim.')] })
    expect(d.content?.[1]).toEqual({
      type: 'paragraph',
      attrs: { textAlign: 'right', noIndent: true },
      content: [p('Carta.')]
    })
  })

  it('keeps intentional empty paragraphs', () => {
    const d = parseMarkdown('Um.\n\n&nbsp;\n\nDois.')
    expect(d.content?.[1]).toEqual({ type: 'paragraph' })
  })

  it('parses lists, quotes, headings and links for planning notes', () => {
    const d = parseMarkdown('## Aparência\n\n- Alto\n- Olhos [verdes](https://x.y)\n\n> Uma citação.')
    expect(d.content?.[0]).toEqual({ type: 'heading', attrs: { level: 2 }, content: [p('Aparência')] })
    expect(d.content?.[1].type).toBe('bulletList')
    expect(d.content?.[1].content?.length).toBe(2)
    expect(d.content?.[2].type).toBe('blockquote')
  })

  it('treats a lone image paragraph as a block image', () => {
    const d = parseMarkdown('![Heitor](_assets/heitor.webp)')
    expect(d.content?.[0]).toEqual({ type: 'image', attrs: { src: '_assets/heitor.webp', alt: 'Heitor', title: null } })
  })

  it('gives an empty paragraph for empty input', () => {
    expect(parseMarkdown('')).toEqual(doc(para()))
  })
})

describe('serializeMarkdown', () => {
  it('keeps whitespace outside emphasis delimiters', () => {
    const d = doc(para(p('a '), p('b ', [{ type: 'italic' }]), p('c')))
    expect(serializeMarkdown(d)).toBe('a *b* c\n')
  })

  it('nests marks in a stable order', () => {
    const d = doc(para(p('x', [{ type: 'italic' }, { type: 'bold' }])))
    expect(serializeMarkdown(d)).toBe('***x***\n')
  })

  it('escapes Markdown characters in text', () => {
    const d = doc(para(p('2 * 3 = [6] <ok> _x_ & {a}')))
    const md = serializeMarkdown(d)
    expect(parseMarkdown(md)).toEqual(d)
  })

  it('escapes block syntax at the start of a paragraph', () => {
    for (const text of ['- not a list', '# not a heading', '> not a quote', '1. not a list', '+ plus']) {
      const d = doc(para(p(text)))
      expect(parseMarkdown(serializeMarkdown(d))).toEqual(d)
    }
  })

  it('serializes hard breaks', () => {
    const d = doc(para(p('linha um'), { type: 'hardBreak' }, p('linha dois')))
    expect(serializeMarkdown(d)).toBe('linha um\\\nlinha dois\n')
    expect(parseMarkdown(serializeMarkdown(d))).toEqual(d)
  })

  it('drops trailing empty paragraphs', () => {
    expect(serializeMarkdown(doc(para(p('a')), para(), para()))).toBe('a\n')
  })
})

describe('round trip', () => {
  const samples = [
    'Primeiro parágrafo.\n\n— Fala! — disse ele.\n\n* * *\n\nNova cena com *itálico* e **negrito**.\n',
    'Texto [maior]{font="Lora" size=16} e <u>sub</u> e ~~risco~~.\n',
    'Centralizado.\n{align=center}\n',
    '## Título\n\n- um\n- dois\n  - três\n\n1. a\n2. b\n\n> cit\n> ação\n',
    'Um.\n\n&nbsp;\n\nDois.\n',
    'Com link [aqui](https://example.com/a%20b) e código `x*y`.\n',
    '*itálico com **negrito** dentro* fim.\n'
  ]
  for (const s of samples) {
    it(`is stable: ${JSON.stringify(s.slice(0, 30))}`, () => {
      const once = roundTrip(s)
      expect(roundTrip(once)).toBe(once)
      expect(parseMarkdown(once)).toEqual(parseMarkdown(s))
    })
  }
})

describe('frontmatter', () => {
  it('reads and writes YAML frontmatter', () => {
    const src = '---\nid: ch_1\ntitle: O Viajante\n---\nCorpo.\n'
    const fm = readFrontmatter(src)
    expect(fm.data).toEqual({ id: 'ch_1', title: 'O Viajante' })
    expect(fm.body).toBe('Corpo.\n')
    expect(writeFrontmatter(fm.data, fm.body)).toBe(src)
  })

  it('handles files without frontmatter and bad YAML', () => {
    expect(readFrontmatter('Só texto').data).toEqual({})
    expect(readFrontmatter('---\n: : bad\n---\nx').body).toBe('x')
  })

  it('writes back frontmatter that is not valid YAML, unchanged', () => {
    const src = '---\ntags: a\ntags: b\n---\nCorpo.\n'
    const fm = readFrontmatter(src)
    expect(fm.body).toBe('Corpo.\n')
    expect(writeFrontmatter({ ...fm.data, id: 'x' }, fm.body)).toBe(src)
  })
})

describe('review findings', () => {
  const rt = (d: DocNode): DocNode => parseMarkdown(serializeMarkdown(d))

  it('keeps a hard break at the end of a paragraph', () => {
    const d = doc(para(p('Verso um'), { type: 'hardBreak' }), para(p('Outro')))
    expect(rt(d)).toEqual(d)
  })

  it('keeps paragraphs that are only a number with a dot or parenthesis', () => {
    for (const text of ['1984.', '2)', '1.', '12. Doze']) {
      const d = doc(para(p(text)))
      expect(rt(d)).toEqual(d)
    }
  })

  it('keeps emphasis next to punctuation and other emphasis', () => {
    const cases: DocNode[] = [
      doc(para(p('a', [{ type: 'bold' }]), p('b', [{ type: 'bold' }, { type: 'italic' }]), p('c', [{ type: 'italic' }]))),
      doc(para(p('"Hi!"', [{ type: 'italic' }]), p('he said'))),
      doc(para(p('said'), p('"Hi"', [{ type: 'italic' }]))),
      doc(para(p('palavra', [{ type: 'bold' }]), p('-composta')))
    ]
    for (const d of cases) expect(rt(d)).toEqual(d)
  })

  it('drops marks on whitespace-only runs', () => {
    const d = doc(para(p('a'), p('  ', [{ type: 'italic' }]), p('b', [{ type: 'bold' }])))
    expect(rt(d)).toEqual(doc(para(p('a  '), p('b', [{ type: 'bold' }]))))
  })

  it('writes wiki links without escapes', () => {
    const d = doc(para(p('Veja [[Heitor Ferrari]] e [[Teresa|ela]].')))
    expect(serializeMarkdown(d)).toBe('Veja [[Heitor Ferrari]] e [[Teresa|ela]].\n')
    expect(rt(d)).toEqual(d)
  })

  it('keeps list items with two paragraphs and two lists in a row', () => {
    const li = (...c: DocNode[]): DocNode => ({ type: 'listItem', content: c })
    const d1 = doc({ type: 'bulletList', content: [li(para(p('um')), para(p('dois'))), li(para(p('três')))] })
    expect(rt(d1)).toEqual(d1)
    const d2 = doc({ type: 'bulletList', content: [li(para(p('a')))] }, { type: 'bulletList', content: [li(para(p('b')))] })
    expect(rt(d2)).toEqual(d2)
  })

  it('does not turn "!" before a link into an image', () => {
    const d = doc(para(p('Wow!'), p('here', [{ type: 'link', attrs: { href: 'https://x.y' } }])))
    expect(rt(d)).toEqual(d)
  })
})

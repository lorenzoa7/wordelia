import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './parse'
import { serializeMarkdown } from './serialize'
import type { DocNode } from '../types'

const t = (text: string, marks?: DocNode['marks']): DocNode => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const para = (...content: DocNode[]): DocNode => ({ type: 'paragraph', ...(content.length ? { content } : {}) })
const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content })
const B = { type: 'bold' }
const I = { type: 'italic' }
const U = { type: 'underline' }
const S = { type: 'strike' }
const br: DocNode = { type: 'hardBreak' }

const cases: Record<string, DocNode> = {
  trailingHardBreak: doc(para(t('Line one'), br), para(t('Next'))),
  onlyHardBreak: doc(para(br), para(t('Next'))),
  trailingBreakCentered: doc({ type: 'paragraph', attrs: { textAlign: 'center' }, content: [t('Fim.'), br] }),
  yearParagraph: doc(para(t('1984.')), para(t('Text'))),
  numberParen: doc(para(t('2)')), para(t('Text'))),
  bangLink: doc(para(t('Wow!'), t('here', [{ type: 'link', attrs: { href: 'https://x.y' } }]))),
  boldThenBoldItalicThenItalic: doc(para(t('a', [B]), t('b', [B, I]), t('c', [I]))),
  italicThenBold: doc(para(t('a', [I]), t('b', [B]))),
  boldThenItalic: doc(para(t('a', [B]), t('b', [I]))),
  italicPunctBeforeLetter: doc(para(t('"Hi!"', [I]), t('he said'))),
  letterBeforeItalicPunct: doc(para(t('said'), t('"Hi"', [I]))),
  italicSpaceOnly: doc(para(t('a '), t(' ', [I]), t('b'))),
  italicWhitespaceEdge: doc(para(t('a'), t(' b ', [I]), t('c'))),
  strikeInBold: doc(para(t('x', [B, S]), t('y', [S]))),
  underlineBold: doc(para(t('a', [U]), t('b', [U, B]))),
  multiParaListItem: doc({
    type: 'bulletList',
    content: [{ type: 'listItem', content: [para(t('First')), para(t('Second'))] }]
  }),
  listItemThenList: doc({
    type: 'bulletList',
    content: [{ type: 'listItem', content: [para(t('One'))] }, { type: 'listItem', content: [para(t('Two'))] }]
  }),
  bulletThenOrdered: doc(
    { type: 'bulletList', content: [{ type: 'listItem', content: [para(t('One'))] }] },
    { type: 'orderedList', content: [{ type: 'listItem', content: [para(t('Two'))] }] }
  ),
  twoBulletLists: doc(
    { type: 'bulletList', content: [{ type: 'listItem', content: [para(t('One'))] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [para(t('Two'))] }] }
  ),
  leadingEmptyPara: doc(para(), para(t('Text'))),
  emptyMiddle: doc(para(t('A')), para(), para(), para(t('B'))),
  wikiLink: doc(para(t('See [[Heitor Ferrari]] now'))),
  tabs: doc(para(t('a\tb'))),
  sceneGlyph: doc(para(t('⁂'))),
  hashOnly: doc(para(t('#'))),
  ampEntity: doc(para(t('AT&T &amp; &copy;'))),
  backslashEnd: doc(para(t('path\\'))),
  bracketText: doc(para(t('[note]{align=center}'))),
  attrLike: doc(para(t('x {align=center}'))),
  nbspOnly: doc(para(t(' '))),
  linkWithParens: doc(para(t('w', [{ type: 'link', attrs: { href: 'https://e.org/a_(b)' } }]))),
  boldItalicSame: doc(para(t('ab', [B, I]))),
  italicBoldStart: doc(para(t('x', [I]), t('y', [I, B]))),
  italicInsideWordBoldAfter: doc(para(t('un'), t('believ', [I]), t('able', [B]))),
  codeWithBacktick: doc(para(t('a`b', [{ type: 'code' }]))),
  headingTrail: doc({ type: 'heading', attrs: { level: 2 }, content: [t('Title {x}')] }),
  quoteThenPara: doc({ type: 'blockquote', content: [para(t('Q'))] }, para(t('P'))),
  starsInText: doc(para(t('**not bold**'))),
  spanAndLink: doc(
    para(
      t('x', [
        { type: 'link', attrs: { href: 'u' } },
        { type: 'textStyle', attrs: { fontFamily: 'A', fontSize: '12pt' } }
      ])
    )
  ),
  spanWithBracketInFont: doc(para(t('x', [{ type: 'textStyle', attrs: { fontFamily: 'A}B', fontSize: null } }]))),
  leadingSpacesAfterBreak: doc(para(t('a'), br, t('    b'))),
  lineStartsWithEquals: doc(para(t('a'), br, t('= b'))),
  lineStartsDigitsAfterBreak: doc(para(t('a'), br, t('1. b'))),
  imageInline: doc(para(t('a'), { type: 'image', attrs: { src: 'x.png', alt: 'x', title: null } }, t('b'))),
  boldEndsInSpaceThenText: doc(para(t('bold ', [B]), t('plain'))),
  italicOverHardBreak: doc(para(t('a', [I]), br, t('b', [I])))
}

describe('scratch round trip', () => {
  for (const [name, d] of Object.entries(cases)) {
    it(name, () => {
      const md = serializeMarkdown(d)
      const back = parseMarkdown(md)
      const md2 = serializeMarkdown(back)
      const same = JSON.stringify(back) === JSON.stringify(d)
      console.log(
        `\n### ${name} ${same ? 'OK' : 'DIFF'}\nMD: ${JSON.stringify(md)}\n` +
          (same ? '' : `IN:  ${JSON.stringify(d)}\nOUT: ${JSON.stringify(back)}\nMD2 stable: ${md2 === md}\n`)
      )
      expect(true).toBe(true)
    })
  }
})

// DOCX export with real Word styles. Google Docs opens it without loss.

import {
  AlignmentType,
  Document,
  Footer,
  Header,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  type IRunOptions,
  type ISectionOptions
} from 'docx'
import { SCENE_BREAK_GLYPH } from '@shared/book'
import { PAGE_SIZES, headingParts, type ExportBook } from '@shared/export/model'
import type { DocMark, DocNode } from '@shared/types'

const TWIPS_PER_MM = 56.6929

function twips(mm: number): number {
  return Math.round(mm * TWIPS_PER_MM)
}

function runOptions(marks: DocMark[] | undefined): Partial<IRunOptions> {
  const o: { bold?: boolean; italics?: boolean; underline?: object; strike?: boolean; font?: string; size?: number } = {}
  for (const m of marks ?? []) {
    if (m.type === 'bold') o.bold = true
    if (m.type === 'italic') o.italics = true
    if (m.type === 'underline') o.underline = {}
    if (m.type === 'strike') o.strike = true
    if (m.type === 'textStyle') {
      if (m.attrs?.fontFamily) o.font = String(m.attrs.fontFamily)
      if (m.attrs?.fontSize) o.size = Math.round(Number.parseFloat(String(m.attrs.fontSize)) * 2)
    }
  }
  return o as Partial<IRunOptions>
}

function runs(nodes: DocNode[] | undefined): TextRun[] {
  const out: TextRun[] = []
  for (const n of nodes ?? []) {
    if (n.type === 'text') out.push(new TextRun({ text: n.text ?? '', ...runOptions(n.marks) }))
    else if (n.type === 'hardBreak') out.push(new TextRun({ break: 1 }))
  }
  return out
}

const ALIGN = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
} as const

function bodyParagraphs(nodes: DocNode[], glyph: string): Paragraph[] {
  const out: Paragraph[] = []
  let first = true
  const walk = (list: DocNode[], indentLevel = 0): void => {
    for (const n of list) {
      switch (n.type) {
        case 'paragraph': {
          const align = n.attrs?.textAlign as keyof typeof ALIGN | undefined
          out.push(
            new Paragraph({
              style: first || n.attrs?.noIndent || (align && align !== 'justify' && align !== 'left') ? 'FirstParagraph' : 'Normal',
              alignment: align && align !== 'justify' ? ALIGN[align] : undefined,
              indent: indentLevel ? { left: 720 * indentLevel } : undefined,
              children: runs(n.content)
            })
          )
          first = false
          break
        }
        case 'sceneBreak':
          out.push(new Paragraph({ style: 'SceneBreak', children: [new TextRun(glyph)] }))
          first = true
          break
        case 'heading':
          out.push(new Paragraph({ style: 'Heading2', children: runs(n.content) }))
          first = true
          break
        case 'blockquote':
          walk(n.content ?? [], indentLevel + 1)
          break
        case 'bulletList':
        case 'orderedList':
          for (const li of n.content ?? []) walk(li.content ?? [], indentLevel + 1)
          break
        default:
          break
      }
    }
  }
  walk(nodes)
  return out
}

export async function buildDocx(input: unknown): Promise<Buffer> {
  const book = input as ExportBook
  const s = book.settings
  const t = s.typography
  const size = PAGE_SIZES[s.pageSize]
  const manuscript = s.preset === 'manuscript'
  const glyph = SCENE_BREAK_GLYPH[s.sceneBreak] ?? '*  *  *'
  const halfPoints = Math.round(t.fontSize * 2)
  const line = Math.round(240 * t.lineHeight)
  const indent = Math.round(t.firstLineIndent * t.fontSize * 20)

  const page = {
    size: { width: twips(size.w), height: twips(size.h) },
    margin: {
      top: twips(s.margins.top),
      bottom: twips(s.margins.bottom),
      left: twips(s.margins.inner),
      right: twips(s.margins.outer),
      header: twips(Math.min(12, s.margins.top / 2)),
      footer: twips(Math.min(12, s.margins.bottom / 2))
    }
  }

  const sections: ISectionOptions[] = []

  if (s.titlePage) {
    const children = manuscript
      ? [
          new Paragraph({ children: [new TextRun(book.author)] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(`about ${(Math.round(book.words / 1000) * 1000 || book.words).toLocaleString('en-US')} words`)] }),
          new Paragraph({ spacing: { before: twips(70) }, alignment: AlignmentType.CENTER, children: [new TextRun(book.title.toUpperCase())] }),
          ...(book.subtitle ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(book.subtitle)] })] : []),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new TextRun(`by ${book.author}`)] })
        ]
      : [
          new Paragraph({ style: 'Title', spacing: { before: twips(size.h / 4) }, children: [new TextRun(book.title)] }),
          ...(book.subtitle ? [new Paragraph({ style: 'Subtitle', children: [new TextRun(book.subtitle)] })] : []),
          new Paragraph({ style: 'BookAuthor', children: [new TextRun(book.author)] })
        ]
    sections.push({ properties: { page }, children })
  }

  const body: Paragraph[] = []
  book.chapters.forEach((ch, i) => {
    const { label, title } = headingParts(book, ch)
    // The title page is its own section, so the first chapter always starts a page.
    const newPage = s.chapterStartsOnNewPage && i > 0
    if (label) {
      body.push(
        new Paragraph({
          style: 'ChapterNumber',
          pageBreakBefore: newPage,
          spacing: { before: twips(s.chapterDropFromTop) },
          children: [new TextRun(label)]
        })
      )
    }
    if (title) {
      // Heading 1 makes chapters appear in the navigation pane of Word and the outline of Google Docs.
      body.push(
        new Paragraph({
          style: 'Heading1',
          pageBreakBefore: !label && newPage,
          spacing: label ? undefined : { before: twips(s.chapterDropFromTop) },
          children: [new TextRun(title)]
        })
      )
    }
    body.push(...bodyParagraphs(ch.blocks, glyph))
  })

  const surname = book.author.trim().split(/\s+/).pop() ?? ''
  const footer = s.pageNumbers && !manuscript
    ? { default: new Footer({ children: [new Paragraph({ style: 'Folio', children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) }
    : undefined
  const header = s.runningHeader
    ? {
        default: new Header({
          children: [
            new Paragraph({
              alignment: manuscript ? AlignmentType.RIGHT : AlignmentType.CENTER,
              style: 'Folio',
              children: manuscript
                ? [new TextRun({ children: [`${surname} / ${book.title.toUpperCase()} / `, PageNumber.CURRENT] })]
                : [new TextRun({ text: book.title, italics: true })]
            })
          ]
        })
      }
    : undefined

  sections.push({
    properties: { page: { ...page, pageNumbers: { start: 1 } } },
    headers: header,
    footers: footer,
    children: body
  })

  const font = t.fontFamily
  const doc = new Document({
    title: book.title,
    creator: book.author,
    description: 'Exported from Wordelia',
    styles: {
      default: {
        document: { run: { font, size: halfPoints }, paragraph: { spacing: { line, lineRule: LineRuleType.AUTO } } },
        heading1: {
          run: { font, size: Math.round(halfPoints * (manuscript ? 1 : 1.25)), italics: !manuscript, bold: false, color: '111111' },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: manuscript ? 0 : 120, after: twips(manuscript ? 8 : 14) }, keepNext: true }
        },
        heading2: {
          run: { font, size: Math.round(halfPoints * 1.05), bold: true, color: '111111' },
          paragraph: { spacing: { before: 240, after: 120 }, keepNext: true }
        },
        title: { run: { font, size: halfPoints * 2.2, color: '111111' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 240 } } }
      },
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          run: { font, size: halfPoints },
          paragraph: {
            alignment: t.align === 'justify' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
            indent: { firstLine: indent },
            spacing: { line, lineRule: LineRuleType.AUTO, before: 0, after: 0 }
          }
        },
        {
          id: 'FirstParagraph',
          name: 'First Paragraph',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          paragraph: { indent: { firstLine: 0 } }
        },
        {
          id: 'ChapterNumber',
          name: 'Chapter Number',
          basedOn: 'Normal',
          next: 'Heading1',
          quickFormat: true,
          run: { size: Math.round(halfPoints * (manuscript ? 1 : 2.4)) },
          paragraph: { alignment: AlignmentType.CENTER, indent: { firstLine: 0 }, keepNext: true, spacing: { after: manuscript ? 0 : 120 } }
        },
        {
          id: 'SceneBreak',
          name: 'Scene Break',
          basedOn: 'Normal',
          next: 'FirstParagraph',
          quickFormat: true,
          paragraph: { alignment: AlignmentType.CENTER, indent: { firstLine: 0 }, spacing: { before: manuscript ? 0 : 200, after: manuscript ? 0 : 200 } }
        },
        {
          id: 'BookAuthor',
          name: 'Book Author',
          basedOn: 'Normal',
          run: { size: Math.round(halfPoints * 1.1) },
          paragraph: { alignment: AlignmentType.CENTER, indent: { firstLine: 0 }, spacing: { before: 480 } }
        },
        {
          id: 'Folio',
          name: 'Folio',
          basedOn: 'Normal',
          run: { size: Math.max(16, halfPoints - 4) },
          paragraph: { alignment: AlignmentType.CENTER, indent: { firstLine: 0 } }
        },
        {
          id: 'Subtitle',
          name: 'Subtitle',
          basedOn: 'Normal',
          run: { italics: true, size: Math.round(halfPoints * 1.2) },
          paragraph: { alignment: AlignmentType.CENTER, indent: { firstLine: 0 } }
        }
      ]
    },
    sections
  })
  return Packer.toBuffer(doc)
}

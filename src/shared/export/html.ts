// Print HTML for PDF export. Chromium prints it with CSS paged media.

import { SCENE_BREAK_GLYPH } from '../book'
import type { DocMark, DocNode } from '../types'
import { PAGE_SIZES, headingParts, type ExportBook } from './model'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cssString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function wrapMarks(text: string, marks: DocMark[] | undefined): string {
  let out = esc(text)
  for (const m of marks ?? []) {
    switch (m.type) {
      case 'bold':
        out = `<strong>${out}</strong>`
        break
      case 'italic':
        out = `<em>${out}</em>`
        break
      case 'underline':
        out = `<u>${out}</u>`
        break
      case 'strike':
        out = `<s>${out}</s>`
        break
      case 'textStyle': {
        const a = m.attrs ?? {}
        const style = [a.fontFamily ? `font-family:${cssString(String(a.fontFamily))}` : '', a.fontSize ? `font-size:${String(a.fontSize)}` : '']
          .filter(Boolean)
          .join(';')
        if (style) out = `<span style='${style}'>${out}</span>`
        break
      }
      case 'link':
        out = `<a href="${esc(String(m.attrs?.href ?? ''))}">${out}</a>`
        break
    }
  }
  return out
}

function inline(nodes: DocNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === 'text') return wrapMarks(n.text ?? '', n.marks)
      if (n.type === 'hardBreak') return '<br>'
      return ''
    })
    .join('')
}

function blocks(nodes: DocNode[], sceneGlyph: string): string {
  let firstInScene = true
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'paragraph': {
          const cls: string[] = []
          if (firstInScene || n.attrs?.noIndent) cls.push('first')
          const align = n.attrs?.textAlign
          if (align && align !== 'left' && align !== 'justify') cls.push(`a-${String(align)}`)
          firstInScene = false
          const content = inline(n.content)
          return `<p${cls.length ? ` class="${cls.join(' ')}"` : ''}>${content || '&nbsp;'}</p>`
        }
        case 'sceneBreak':
          firstInScene = true
          return `<div class="scene">${esc(sceneGlyph) || '&nbsp;'}</div>`
        case 'pageBreak':
          return '<div class="pagebreak"></div>'
        case 'heading': {
          firstInScene = true
          const level = Math.min(Number(n.attrs?.level ?? 2) + 1, 4)
          return `<h${level}>${inline(n.content)}</h${level}>`
        }
        case 'blockquote':
          return `<blockquote>${blocks(n.content ?? [], sceneGlyph)}</blockquote>`
        case 'bulletList':
        case 'orderedList': {
          const tag = n.type === 'bulletList' ? 'ul' : 'ol'
          return `<${tag}>${(n.content ?? []).map((li) => `<li>${blocks(li.content ?? [], sceneGlyph)}</li>`).join('')}</${tag}>`
        }
        case 'image':
          return ''
        default:
          return ''
      }
    })
    .join('\n')
}

export function buildPrintHtml(book: ExportBook, fontCss: string): string {
  const s = book.settings
  const size = PAGE_SIZES[s.pageSize]
  const t = s.typography
  const m = s.margins
  const glyph = SCENE_BREAK_GLYPH[s.sceneBreak] ?? '*  *  *'
  const manuscript = s.preset === 'manuscript'
  const surname = book.author.trim().split(/\s+/).pop() ?? ''
  const folio = `font-family: ${cssString(t.fontFamily)}; font-size: ${Math.max(8, t.fontSize - 2)}pt; color: #333;`
  const headerText = manuscript ? `${surname} / ${book.title.toUpperCase()} / ` : ''

  const pageRules = [
    `@page { size: ${size.w}mm ${size.h}mm; margin: ${m.top}mm ${m.outer}mm ${m.bottom}mm ${m.inner}mm; }`,
    manuscript ? '' : `@page :left { margin-left: ${m.outer}mm; margin-right: ${m.inner}mm; }`,
    manuscript ? '' : `@page :right { margin-left: ${m.inner}mm; margin-right: ${m.outer}mm; }`,
    s.pageNumbers && !manuscript ? `@page { @bottom-center { content: counter(page); ${folio} } }` : '',
    s.runningHeader && manuscript ? `@page { @top-right { content: ${cssString(headerText)} counter(page); ${folio} } }` : '',
    s.runningHeader && !manuscript ? `@page :left { @top-left { content: ${cssString(book.author)}; ${folio} font-style: italic; } } @page :right { @top-right { content: ${cssString(book.title)}; ${folio} font-style: italic; } }` : '',
    '@page title { @bottom-center { content: none; } @top-right { content: none; } @top-left { content: none; } }'
  ].join('\n')

  const chaptersHtml = book.chapters
    .map((ch, i) => {
      const { label, title } = headingParts(book, ch)
      const breakCls = s.chapterStartsOnNewPage || i === 0 ? ' newpage' : ''
      return `<section class="chapter${breakCls}">
<header class="chapter-head" style="padding-top:${s.chapterDropFromTop}mm">
${label ? `<div class="ch-label">${esc(label)}</div>` : ''}
${title ? `<h1 class="ch-title">${esc(title)}</h1>` : ''}
</header>
${blocks(ch.blocks, glyph)}
</section>`
    })
    .join('\n')

  const titlePage = s.titlePage
    ? manuscript
      ? `<section class="title-page ms">
<div class="ms-contact">${esc(book.author)}</div>
<div class="ms-words">about ${(Math.round(book.words / 1000) * 1000 || book.words).toLocaleString('en-US')} words</div>
<div class="ms-center"><div class="tp-title">${esc(book.title)}</div>${book.subtitle ? `<div class="tp-sub">${esc(book.subtitle)}</div>` : ''}<div class="tp-author">by ${esc(book.author)}</div></div>
</section>`
      : `<section class="title-page"><div class="tp-title">${esc(book.title)}</div>${book.subtitle ? `<div class="tp-sub">${esc(book.subtitle)}</div>` : ''}<div class="tp-rule"></div><div class="tp-author">${esc(book.author)}</div></section>`
    : ''

  return `<!doctype html>
<html lang="${esc(book.language)}">
<head>
<meta charset="utf-8">
<title>${esc(book.title)}</title>
<style>
${fontCss}
${pageRules}
html { -webkit-print-color-adjust: exact; }
body { margin: 0; font-family: ${cssString(t.fontFamily)}, Georgia, serif; font-size: ${t.fontSize}pt; line-height: ${t.lineHeight}; color: #111; text-align: ${t.align}; hyphens: auto; orphans: 2; widows: 2; font-kerning: normal; font-variant-ligatures: common-ligatures; }
p { margin: 0; text-indent: ${t.firstLineIndent}em; }
p.first { text-indent: 0; }
p.a-center { text-align: center; text-indent: 0; }
p.a-right { text-align: right; text-indent: 0; }
.scene { text-align: center; margin: ${manuscript ? '0' : '0.9em 0'}; text-indent: 0; letter-spacing: 0.3em; }
h2, h3, h4 { font-size: 1.05em; margin: 1.2em 0 0.6em; text-align: left; break-after: avoid; }
blockquote { margin: 0.8em 2em; }
.chapter.newpage { break-before: page; }
.pagebreak { break-after: page; height: 0; }
.chapter-head { text-align: center; margin-bottom: ${manuscript ? '2em' : '2.6em'}; break-after: avoid; }
.ch-label { font-size: ${manuscript ? '1em' : '2.4em'}; line-height: 1.1; ${manuscript ? 'text-transform: none;' : ''} }
.ch-title { font-size: ${manuscript ? '1em' : '1.2em'}; font-weight: normal; font-style: ${manuscript ? 'normal' : 'italic'}; margin: ${manuscript ? '0' : '0.6em 0 0'}; line-height: 1.3; }
.title-page { page: title; break-after: page; height: ${size.h - m.top - m.bottom - 2}mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.tp-title { font-size: 2.2em; line-height: 1.15; }
.tp-sub { font-size: 1.2em; font-style: italic; margin-top: 0.5em; }
.tp-rule { width: 3em; height: 1px; background: #444; margin: 1.6em 0; }
.tp-author { font-size: 1.1em; letter-spacing: 0.08em; text-transform: uppercase; }
.title-page.ms { justify-content: flex-start; align-items: stretch; text-align: left; line-height: 1.2; }
.ms-contact { text-align: left; }
.ms-words { text-align: right; margin-top: -1.2em; }
.ms-center { margin-top: 30%; text-align: center; }
.ms-center .tp-title { font-size: 1em; text-transform: uppercase; }
.ms-center .tp-author { font-size: 1em; text-transform: none; letter-spacing: 0; margin-top: 1.2em; }
</style>
</head>
<body>
${titlePage}
${chaptersHtml}
</body>
</html>`
}

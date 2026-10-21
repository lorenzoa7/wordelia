// Read a DOCX, Markdown or TXT file, or a folder of Markdown files, and split it into chapters.
// DOCX gives HTML (the renderer converts HTML to the document model and decides the scene breaks).
// A chapter without a title in the file has the title '': the renderer names it in the book language.

import mammoth from 'mammoth'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { ImportedBook, ImportedChapter } from '@shared/ipc'
import { readFrontmatter } from '@shared/markdown/frontmatter'
import { isChapterHeading, isSceneBreakMarker, stripChapterLabel } from '@shared/import'
import { countWords } from '@shared/book'

/**
 * Text before the first chapter is a title page (the title and the author of the book). From its first paragraph
 * with this many words, it is a chapter: a prologue without a heading.
 */
const PROSE_WORDS = 25
const TEXT_FILE = /\.(md|markdown|txt)$/i
/** A heading that names a chapter, not a part or a section */
const CHAPTER_LABEL = /^(cap[ií]tulo|chapter|chapitre|kapitel|capitolo|cap\.)(?=$|[\s.:—–-])/i

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/** "1\nThe Traveller" or "Chapter 1: The Traveller" -> "The Traveller". '' when the heading has only a number. */
export function chapterTitleFromHeading(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length > 1 && (/^[\divxlc]+\.?$/i.test(lines[0]) || (isChapterHeading(lines[0]) && !stripChapterLabel(lines[0])))) {
    return lines.slice(1).join(' ')
  }
  const one = lines.join(' ')
  if (/^[\divxlc]+\.?$/i.test(one)) return ''
  return stripChapterLabel(one) || one
}

/**
 * The heading level of the chapters, from candidate levels in order (shallow first). A level where most
 * headings say "Chapter" or "Capítulo" wins: the shallower levels are parts. Else the first level with
 * two or more headings, else the first level with a heading.
 */
function pickLevel<T extends { texts: string[] }>(levels: T[]): T | null {
  const used = levels.filter((l) => l.texts.length)
  return (
    used.find((l) => l.texts.filter((t) => CHAPTER_LABEL.test(t.trim())).length * 2 > l.texts.length) ??
    used.find((l) => l.texts.length >= 2) ??
    used[0] ??
    null
  )
}

/** A top-level element that starts a chapter */
interface Cut {
  at: number
  end: number
  text: string
}

function cutsOf(html: string, re: RegExp, keep: (text: string) => boolean = () => true): Cut[] {
  const out: Cut[] = []
  for (const m of html.matchAll(re)) {
    const text = stripTags(m[1])
    if (keep(text)) out.push({ at: m.index, end: m.index + m[0].length, text })
  }
  return out
}

/**
 * Where the chapters of a DOCX start: its Heading 1 or Heading 2 paragraphs (see `pickLevel`), or its Title
 * paragraphs when there are two or more (one Title is the title of the book), or else the paragraphs that
 * are chapter headings in words ("Capítulo Um").
 */
export function splitHtml(html: string): { front: string; chapters: ImportedChapter[] } {
  const h1 = cutsOf(html, /<h1(?![^>]*class="title")[^>]*>([\s\S]*?)<\/h1>/gi)
  const titles = cutsOf(html, /<h1[^>]*class="title"[^>]*>([\s\S]*?)<\/h1>/gi)
  const h2 = cutsOf(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi)
  const named = cutsOf(html, /<p[^>]*>([\s\S]*?)<\/p>/gi, isChapterHeading)
  const level = pickLevel([
    { cuts: h1, texts: h1.map((c) => c.text) },
    { cuts: titles.length >= 2 ? titles : [], texts: titles.length >= 2 ? titles.map((c) => c.text) : [] },
    { cuts: h2, texts: h2.map((c) => c.text) },
    { cuts: named, texts: named.map((c) => c.text) }
  ])
  const cuts = level?.cuts ?? []
  if (!cuts.length) return { front: '', chapters: [] }
  const chapters = cuts.map((c, i) => ({ title: chapterTitleFromHeading(c.text), html: html.slice(c.end, cuts[i + 1]?.at ?? html.length) }))
  return { front: html.slice(0, cuts[0].at), chapters }
}

/** One line of plain text as Wordelia Markdown: a scene break, or a paragraph with its Markdown signs escaped. */
function textLine(line: string): string {
  const p = line.trim()
  if (!p) return ''
  if (isSceneBreakMarker(p)) return '* * *'
  // A dash or a number at the start would make a list, a "#" a heading, a ">" a quote.
  return p.replace(/([\\*_`[\]<>~{}&])/g, '\\$1').replace(/^([-+#]|\d+[.)])/, '\\$1')
}

/** Plain text: a single newline is a paragraph break. */
function textToMarkdown(lines: string[]): string {
  return lines.map(textLine).filter(Boolean).join('\n\n')
}

/** Lines that are only a scene break marker become "* * *" ("#" alone is an empty heading, "⁂" a paragraph). */
function markdownLines(lines: string[]): string[] {
  let fence = false
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    return !fence && isSceneBreakMarker(line) ? '* * *' : line
  })
}

const markdownBody = (lines: string[]): string => lines.join('\n').replace(/^\n+|\n+$/g, '') + '\n'

/**
 * Split lines into chapters: a line with a `heading` (a title, or '' for no title) starts a chapter. The lines
 * before the first chapter are the title page, up to its first paragraph of prose: from there they are a chapter.
 */
function splitLines(lines: Array<{ line: string; heading: string | null }>, toBody: (lines: string[]) => string): { front: string[]; chapters: ImportedChapter[] } {
  const chapters: Array<{ title: string; lines: string[] }> = []
  const front: string[] = []
  for (const { line, heading } of lines) {
    if (heading !== null) chapters.push({ title: heading, lines: [] })
    else (chapters.at(-1)?.lines ?? front).push(line)
  }
  const out: ImportedChapter[] = chapters.map((c) => ({ title: c.title, markdown: toBody(c.lines) }))
  const prose = front.findIndex((l) => countWords(l) >= PROSE_WORDS)
  if (!out.length || prose < 0) return { front, chapters: out }
  return { front: front.slice(0, prose), chapters: [{ title: '', markdown: toBody(front.slice(prose)) }, ...out] }
}

const byHeadingLine = (lines: string[]): Array<{ line: string; heading: string | null }> =>
  lines.map((line) => ({ line, heading: isChapterHeading(line) ? chapterTitleFromHeading(line.trim()) : null }))

/**
 * Markdown chapters: the headings of one level (see `pickLevel`). One "# Title" before the "## Chapter"
 * headings is the title of the book. Without headings, lines like "Capítulo Um" start the chapters.
 */
export function splitMarkdown(src: string): { title: string | null; chapters: ImportedChapter[] } {
  const { body } = readFrontmatter(src.replace(/\r\n?/g, '\n'))
  const lines = markdownLines(body.split('\n'))
  const headings: Array<{ line: number; level: number; text: string }> = []
  let fence = false
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const h = fence ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (h) headings.push({ line: i, level: h[1].length, text: h[2] })
  })
  const at = (level: number): typeof headings => headings.filter((h) => h.level === level)
  let title: string | null = null
  let titleLine = -1
  const ones = at(1)
  const twos = at(2)
  if (ones.length === 1 && twos.length && ones[0].line < twos[0].line && !CHAPTER_LABEL.test(ones[0].text)) {
    // "# Book title", then "## Chapter" headings. ("# Chapter 1" with "## Scene" headings is one chapter.)
    title = ones[0].text
    titleLine = ones[0].line
  }
  const level = pickLevel(
    [1, 2, 3].map((n) => {
      const hs = n === 1 && titleLine >= 0 ? [] : at(n)
      return { hs, texts: hs.map((h) => h.text) }
    })
  )
  if (level) {
    const chapterAt = new Map(level.hs.map((h) => [h.line, chapterTitleFromHeading(h.text)]))
    const marked = lines.map((line, i) => ({ line, heading: chapterAt.get(i) ?? null, i })).filter((x) => x.i !== titleLine)
    return { title, chapters: splitLines(marked, markdownBody).chapters }
  }
  const r = splitLines(byHeadingLine(lines), markdownBody)
  return { title, chapters: r.chapters.length ? r.chapters : [{ title: '', markdown: markdownBody(lines) }] }
}

/** Plain text chapters: lines like "Capítulo Um" or "Chapter 2: The Visitor" start them. */
export function splitText(src: string): { title: string | null; chapters: ImportedChapter[] } {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const r = splitLines(byHeadingLine(lines), textToMarkdown)
  // A heading without text after it (a part title before its first chapter) is not a chapter.
  const chapters = r.chapters.filter((c) => (c.markdown ?? '').trim())
  if (!chapters.length) return { title: null, chapters: [{ title: '', markdown: textToMarkdown(lines) }] }
  // A short line before the first chapter is the title of the book.
  const first = r.front.map((l) => l.trim()).find(Boolean)
  return { title: first !== undefined && first.length <= 80 ? first : null, chapters }
}

/** One chapter from one file of a folder: its title is the frontmatter title, the first "# " heading or the file name. */
function chapterFromNoteFile(name: string, src: string): ImportedChapter {
  const stem = basename(name, extname(name))
  const text = src.replace(/\r\n?/g, '\n')
  if (/\.txt$/i.test(name)) return { title: stem, markdown: textToMarkdown(text.split('\n')) }
  const { data, body } = readFrontmatter(text)
  const lines = markdownLines(body.split('\n'))
  const first = lines.findIndex((l) => l.trim())
  const h1 = first >= 0 ? /^#\s+(.+?)\s*#*\s*$/.exec(lines[first]) : null
  if (h1) lines.splice(first, 1)
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : h1 ? h1[1] : stem
  return { title, markdown: markdownBody(lines) }
}

/** A folder of notes: each Markdown or text file at its top is one chapter, in the order of the file names. */
async function readFolder(dir: string): Promise<ImportedBook> {
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isFile() && TEXT_FILE.test(d.name) && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  const chapters: ImportedChapter[] = []
  for (const name of names) chapters.push(chapterFromNoteFile(name, await readFile(join(dir, name), 'utf8')))
  return { title: basename(dir), author: '', chapters, warnings: [] }
}

export async function readImport(path: string): Promise<ImportedBook> {
  if ((await stat(path)).isDirectory()) return readFolder(path)
  const ext = extname(path).toLowerCase()
  const name = basename(path, ext)
  const warnings: string[] = []
  if (ext === '.docx') {
    const buffer = await readFile(path)
    const res = await mammoth.convertToHtml(
      { buffer },
      {
        ignoreEmptyParagraphs: false,
        styleMap: ['u => u', 'p[style-name="Title"] => h1.title:fresh', 'p[style-name="Subtitle"] => p.subtitle:fresh']
      }
    )
    for (const m of res.messages) if (m.type === 'warning') warnings.push(m.message)
    const { front, chapters } = splitHtml(res.value)
    if (!chapters.length) return { title: name, author: '', chapters: [{ title: '', html: res.value }], warnings }
    // The title page ends at its first paragraph of prose: from there, the text is a chapter (a prologue without a heading).
    const prose = [...front.matchAll(/<(p|h\d)[^>]*>([\s\S]*?)<\/\1>/gi)].find((m) => countWords(stripTags(m[2])) >= PROSE_WORDS)
    if (prose) chapters.unshift({ title: '', html: front.slice(prose.index) })
    const titlePage = prose ? front.slice(0, prose.index) : front
    const frontLines = stripTags(titlePage.replace(/<\/(p|h\d)>/g, '\n')).split('\n').map((l) => l.trim()).filter(Boolean)
    const title = frontLines[0] ?? name
    // The author is the first short line after the title that is not boilerplate.
    const boiler = /^(ficha catalogr|agradecimentos|sum[aá]rio|dedicat|copyright|©|acknowledg|contents|table of contents|dedication)/i
    const author = frontLines.find((l) => l !== title && l.length <= 60 && !boiler.test(l)) ?? ''
    return { title, author, chapters, warnings }
  }
  const src = await readFile(path, 'utf8')
  const r = ext === '.md' || ext === '.markdown' ? splitMarkdown(src) : splitText(src)
  return { title: r.title ?? name, author: '', chapters: r.chapters, warnings }
}

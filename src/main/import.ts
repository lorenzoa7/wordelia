// Read a DOCX, Markdown or TXT file and split it into chapters.
// DOCX gives HTML (the renderer converts HTML to the document model).

import mammoth from 'mammoth'
import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { ImportedBook, ImportedChapter } from '@shared/ipc'
import { readFrontmatter } from '@shared/markdown/frontmatter'

const CHAPTER_WORD = /^(cap[ií]tulo|chapter|cap\.|parte|part)\s+([\divxlc]+|[a-zà-ú]+)\b[\s.:—–-]*/i

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

/** "1\nThe Traveller" or "Chapter 1: The Traveller" -> "The Traveller" */
export function chapterTitleFromHeading(text: string, index: number): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length > 1 && /^([\divxlc]+|cap[ií]tulo\s+\S+|chapter\s+\S+)\.?$/i.test(lines[0])) return lines.slice(1).join(' ')
  const one = lines.join(' ')
  const stripped = one.replace(CHAPTER_WORD, '').trim()
  if (stripped) return stripped
  if (/^\d+$/.test(one) || !one) return `Chapter ${index + 1}`
  return one
}

function splitHtml(html: string): { front: string; chapters: ImportedChapter[] } {
  const parts = html.split(/(?=<h1[\s>])/i)
  let front = ''
  const chapters: ImportedChapter[] = []
  for (const part of parts) {
    const m = /^<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(part)
    if (!m) {
      front += part
      continue
    }
    const title = chapterTitleFromHeading(stripTags(m[1]), chapters.length)
    chapters.push({ title, html: part.slice(m[0].length) })
  }
  return { front, chapters }
}

function splitMarkdown(src: string): ImportedChapter[] {
  const { body } = readFrontmatter(src)
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const chapters: ImportedChapter[] = []
  let current: ImportedChapter | null = null
  let preface: string[] = []
  for (const line of lines) {
    const h = /^#\s+(.+?)\s*#*\s*$/.exec(line)
    if (h) {
      if (current) chapters.push(current)
      current = { title: chapterTitleFromHeading(h[1], chapters.length), markdown: '' }
      continue
    }
    if (current) current.markdown += line + '\n'
    else preface.push(line)
  }
  if (current) chapters.push(current)
  if (!chapters.length) return [{ title: 'Chapter One', markdown: preface.join('\n') }]
  return chapters
}

function splitText(src: string): ImportedChapter[] {
  const text = src.replace(/\r\n?/g, '\n')
  const blocks = text.split(/\n(?=(?:cap[ií]tulo|chapter)\s+[\divxlc]+\b.*\n)/i)
  return blocks
    .map((b, i) => {
      const [first, ...rest] = b.split('\n')
      const isHeading = CHAPTER_WORD.test(first)
      const bodyLines = isHeading ? rest : [first, ...rest]
      // Plain text: a single newline is a paragraph break.
      const paragraphs = bodyLines.join('\n').split(/\n\s*\n|\n/).map((p) => p.trim())
      const markdown = paragraphs.map((p) => (p ? p.replace(/([\\*_`[\]<>~{}&])/g, '\\$1') : '')).join('\n\n')
      return { title: isHeading ? chapterTitleFromHeading(first, i) : `Chapter ${i + 1}`, markdown }
    })
    .filter((c) => c.markdown.trim())
}

export async function readImport(path: string): Promise<ImportedBook> {
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
    if (!chapters.length) {
      return { title: name, author: '', chapters: [{ title: 'Chapter One', html: res.value }], warnings }
    }
    const frontLines = stripTags(front.replace(/<\/p>/g, '\n')).split('\n').map((l) => l.trim()).filter(Boolean)
    return { title: frontLines[0] ?? name, author: frontLines[1] ?? '', chapters, warnings }
  }
  const src = await readFile(path, 'utf8')
  if (ext === '.md' || ext === '.markdown') return { title: name, author: '', chapters: splitMarkdown(src), warnings }
  return { title: name, author: '', chapters: splitText(src), warnings }
}

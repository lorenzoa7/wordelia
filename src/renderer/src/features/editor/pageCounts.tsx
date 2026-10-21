// The number of pages of each chapter, exact: the white sheets on screen.
//
// - A chapter on screen counts its pages after each measure (pagination.ts, `onCount`).
// - A chapter far from the screen has no editor: <PageCounter> draws it in a hidden sheet with the
//   same layout, one chapter at a time when the app is idle, and counts its pages with the same rule.
// - The library card gets the exact total of the book (`library:pages`).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getSchema } from '@tiptap/core'
import { DOMSerializer } from '@tiptap/pm/model'
import { create } from 'zustand'
import { parseMarkdown } from '@shared/markdown/parse'
import { chapterLabel } from '@shared/export/model'
import { estimatePages } from '@shared/export/pages'
import { countMarkdownWords } from '@shared/book'
import type { BookManifest, Chapter } from '@shared/types'
import { useBook } from '@/stores/book'
import { invoke } from '@/lib/api'
import { schemaExtensions } from './extensions'
import { cutPages, lineBoxes, type FlowUnit } from './pagination'
import { getChapterEditor } from './registry'
import { scaleOf } from './zoom'

interface Count {
  pages: number
  /** The text and the layout that the count is for */
  key: string
}

export const usePageCounts = create<{ counts: Record<string, Count> }>(() => ({ counts: {} }))

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const layoutKeys = new WeakMap<BookManifest, string>()
const chapterKeys = new WeakMap<object, { layout: string; key: string }>()

/**
 * What the page count of a chapter depends on: its text, its title and the layout of the book.
 * Chapters and the manifest are new objects when they change, so the keys are kept per object:
 * a long text is read again only after a change.
 */
export function countKey(ch: Pick<Chapter, 'title' | 'body'>, m: BookManifest): string {
  let layout = layoutKeys.get(m)
  if (!layout) {
    layout = hash(JSON.stringify([m.export.pageSize, m.export.margins, m.typography, m.language]))
    layoutKeys.set(m, layout)
  }
  const known = chapterKeys.get(ch)
  if (known && known.layout === layout) return known.key
  const key = `${layout}:${hash(ch.title)}:${ch.body.length}:${hash(ch.body)}`
  chapterKeys.set(ch, { layout, key })
  return key
}

export function setPageCount(chapterId: string, pages: number, key: string): void {
  const cur = usePageCounts.getState().counts[chapterId]
  if (cur && cur.pages === pages && cur.key === key) return
  usePageCounts.setState((s) => ({ counts: { ...s.counts, [chapterId]: { pages, key } } }))
}

/** Pages of each chapter: the exact count when it is up to date, else an estimate. */
export function usePagesOf(): { pages: Record<string, number>; exact: boolean; total: number } {
  const chapters = useBook((s) => s.chapters)
  const manifest = useBook((s) => s.manifest)
  const counts = usePageCounts((s) => s.counts)
  return useMemo(() => {
    const pages: Record<string, number> = {}
    let exact = true
    let total = 0
    if (!manifest) return { pages, exact: false, total }
    for (const ch of chapters) {
      const c = counts[ch.id]
      const ok = c && c.key === countKey(ch, manifest)
      pages[ch.id] = ok ? c.pages : estimatePages([ch], manifest)
      if (!ok) exact = false
      total += pages[ch.id]
    }
    return { pages, exact, total }
  }, [chapters, manifest, counts])
}

let schemaCache: ReturnType<typeof getSchema> | null = null
function schema(): ReturnType<typeof getSchema> {
  return (schemaCache ??= getSchema(schemaExtensions()))
}

/**
 * Counts the pages of the chapters that have no editor now. It draws one chapter at a time in a
 * hidden sheet, inside the desk, so the text has the same fonts and sizes as on screen.
 */
export function PageCounter(): React.JSX.Element | null {
  const chapters = useBook((s) => s.chapters)
  const manifest = useBook((s) => s.manifest)
  const root = useBook((s) => s.root)
  const counts = usePageCounts((s) => s.counts)
  const [job, setJob] = useState<{ ch: Chapter; index: number; key: string } | null>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  // The next chapter to count: no editor, and no count for its text and layout.
  useEffect(() => {
    if (job || !manifest) return
    const index = chapters.findIndex((ch) => !getChapterEditor(ch.id) && counts[ch.id]?.key !== countKey(ch, manifest))
    if (index < 0) return
    const ch = chapters[index]
    const timer = setTimeout(() => setJob({ ch, index, key: countKey(ch, manifest) }), 40)
    return () => clearTimeout(timer)
  }, [chapters, manifest, counts, job])

  // Draw the text, measure it, count.
  useLayoutEffect(() => {
    const sheet = sheetRef.current
    const text = textRef.current
    if (!job || !sheet || !text || !manifest) return
    const doc = schema().nodeFromJSON(parseMarkdown(job.ch.body))
    text.replaceChildren(DOMSerializer.fromSchema(schema()).serializeFragment(doc.content))
    const z = scaleOf(text)
    const style = getComputedStyle(sheet)
    const marginTop = parseFloat(style.paddingTop) || 0
    const contentHeight = parseFloat(getComputedStyle(sheet.closest('.desk-inner') ?? sheet).getPropertyValue('--page-content-h')) || 0
    const top = text.getBoundingClientRect().top
    const at100 = (y: number): number => (y - top) / z
    const firstOffset = (text.getBoundingClientRect().top - sheet.getBoundingClientRect().top) / z - marginTop
    const units: FlowUnit[] = []
    let forced = false
    for (const el of Array.from(text.children) as HTMLElement[]) {
      if (el.classList.contains('page-break')) {
        forced = true
        continue
      }
      const force = forced
      forced = false
      const textblock = /^(P|H[1-6])$/.test(el.tagName) && (el.textContent ?? '').length > 0
      const lines = textblock ? lineBoxes(el, z) : []
      if (lines.length) {
        lines.forEach((l, i) => units.push({ top: at100(l.top), bottom: at100(l.bottom), first: i === 0, force: force && i === 0 }))
        continue
      }
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      units.push({ top: at100(r.top) - (parseFloat(cs.marginTop) || 0), bottom: at100(r.bottom) + (parseFloat(cs.marginBottom) || 0), first: true, force })
    }
    const pages = contentHeight ? cutPages(units, contentHeight, firstOffset).cuts.length + 1 : 1
    text.replaceChildren()
    setPageCount(job.ch.id, pages, job.key)
    setJob(null)
  }, [job, manifest])

  // The library card: the exact total, when every chapter is counted for its text.
  useEffect(() => {
    if (!manifest || !root || !chapters.length) return
    const all = chapters.every((ch) => counts[ch.id]?.key === countKey(ch, manifest))
    if (!all) return
    const timer = setTimeout(() => {
      const pages = chapters.reduce((n, ch) => n + (counts[ch.id]?.pages ?? 0), 0)
      const words = chapters.reduce((n, ch) => n + countMarkdownWords(ch.body), 0)
      void invoke('library:pages', root, pages, words)
    }, 1500)
    return () => clearTimeout(timer)
  }, [chapters, manifest, counts, root])

  if (!job || !manifest) return null
  return (
    <article ref={sheetRef} className="page page-measure" aria-hidden="true">
      <header className="chapter-head">
        <div className="chapter-label caps">{chapterLabel(manifest.language)}</div>
        <div className="chapter-number">{job.index + 1}</div>
        <textarea className="chapter-title" rows={1} value={job.ch.title} readOnly tabIndex={-1} />
        <div className="chapter-rule">
          <span />
        </div>
      </header>
      <div>
        <div ref={textRef} className="tiptap ProseMirror manuscript" lang={manifest.language} />
      </div>
    </article>
  )
}

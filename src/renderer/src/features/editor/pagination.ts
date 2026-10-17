// Pages on screen, like a word processor. The chapter is one editor, but its text is cut into
// pages of the book's page size: after each layout, this plugin measures the lines and puts a
// "page gap" where a page is full. The gap holds the empty end of the page, the space between
// two sheets of paper, and the top margin of the next page.
//
// - A gap between two paragraphs is a block widget.
// - A gap inside a paragraph is an inline-block of full width. It forces a soft line break, so the
//   line before it stays justified, and the text after it starts a new line on the next page.
// - Positions are measured in "flow" coordinates: the y of each line minus the height of the gaps
//   above it. So the result does not depend on the gaps that are on screen now, and it is stable.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

/** Page geometry in CSS pixels, at the zoom of the page. */
export interface PageMetrics {
  /** Height of the text area of a page */
  contentHeight: number
  marginTop: number
  marginBottom: number
  /** Space between two sheets */
  gap: number
}

interface Break {
  pos: number
  inline: boolean
  /** Empty space at the bottom of the page before the gap */
  rest: number
}

interface PageState {
  breaks: Break[]
  /** Empty space at the end of the last page */
  tail: number
  decorations: DecorationSet
}

export const paginationKey = new PluginKey<PageState>('pagination')

const EPS = 0.75

function gapElement(b: Break, m: PageMetrics, index: number): HTMLElement {
  const el = document.createElement(b.inline ? 'span' : 'div')
  el.className = `pm-page-gap${b.inline ? ' is-inline' : ''}`
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('aria-hidden', 'true')
  el.dataset.page = String(index + 1)
  el.style.height = `${b.rest + m.marginBottom + m.gap + m.marginTop}px`
  const band = document.createElement('span')
  band.className = 'pm-page-band'
  band.style.top = `${b.rest + m.marginBottom}px`
  band.style.height = `${m.gap}px`
  el.appendChild(band)
  return el
}

function tailElement(height: number): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pm-page-tail'
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('aria-hidden', 'true')
  el.style.height = `${height}px`
  return el
}

function build(state: EditorState, breaks: Break[], tail: number, m: PageMetrics): DecorationSet {
  const decos = breaks.map((b, i) =>
    Decoration.widget(b.pos, () => gapElement(b, m, i), {
      side: -1,
      ignoreSelection: true,
      key: `gap-${b.inline ? 'i' : 'b'}-${Math.round(b.rest)}-${m.contentHeight}`
    })
  )
  if (tail > 0) {
    decos.push(
      Decoration.widget(state.doc.content.size, () => tailElement(tail), { side: 1, ignoreSelection: true, key: `tail-${Math.round(tail)}` })
    )
  }
  return DecorationSet.create(state.doc, decos)
}

interface Unit {
  /** Flow coordinates (gaps removed), relative to the top of the editor */
  top: number
  bottom: number
  /** Start of the block in the document */
  blockPos: number
  /** The first line of its block, or a block that cannot break */
  first: boolean
  /** Client coordinates of the start of the line, to find its document position */
  x: number
  y: number
}

/** Line boxes of a paragraph, from the rectangles of its text, in client coordinates. */
function lineBoxes(el: HTMLElement): Array<{ top: number; bottom: number; left: number }> {
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 0
  const rects: DOMRect[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    // Words that the AI proposes (widgets) take room in the lines; the page gaps do not count.
    if ((n.parentElement as HTMLElement | null)?.closest('.pm-page-gap')) continue
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) if (r.width > 0 || r.height > 0) rects.push(r)
  }
  rects.sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: Array<{ top: number; bottom: number; left: number }> = []
  for (const r of rects) {
    const last = lines[lines.length - 1]
    // Same line: the boxes overlap vertically.
    if (last && r.top < last.bottom - 2) {
      last.bottom = Math.max(last.bottom, r.bottom)
      last.left = Math.min(last.left, r.left)
      continue
    }
    lines.push({ top: r.top, bottom: r.bottom, left: r.left })
  }
  // The text box is smaller than the line box: add the half-leading above and below.
  if (lh) {
    for (const l of lines) {
      const extra = Math.max(0, lh - (l.bottom - l.top)) / 2
      l.top -= extra
      l.bottom += extra
    }
  }
  return lines
}

function measure(view: EditorView, m: PageMetrics, firstOffset: number): { breaks: Break[]; tail: number } | null {
  const root = view.dom as HTMLElement
  if (!root.isConnected || root.offsetParent === null) return null
  const rootTop = root.getBoundingClientRect().top
  const gaps = Array.from(root.querySelectorAll<HTMLElement>('.pm-page-gap')).map((g) => {
    const r = g.getBoundingClientRect()
    return { top: r.top - rootTop, bottom: r.bottom - rootTop }
  })
  /** Height of the gaps above a y (relative to the editor top) */
  const above = (y: number): number => gaps.reduce((s, g) => (g.bottom <= y + EPS ? s + (g.bottom - g.top) : s), 0)

  const units: Unit[] = []
  view.state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement)) return
    const style = getComputedStyle(dom)
    if (node.isTextblock && node.content.size > 0) {
      const lines = lineBoxes(dom)
      if (lines.length) {
        lines.forEach((l, i) => {
          const top = l.top - rootTop
          const bottom = l.bottom - rootTop
          const a = above(top)
          units.push({ top: top - a, bottom: bottom - a, blockPos: offset, first: i === 0, x: l.left + 1, y: (l.top + l.bottom) / 2 })
        })
        return
      }
    }
    const r = dom.getBoundingClientRect()
    const top = r.top - rootTop - (parseFloat(style.marginTop) || 0)
    const bottom = r.bottom - rootTop + (parseFloat(style.marginBottom) || 0)
    const a = above(top)
    units.push({ top: top - a, bottom: bottom - a, blockPos: offset, first: true, x: r.left + 1, y: r.top + 1 })
  })
  if (!units.length) return { breaks: [], tail: Math.max(0, m.contentHeight - firstOffset) }

  const breaks: Break[] = []
  let pageStart = 0
  let limit = m.contentHeight - firstOffset
  for (const u of units) {
    if (u.bottom - pageStart <= limit + EPS) continue
    // A unit taller than a whole page stays where it is.
    if (u.top - pageStart <= EPS) continue
    const rest = Math.max(0, limit - (u.top - pageStart))
    let pos = u.blockPos
    let inline = false
    if (!u.first) {
      const hit = view.posAtCoords({ left: u.x, top: u.y })
      if (hit) {
        pos = wordStart(view.state, hit.pos)
        const $p = view.state.doc.resolve(pos)
        inline = $p.parent.isTextblock && $p.parentOffset > 0
        if (!inline) pos = $p.before($p.depth)
      }
    }
    breaks.push({ pos, inline, rest })
    pageStart = u.top
    limit = m.contentHeight
  }
  const last = units[units.length - 1]
  const tail = Math.max(0, limit - (last.bottom - pageStart))
  return { breaks, tail }
}

/** Move a position back to the start of its word: a break inside a hyphenated word must not split it. */
function wordStart(state: EditorState, pos: number): number {
  const $p = state.doc.resolve(pos)
  if (!$p.parent.isTextblock) return pos
  const text = $p.parent.textBetween(0, $p.parentOffset, undefined, '￼')
  let i = text.length
  while (i > 0 && !/\s/.test(text[i - 1])) i--
  return pos - (text.length - i)
}

function same(a: PageState, b: { breaks: Break[]; tail: number }): boolean {
  if (a.breaks.length !== b.breaks.length || Math.abs(a.tail - b.tail) > 1) return false
  return a.breaks.every((x, i) => x.pos === b.breaks[i].pos && x.inline === b.breaks[i].inline && Math.abs(x.rest - b.breaks[i].rest) <= 1)
}

export interface PaginationOptions {
  /** Page geometry now, or null when the editor is not on screen */
  metrics: () => PageMetrics | null
  /** Height of the chapter heading on the first page */
  firstPageOffset: () => number
}

export const Pagination = Extension.create<PaginationOptions>({
  name: 'pagination',

  addOptions() {
    return { metrics: () => null, firstPageOffset: () => 0 }
  },

  addProseMirrorPlugins() {
    const opts = this.options
    return [
      new Plugin<PageState>({
        key: paginationKey,
        state: {
          init: () => ({ breaks: [], tail: 0, decorations: DecorationSet.empty }),
          apply(tr, prev, _old, next) {
            const meta = tr.getMeta(paginationKey) as { breaks: Break[]; tail: number; metrics: PageMetrics } | undefined
            if (meta) return { breaks: meta.breaks, tail: meta.tail, decorations: build(next, meta.breaks, meta.tail, meta.metrics) }
            if (!tr.docChanged) return prev
            // Keep the gaps near their place while the user types; the next measure fixes them.
            const breaks = prev.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos, -1) }))
            return { breaks, tail: prev.tail, decorations: prev.decorations.map(tr.mapping, tr.doc) }
          }
        },
        props: {
          decorations: (state) => paginationKey.getState(state)?.decorations
        },
        view(view) {
          let frame = 0
          let timer: ReturnType<typeof setTimeout> | undefined
          let rounds = 0
          /** Height of the editor after the last measure: a new height means new lines */
          let height = -1
          let queued = false
          const run = (fromEdit = false): void => {
            frame = 0
            const m = opts.metrics()
            if (!m || view.isDestroyed) return
            const result = measure(view, m, opts.firstPageOffset())
            if (!result) return
            const cur = paginationKey.getState(view.state)
            if (cur && same(cur, result)) {
              rounds = 0
              height = (view.dom as HTMLElement).offsetHeight
              return
            }
            // Never loop: a layout that does not settle stops after a few rounds.
            if (++rounds > 4) return
            const tr = view.state.tr.setMeta(paginationKey, { ...result, metrics: m }).setMeta('addToHistory', false).setMeta('allowDuringReview', true)
            // Typing moved the cursor onto a new page: keep it on screen.
            if (fromEdit && view.hasFocus()) tr.scrollIntoView()
            view.dispatch(tr)
            height = (view.dom as HTMLElement).offsetHeight
          }
          const schedule = (delay: number): void => {
            clearTimeout(timer)
            timer = setTimeout(() => {
              if (!frame) frame = requestAnimationFrame(() => run())
            }, delay)
          }
          const onResize = (): void => schedule(60)
          triggers.set(view, () => {
            rounds = 0
            schedule(0)
          })
          const ro = new ResizeObserver(onResize)
          ro.observe(view.dom)
          document.fonts?.addEventListener?.('loadingdone', onResize)
          void document.fonts?.ready.then(() => schedule(0))
          schedule(0)
          return {
            update(v, prevState) {
              // Our own gap updates do not change the text.
              if (v.state.doc === prevState.doc) return
              rounds = 0
              // A new line (Enter, or a word that wraps): measure before the browser paints, so a
              // new page shows at once, like a word processor. Other typing: after a short pause.
              if ((v.dom as HTMLElement).offsetHeight !== height && !queued) {
                queued = true
                queueMicrotask(() => {
                  queued = false
                  if (!v.isDestroyed) run(true)
                })
              } else {
                schedule(120)
              }
            },
            destroy() {
              triggers.delete(view)
              clearTimeout(timer)
              if (frame) cancelAnimationFrame(frame)
              ro.disconnect()
              document.fonts?.removeEventListener?.('loadingdone', onResize)
            }
          }
        }
      })
    ]
  }
})

const triggers = new WeakMap<EditorView, () => void>()

/** Ask an editor to measure its pages again (zoom, page size or typography changed). */
export function repaginate(view: EditorView): void {
  triggers.get(view)?.()
}

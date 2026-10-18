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
import { scaleOf } from './zoom'

/** Page geometry in CSS pixels, at the zoom of the page. */
export interface PageMetrics {
  /** Height of the text area of a page */
  contentHeight: number
  marginTop: number
  marginBottom: number
  /** Space between two sheets */
  gap: number
  /** The zoom of these numbers. Gap heights follow the zoom in CSS, so a new zoom shows at once. */
  zoom: number
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

/** A length that follows the zoom: the pixels at zoom 1 times `--page-zoom`. */
function zoomed(px: number, m: PageMetrics): string {
  return `calc(${(px / m.zoom).toFixed(3)}px * var(--page-zoom))`
}

function gapElement(b: Break, m: PageMetrics, index: number, fresh: boolean): HTMLElement {
  const el = document.createElement(b.inline ? 'span' : 'div')
  el.className = `pm-page-gap${b.inline ? ' is-inline' : ''}${fresh ? ' is-new' : ''}`
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('aria-hidden', 'true')
  el.dataset.page = String(index + 1)
  // A new page grows in one time: after that it is a page like the others.
  if (fresh) el.addEventListener('animationend', (e) => e.target === el && el.classList.remove('is-new'))
  el.style.height = zoomed(b.rest + m.marginBottom + m.gap + m.marginTop, m)
  // A new page grows from the end of the page before it (editor.css).
  el.style.setProperty('--gap-from', zoomed(b.rest + m.marginBottom, m))
  el.appendChild(pageNumber(b.rest + m.marginBottom / 2, m))
  const band = document.createElement('span')
  band.className = 'pm-page-band'
  band.style.top = zoomed(b.rest + m.marginBottom, m)
  band.style.height = zoomed(m.gap, m)
  el.appendChild(band)
  return el
}

function tailElement(height: number, m: PageMetrics): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pm-page-tail'
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('aria-hidden', 'true')
  el.style.height = zoomed(height, m)
  el.appendChild(pageNumber(height + m.marginBottom / 2, m))
  return el
}

/**
 * The number of the page that ends here, in the middle of its bottom margin. A CSS counter gives
 * the number: each chapter sheet sets where its pages start (PageEditor.tsx), so the numbers go on
 * through the whole book.
 */
function pageNumber(top: number, m: PageMetrics): HTMLElement {
  const n = document.createElement('span')
  n.className = 'pm-page-num'
  n.style.top = zoomed(top, m)
  return n
}

/**
 * `fresh`: breaks from this index on are new pages that typing made; they grow in one time.
 * ProseMirror draws a widget again when the paragraph around it changes (the author types on the
 * new page): only the first drawing of a new gap animates.
 */
function build(state: EditorState, breaks: Break[], tail: number, m: PageMetrics, fresh = Infinity): DecorationSet {
  const decos = breaks.map((b, i) => {
    let grow = i >= fresh
    const draw = (): HTMLElement => {
      const el = gapElement(b, m, i, grow)
      grow = false
      return el
    }
    return Decoration.widget(b.pos, draw, {
      side: -1,
      ignoreSelection: true,
      // Not the new mark: the next measure (fast typing) keeps the same element and its animation.
      key: `gap-${b.inline ? 'i' : 'b'}-${Math.round(b.rest)}-${m.contentHeight}`
    })
  })
  if (tail > 0) {
    decos.push(
      Decoration.widget(state.doc.content.size, () => tailElement(tail, m), { side: 1, ignoreSelection: true, key: `tail-${Math.round(tail)}-${m.zoom}` })
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
  /** The first line after a page break: it starts a new page */
  force: boolean
  /** Client coordinates of the start of the line, to find its document position */
  x: number
  y: number
}

/** Line boxes of a paragraph, from the rectangles of its text, in client coordinates. */
/** `scale`: the zoom of the desk; the rectangles are on screen, the line height is at 100 %. */
export function lineBoxes(el: HTMLElement, scale: number): Array<{ top: number; bottom: number; left: number }> {
  const lh = (parseFloat(getComputedStyle(el).lineHeight) || 0) * scale
  const rects: DOMRect[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    // Words that the AI proposes (widgets) take room in the lines; the page gaps do not count.
    if ((n.parentElement as HTMLElement | null)?.closest('.pm-page-gap')) continue
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) if (r.width > 0 || r.height > 0) rects.push(r)
  }
  // A line with only a line break (Shift+Enter) has no text, but it takes a line.
  for (const br of el.querySelectorAll('br')) {
    if (br.closest('.pm-page-gap')) continue
    range.selectNode(br)
    for (const r of range.getClientRects()) if (r.height > 0) rects.push(r)
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
  // Measure the free flow of the text, with the gaps hidden. A gap inside a paragraph forces a line
  // break; if it took part in the measure, a gap in a wrong place (from a moment when the AI diff
  // showed, for example) would keep itself there. The gaps show again before the browser paints.
  // Without the gaps the desk is shorter, and the browser would pull the scroll position up to fit:
  // keep it and put it back.
  const desk = root.closest('.desk') as HTMLElement | null
  const top = desk?.scrollTop ?? 0
  const left = desk?.scrollLeft ?? 0
  root.classList.add('is-measuring')
  try {
    return measureFlow(view, root, m, firstOffset)
  } finally {
    root.classList.remove('is-measuring')
    if (desk && (desk.scrollTop !== top || desk.scrollLeft !== left)) {
      desk.scrollTop = top
      desk.scrollLeft = left
    }
  }
}

function measureFlow(view: EditorView, root: HTMLElement, m: PageMetrics, firstOffset: number): { breaks: Break[]; tail: number } {
  const rootTop = root.getBoundingClientRect().top
  // The zoom scales the desk (zoom.ts): positions on screen, divided by the scale, are at 100 %.
  const z = scaleOf(root)
  const at100 = (y: number): number => (y - rootTop) / z
  const units: Unit[] = []
  /** The block after a page break starts a new page */
  let forced = false
  view.state.doc.forEach((node, offset) => {
    if (node.type.name === 'pageBreak') {
      forced = true
      return
    }
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement)) return
    const style = getComputedStyle(dom)
    const force = forced
    forced = false
    if (node.isTextblock && node.content.size > 0) {
      const lines = lineBoxes(dom, z)
      if (lines.length) {
        lines.forEach((l, i) => {
          units.push({ top: at100(l.top), bottom: at100(l.bottom), blockPos: offset, first: i === 0, force: force && i === 0, x: l.left + 1, y: (l.top + l.bottom) / 2 })
        })
        return
      }
    }
    const r = dom.getBoundingClientRect()
    const top = at100(r.top) - (parseFloat(style.marginTop) || 0)
    const bottom = at100(r.bottom) + (parseFloat(style.marginBottom) || 0)
    units.push({ top, bottom, blockPos: offset, first: true, force, x: r.left + 1, y: r.top + 1 })
  })
  const { cuts, tail } = cutPages(units, m.contentHeight, firstOffset)
  const breaks: Break[] = cuts.map(({ unit: u, rest, forced }) => {
    let pos = u.blockPos
    let inline = false
    if (!u.first && !forced) {
      const hit = view.posAtCoords({ left: u.x, top: u.y })
      if (hit) {
        pos = wordStart(view.state, hit.pos)
        const $p = view.state.doc.resolve(pos)
        inline = $p.parent.isTextblock && $p.parentOffset > 0
        if (!inline) pos = $p.before($p.depth)
      }
    }
    return { pos, inline, rest }
  })
  return { breaks, tail }
}

/** A line or a block of the text, in coordinates at 100 % from the top of the text */
export interface FlowUnit {
  top: number
  bottom: number
  /** The first line of its block, or a block that cannot break */
  first: boolean
  /** The first line after a page break: it starts a new page */
  force: boolean
}

/**
 * Where the pages end: the units that start a new page, and the empty space at the end of each page
 * and of the last page. The same rule for the editor and for the page count of a chapter that is
 * not on screen (pageCounts.ts).
 */
export function cutPages<U extends FlowUnit>(units: U[], contentHeight: number, firstOffset: number): { cuts: Array<{ unit: U; rest: number; forced: boolean }>; tail: number } {
  if (!units.length) return { cuts: [], tail: Math.max(0, contentHeight - firstOffset) }
  const cuts: Array<{ unit: U; rest: number; forced: boolean }> = []
  let pageStart = 0
  let limit = contentHeight - firstOffset
  for (const u of units) {
    // A page break (Ctrl+Enter): the rest of the page stays empty.
    if (u.force && u.top - pageStart > EPS) {
      cuts.push({ unit: u, rest: Math.max(0, limit - (u.top - pageStart)), forced: true })
      pageStart = u.top
      limit = contentHeight
      continue
    }
    if (u.bottom - pageStart <= limit + EPS) continue
    // A unit taller than a whole page stays where it is.
    if (u.top - pageStart <= EPS) continue
    cuts.push({ unit: u, rest: Math.max(0, limit - (u.top - pageStart)), forced: false })
    pageStart = u.top
    limit = contentHeight
  }
  const last = units[units.length - 1]
  return { cuts, tail: Math.max(0, limit - (last.bottom - pageStart)) }
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
  /** The number of pages after each measure */
  onCount?: (pages: number) => void
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
            const meta = tr.getMeta(paginationKey) as { breaks: Break[]; tail: number; metrics: PageMetrics; animate?: boolean } | undefined
            if (meta) {
              const fresh = meta.animate ? prev.breaks.length : Infinity
              return { breaks: meta.breaks, tail: meta.tail, decorations: build(next, meta.breaks, meta.tail, meta.metrics, fresh) }
            }
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
            opts.onCount?.(result.breaks.length + 1)
            const cur = paginationKey.getState(view.state)
            if (cur && same(cur, result)) {
              rounds = 0
              height = (view.dom as HTMLElement).offsetHeight
              return
            }
            // Never loop: a layout that does not settle stops after a few rounds.
            if (++rounds > 4) return
            const added = fromEdit && cur ? result.breaks.length - cur.breaks.length : 0
            const tr = view.state.tr
              .setMeta(paginationKey, { ...result, metrics: m, animate: added > 0 && !reducedMotion() })
              .setMeta('addToHistory', false)
              .setMeta('allowDuringReview', true)
            // Typing moved the cursor onto a new page: keep it on screen.
            if (fromEdit && view.hasFocus()) tr.scrollIntoView()
            view.dispatch(tr)
            height = (view.dom as HTMLElement).offsetHeight
            if (added > 0 && view.hasFocus()) followNewPage(view, m)
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

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * A new page grows in (editor.css), so the cursor goes down while it grows. When the cursor would
 * end under the visible part of the desk, glide the desk down with it.
 */
function followNewPage(view: EditorView, m: PageMetrics): void {
  const desk = view.dom.closest('.desk') as HTMLElement | null
  if (!desk) return
  const caret = view.coordsAtPos(view.state.selection.head)
  const grow = reducedMotion() ? 0 : (m.gap + m.marginTop) * scaleOf(view.dom as HTMLElement)
  const bottom = desk.getBoundingClientRect().bottom - 90
  const over = caret.bottom + grow - bottom
  if (over > 0) desk.scrollBy({ top: over, behavior: reducedMotion() ? 'auto' : 'smooth' })
}

const triggers = new WeakMap<EditorView, () => void>()

/** Ask an editor to measure its pages again (zoom, page size or typography changed). */
export function repaginate(view: EditorView): void {
  triggers.get(view)?.()
}

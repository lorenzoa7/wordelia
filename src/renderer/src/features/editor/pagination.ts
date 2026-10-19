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
  /** A page break (Ctrl+Enter) starts the page after the gap */
  forced: boolean
}

/** A new page that comes in (arrive): a veil over it fades out. */
interface Arrival {
  /** The break before the new page */
  index: number
  /** Progress, 0 to 1, after the easing. 1 when it is done or stopped. */
  p: number
}

interface PageState {
  breaks: Break[]
  /** Empty space at the end of the last page */
  tail: number
  decorations: DecorationSet
  arrival: Arrival | null
}

export const paginationKey = new PluginKey<PageState>('pagination')

const EPS = 0.75

/** A length that follows the zoom: the pixels at zoom 1 times `--page-zoom`. */
function zoomed(px: number, m: PageMetrics): string {
  return `calc(${(px / m.zoom).toFixed(3)}px * var(--page-zoom))`
}

/** The band keeps its top shadow (the edge of the sheet before it) under the veil. */
const VEIL_FROM = 8

/**
 * The gap between two pages. Its height never changes: every page has the size of the book page.
 * `arriving`: the progress of a new page that comes in now, or null for a page like the others.
 */
function gapElement(b: Break, m: PageMetrics, index: number, arriving: number | null): HTMLElement {
  const el = document.createElement(b.inline ? 'span' : 'div')
  el.className = `pm-page-gap${b.inline ? ' is-inline' : ''}`
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('aria-hidden', 'true')
  el.dataset.page = String(index + 1)
  el.style.height = zoomed(b.rest + m.marginBottom + m.gap + m.marginTop, m)
  el.appendChild(pageNumber(b.rest + m.marginBottom / 2, m))
  const band = document.createElement('span')
  band.className = 'pm-page-band'
  band.style.top = zoomed(b.rest + m.marginBottom, m)
  band.style.height = zoomed(m.gap, m)
  el.appendChild(band)
  if (arriving !== null) {
    // Over the band and the whole new sheet, and a little under it (its shadow), but not as far as
    // the next sheet.
    const veil = document.createElement('span')
    veil.className = 'pm-page-veil'
    veil.style.top = zoomed(b.rest + m.marginBottom + VEIL_FROM, m)
    veil.style.height = zoomed(m.gap - VEIL_FROM + m.marginTop + m.contentHeight + m.marginBottom + m.gap * 0.75, m)
    veil.style.opacity = String(1 - arriving)
    el.appendChild(veil)
  }
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
 * `arrival`: the new page that comes in now. ProseMirror draws a gap again when the author types in
 * its paragraph (each key on the new page): the new element starts at the progress of now, so the
 * page comes in without a jump.
 */
function build(state: EditorState, breaks: Break[], tail: number, m: PageMetrics, arrival: Arrival | null): DecorationSet {
  const decos = breaks.map((b, i) => {
    const draw = (): HTMLElement => gapElement(b, m, i, arrival && i === arrival.index && arrival.p < 1 ? arrival.p : null)
    return Decoration.widget(b.pos, draw, {
      side: -1,
      ignoreSelection: true,
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
    return { pos, inline, rest, forced }
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
          init: () => ({ breaks: [], tail: 0, decorations: DecorationSet.empty, arrival: null }),
          apply(tr, prev, _old, next) {
            const meta = tr.getMeta(paginationKey) as { breaks: Break[]; tail: number; metrics: PageMetrics; arrive?: number } | undefined
            if (meta) {
              // A measure while a new page comes in keeps its arrival.
              const arrival = meta.arrive !== undefined ? { index: meta.arrive, p: 0 } : prev.arrival && prev.arrival.p < 1 ? prev.arrival : null
              return { breaks: meta.breaks, tail: meta.tail, decorations: build(next, meta.breaks, meta.tail, meta.metrics, arrival), arrival }
            }
            if (!tr.docChanged) return prev
            // Keep the gaps near their place while the user types; the next measure fixes them. A gap
            // whose place is deleted goes, like its widget: the list and the gaps on screen stay the
            // same, so the next measure sees the change.
            const breaks: Break[] = []
            for (const b of prev.breaks) {
              const r = tr.mapping.mapResult(b.pos, -1)
              if (!r.deleted) breaks.push({ ...b, pos: r.pos })
            }
            return { breaks, tail: prev.tail, decorations: prev.decorations.map(tr.mapping, tr.doc), arrival: prev.arrival }
          }
        },
        props: {
          decorations: (state) => paginationKey.getState(state)?.decorations,
          // While a new page comes in, the desk scrolls to it (arrive): ProseMirror does not scroll too.
          handleScrollToSelection: (view) => (paginationKey.getState(view.state)?.arrival?.p ?? 1) < 1
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
            const before = view.hasFocus() ? view.coordsAtPos(view.state.selection.head) : null
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
            const arrive = fromEdit && cur && before && !reducedMotion() ? newPage(cur.breaks, result.breaks, view.state.selection.head) : -1
            // A page that still comes in is done now.
            if (arrive >= 0) settle(view)
            const tr = view.state.tr
              .setMeta(paginationKey, { ...result, metrics: m, arrive: arrive >= 0 ? arrive : undefined })
              .setMeta('addToHistory', false)
              .setMeta('allowDuringReview', true)
            // Typing moved the cursor onto another page: keep it on screen. A new page scrolls itself.
            if (fromEdit && view.hasFocus() && arrive < 0) tr.scrollIntoView()
            view.dispatch(tr)
            height = (view.dom as HTMLElement).offsetHeight
            const arrival = paginationKey.getState(view.state)?.arrival
            if (arrive >= 0 && arrival && before) arriveAt(view, arrival, before.top)
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
              // A new line (Enter, or a word that wraps) or a new or removed block (a page break):
              // measure before the browser paints, so a new page shows at once, like a word
              // processor. Other typing: after a short pause.
              const lines = (v.dom as HTMLElement).offsetHeight !== height
              const blocks = v.state.doc.childCount !== prevState.doc.childCount
              if ((lines || blocks) && !queued) {
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
              const arrival = paginationKey.getState(view.state)?.arrival
              if (arrival) arrival.p = 1
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
 * The break before a page that an edit just made, or -1. It is the last break before the cursor,
 * and it is new: a page break (Ctrl+Enter), or a new last page (the text grew past the end). A line
 * that goes to a page that was there before is not a new page.
 */
export function newPage(old: Array<Pick<Break, 'pos' | 'inline'>>, next: Array<Pick<Break, 'pos' | 'inline' | 'forced'>>, head: number): number {
  let index = -1
  next.forEach((b, i) => {
    if (b.pos <= head) index = i
  })
  if (index < 0) return -1
  const b = next[index]
  if (old.some((o) => o.pos === b.pos && o.inline === b.inline)) return -1
  const atEnd = index === next.length - 1 && next.length > old.length
  return b.forced || atEnd ? index : -1
}

/** Space under the cursor, in screen pixels, that a new page keeps on screen */
const FOLLOW_ROOM = 90

const veils = (view: EditorView): HTMLElement[] => Array.from((view.dom as HTMLElement).querySelectorAll<HTMLElement>('.pm-page-veil'))

/** End an arrival: the veil goes. */
function settle(view: EditorView): void {
  const arrival = paginationKey.getState(view.state)?.arrival
  if (arrival) arrival.p = 1
  for (const el of veils(view)) el.remove()
}

/**
 * A new page comes in, like a new sheet on the desk. The page before it has its full size at once
 * (every page has the size of the book page, also while a page comes in). A veil in the color of the
 * desk covers the new sheet and fades out, so the sheet comes out of the desk with the words that
 * go to it. When the cursor is now low on the screen or under it, the desk scrolls to it in the same
 * movement. One frame loop sets the veil and the scroll; the progress is in the plugin state, so a
 * gap that ProseMirror draws again (each key on the new page) starts where the arrival is now.
 * `from`: the top of the cursor on screen before the new page.
 */
function arriveAt(view: EditorView, arrival: Arrival, from: number): void {
  const root = view.dom as HTMLElement
  const desk = root.closest('.desk') as HTMLElement | null
  const duration = parseFloat(getComputedStyle(root).getPropertyValue('--dur-page')) || 0
  if (!duration) {
    settle(view)
    if (view.hasFocus()) view.dispatch(view.state.tr.scrollIntoView().setMeta('addToHistory', false).setMeta('allowDuringReview', true))
    return
  }
  // The desk scrolls when the cursor would end low: it ends at the room above the bottom, or where
  // it was before when that is lower.
  let scroll = 0
  if (desk) {
    const caret = view.coordsAtPos(view.state.selection.head)
    const room = Math.max(desk.getBoundingClientRect().bottom - FOLLOW_ROOM - (caret.bottom - caret.top), from)
    scroll = Math.max(0, caret.top - room)
  }
  const top = desk?.scrollTop ?? 0
  const start = performance.now()
  const step = (now: number): void => {
    if (view.isDestroyed || arrival.p >= 1) return
    // The time of the first frame can be a little before the start.
    const t = Math.min(1, Math.max(0, (now - start) / duration))
    // Fast at first, then slow: the page answers the key at once and comes to rest softly.
    arrival.p = 1 - Math.pow(1 - t, 3)
    for (const el of veils(view)) el.style.opacity = String(1 - arrival.p)
    // Never back: a scroll of the author (or of the browser) that goes further stays.
    if (desk && scroll) desk.scrollTop = Math.max(desk.scrollTop, top + scroll * arrival.p)
    if (t < 1) requestAnimationFrame(step)
    else settle(view)
  }
  requestAnimationFrame(step)
}

const triggers = new WeakMap<EditorView, () => void>()

/** Ask an editor to measure its pages again (zoom, page size or typography changed). */
export function repaginate(view: EditorView): void {
  triggers.get(view)?.()
}

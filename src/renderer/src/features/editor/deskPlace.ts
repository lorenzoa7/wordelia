// The place of the author on the desk: read it to save it, and go back to it when the book opens.
// The storage is in features/write/place.ts.

import { TextSelection } from '@tiptap/pm/state'
import { useBook } from '@/stores/book'
import { readPlace, writePlace, type Place } from '@/features/write/place'
import { getActiveEditor, getChapterEditor, useActiveEditor, whenChapterEditor, type ChapterEditor } from './registry'

/** The sheets of the chapters on the desk, in order */
function sheets(desk: HTMLElement): HTMLElement[] {
  return Array.from(desk.querySelectorAll<HTMLElement>('.page[data-chapter]'))
}

/** The chapter at the top of the desk, and how far down its sheet the top of the desk is. */
export function topOfDesk(desk: HTMLElement): Place['top'] {
  const top = desk.getBoundingClientRect().top
  for (const el of sheets(desk)) {
    const r = el.getBoundingClientRect()
    if (r.bottom > top + 1) return { chapterId: el.dataset.chapter!, part: r.height ? Math.max(0, (top - r.top) / r.height) : 0 }
  }
  return undefined
}

/** Save the place of the author in the open book. */
export function savePlace(desk: HTMLElement | null): void {
  const { root, view } = useBook.getState()
  if (!root || !desk) return
  const a = useActiveEditor.getState().active ?? getActiveEditor()
  const cursor = a && !a.editor.isDestroyed ? { chapterId: a.chapterId, anchor: a.editor.state.selection.anchor, head: a.editor.state.selection.head } : undefined
  writePlace(root, { view, top: topOfDesk(desk), cursor })
}

/** Nothing has the keyboard focus: the author did not click anywhere yet. */
function noFocus(): boolean {
  const el = document.activeElement
  return !el || el === document.body
}

/** Put the cursor of the author in an editor, without a scroll, when nothing else has the focus. */
function focusAt(e: ChapterEditor, anchor?: number, head?: number): void {
  const { state, view } = e.editor
  const max = state.doc.content.size
  const clamp = (n: number): number => Math.max(0, Math.min(n, max))
  if (anchor !== undefined && head !== undefined) {
    try {
      view.dispatch(state.tr.setSelection(TextSelection.between(state.doc.resolve(clamp(anchor)), state.doc.resolve(clamp(head)))).setMeta('addToHistory', false))
    } catch {
      /* a position that is not in the text any more */
    }
  }
  if (useBook.getState().view === 'write' && noFocus()) e.editor.commands.focus(anchor === undefined ? 'start' : null, { scrollIntoView: false })
}

/**
 * Go back to the place of the author when the book opens: the chapter on the screen, the scroll and
 * the cursor. A book without a place gets the cursor at the start of its first chapter, so the
 * author can type at once. The scroll follows the chapter while its pages are measured, until the
 * author scrolls. `onDone` runs when the desk is at its place.
 */
export function restorePlace(desk: HTMLElement, onDone: () => void): () => void {
  const { root, chapters } = useBook.getState()
  const place = root ? readPlace(root) : null
  const top = place?.top && chapters.some((c) => c.id === place.top!.chapterId) ? place.top : undefined
  let stopped = false
  let ro: ResizeObserver | undefined
  const timers: Array<ReturnType<typeof setTimeout>> = []
  const stop = (): void => {
    if (stopped) return
    stopped = true
    ro?.disconnect()
    desk.removeEventListener('wheel', stop)
    desk.removeEventListener('keydown', stop)
    desk.removeEventListener('pointerdown', stop)
    for (const t of timers) clearTimeout(t)
    onDone()
  }
  if (!top) {
    const first = chapters[0]
    if (first) whenChapterEditor(first.id, (e) => focusAt(e))
    onDone()
    return () => {}
  }
  let last = -1
  const place_ = (): void => {
    const sheet = desk.querySelector<HTMLElement>(`.page[data-chapter="${top.chapterId}"]`)
    if (!sheet || stopped) return
    // The author scrolled (or a jump moved the desk): leave the desk there.
    if (last >= 0 && Math.abs(desk.scrollTop - last) > 2) return stop()
    const r = sheet.getBoundingClientRect()
    const to = desk.scrollTop + r.top - desk.getBoundingClientRect().top + top.part * r.height
    desk.scrollTop = Math.round(to)
    last = desk.scrollTop
  }
  place_()
  for (const type of ['wheel', 'keydown', 'pointerdown'] as const) desk.addEventListener(type, stop, { passive: true })
  whenChapterEditor(top.chapterId, () => {
    // Two frames: the editor and its pages are laid out.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        place_()
        const c = place?.cursor
        const e = c ? getChapterEditor(c.chapterId) : null
        const own = getChapterEditor(top.chapterId)
        if (e && c) focusAt(e, c.anchor, c.head)
        else if (own) {
          // No cursor on the screen: the cursor goes to the text near the reading line.
          const r = own.editor.view.dom.getBoundingClientRect()
          const d = desk.getBoundingClientRect()
          const hit = own.editor.view.posAtCoords({ left: r.left + 4, top: Math.min(r.bottom - 2, Math.max(r.top + 2, d.top + d.height * 0.3)) })
          focusAt(own, hit?.pos ?? 0, hit?.pos ?? 0)
        }
        last = desk.scrollTop
        // The pages of the chapter can grow while they are measured: follow them for a moment.
        const sheet = desk.querySelector<HTMLElement>(`.page[data-chapter="${top.chapterId}"]`)
        if (sheet) {
          ro = new ResizeObserver(() => place_())
          ro.observe(sheet)
        }
        timers.push(setTimeout(stop, 1200))
        onDone()
      })
    )
  })
  // A chapter whose editor does not come: show the desk anyway.
  timers.push(setTimeout(onDone, 600))
  return stop
}

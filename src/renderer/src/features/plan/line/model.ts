// The story line of the open book, for the Line view: the board, the view on screen, and the save.

import { useMemo } from 'react'
import { create } from 'zustand'
import { STORY_LINE_TYPE, findStoryLine, isStoryLine, parseBoard, serializeBoard, type Board, type LineView } from '@shared/storyline'
import type { Entry } from '@shared/types'
import { getT } from '@/lib/i18n'
import { useBook } from '@/stores/book'

const VIEW_KEY = 'wordelia.lineView'

function readView(): LineView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'order' ? 'order' : 'chapter'
  } catch {
    return 'chapter'
  }
}

interface LineUi {
  view: LineView
  setView(view: LineView): void
}

/** The view on screen. The app remembers it. */
export const useLineUi = create<LineUi>((set) => ({
  view: readView(),
  setView(view) {
    set({ view })
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // No storage: the view is remembered for this session only.
    }
  }
}))

/** The planning entries without the story line: the Line view is the only view of it. */
export function useNotes(): Entry[] {
  const entries = useBook((s) => s.entries)
  return useMemo(() => entries.filter((e) => !isStoryLine(e)), [entries])
}

/** The story line entry, its board, and the notes that a card can mention. */
export function useStoryLine(): { story: Entry | null; board: Board; notes: Entry[] } {
  const entries = useBook((s) => s.entries)
  const story = useMemo(() => findStoryLine(entries), [entries])
  const board = useMemo(() => parseBoard(story?.body ?? ''), [story?.body])
  const notes = useMemo(() => entries.filter((e) => !isStoryLine(e)), [entries])
  return { story, board, notes }
}

/** The folder of the plot category: the story line goes there. */
function plotFolder(): string {
  const book = useBook.getState()
  const cats = book.manifest?.planning.categories ?? []
  const plot = cats.find((c) => c.id === 'plot') ?? cats.find((c) => /^(plot|enredo|trama)$/i.test(c.folder))
  return (plot ?? cats[0] ?? book.addCategory('Plot')).folder
}

/** Save a changed board. The first change makes the entry, in the plot category. */
export function saveBoard(next: Board): void {
  const book = useBook.getState()
  const story = findStoryLine(book.entries)
  const body = serializeBoard(next, book.chapters)
  if (story) {
    if (body !== story.body) book.updateEntry(story.id, { body })
    return
  }
  const t = getT()
  void book.createEntry(plotFolder(), t.plan.line.title, body, { summary: t.plan.line.summary, meta: { type: STORY_LINE_TYPE } })
}

/** Change the board of the open book with a function. */
export function changeBoard(change: (board: Board) => Board): void {
  const story = findStoryLine(useBook.getState().entries)
  const before = parseBoard(story?.body ?? '')
  const next = change(before)
  if (next !== before) saveBoard(next)
}

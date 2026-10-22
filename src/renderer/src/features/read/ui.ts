// What the margin of the comments shows, and the room that it takes on the desk. Also which comments the
// revision list shows.
//
// The desk changes its layout only at a click of the author (a read starts, "Hide", the last comment is
// closed) and when a book opens. A comment that streams in, or text that the author types, never moves the
// page or the chapter list.

import { create } from 'zustand'
import type { CommentState, EditorComment, LensChoice } from '@shared/comments'
import type { AppSettings, Chapter } from '@shared/types'
import { panelLayout } from '@/features/book/panels'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { columnFits } from './layout'
import { useCommentMarks } from './marks'
import { setCommentState, useComments } from './store'

interface ReadUiState {
  /** The book of these choices */
  root: string | null
  /** "Hide": no cards and no marks. Kept for each book. */
  hidden: boolean
  /** The desk keeps room for the column of the cards: the page is at the left of the desk. */
  room: boolean
  /** A read made room: `sidebarWasOpen` when it closed the chapter list. "Hide" opens the list again. */
  roomTaken: { sidebarWasOpen: boolean } | null
  /** The lens filter of the margin */
  lens: LensChoice
  /** The selected card: a line joins it to its passage */
  selected: string | null
  /** The column of the cards shows on the desk now (the desk keeps room for it, and the room is there: zoom.ts) */
  column: boolean
  /** A narrow desk has no column: the card of this comment shows in a popover beside its number. */
  popover: string | null
}

export const useReadUi = create<ReadUiState>(() => ({ root: null, hidden: false, room: false, roomTaken: null, lens: 'all', selected: null, column: false, popover: null }))

/**
 * The comments of the chapters of the book, in all states (the revision list). A comment of a chapter that is
 * not in the book (a sync can bring one back after the chapter was deleted) never shows and never counts; it
 * stays in the file.
 */
export function inBook(list: EditorComment[], chapters: Chapter[]): EditorComment[] {
  const ids = new Set(chapters.map((c) => c.id))
  return list.filter((c) => ids.has(c.chapterId))
}

/** The open comments of the chapters of the book: the counts of the status bar and of the chapter list. */
export function openInBook(list: EditorComment[], chapters: Chapter[]): EditorComment[] {
  return inBook(list, chapters).filter((c) => c.state === 'open')
}

/** The book has open comments that show. Before the book store has the book of the comments, all open comments count. */
function hasOpenComments(): boolean {
  const { list, root } = useComments.getState()
  const book = useBook.getState()
  return book.root === root ? openInBook(list, book.chapters).length > 0 : list.some((c) => c.state === 'open')
}

/* ------------------------------------------------------------------ */
/* "Hide", for each book                                                */
/* ------------------------------------------------------------------ */

const HIDDEN_KEY = 'wordelia.commentsHidden'

const keyOf = (root: string): string => root.replace(/\\/g, '/').toLowerCase()

function hiddenBooks(): Record<string, true> {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '{}') as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, true>) : {}
  } catch {
    return {}
  }
}

function readHidden(root: string): boolean {
  return hiddenBooks()[keyOf(root)] === true
}

function writeHidden(root: string | null, hidden: boolean): void {
  if (!root) return
  const books = hiddenBooks()
  if (hidden) books[keyOf(root)] = true
  else delete books[keyOf(root)]
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(books))
  } catch {
    /* storage may be off */
  }
}

/* ------------------------------------------------------------------ */
/* The room on the desk                                                 */
/* ------------------------------------------------------------------ */

type Ui = AppSettings['ui']

/** The width of a page at 100 %, or 0 when no page shows. */
function pageWidth(): number {
  const inner = document.querySelector<HTMLElement>('.desk-inner')
  return inner ? parseFloat(inner.style.getPropertyValue('--page-w')) || 0 : 0
}

/** The width of the desk with these panels, without its scroll bar. */
function deskWidth(ui: Ui): number {
  const desk = document.querySelector<HTMLElement>('.desk')
  const bar = desk ? desk.offsetWidth - desk.clientWidth : 0
  return panelLayout(window.innerWidth, ui).main - bar
}

/** The book opens: its "Hide" choice, and room for the cards when it has open comments. */
function bookOpened(root: string | null): void {
  const hidden = root ? readHidden(root) : false
  useReadUi.setState({ root, hidden, room: Boolean(root) && !hidden && hasOpenComments(), roomTaken: null, lens: 'all', selected: null, popover: null })
  useCommentMarks.setState({ hidden, lens: 'all' })
}

/** Show the cards and the marks again, with room for the column on the desk. */
export function showComments(): void {
  writeHidden(useReadUi.getState().root, false)
  useReadUi.setState({ hidden: false, room: true })
  useCommentMarks.setState({ hidden: false })
}

/**
 * A read starts: show the margin. When the desk has no room for the page and the column, and closing the
 * chapter list gives that room, close the chapter list and remember it. `ui` holds the changes of the panels
 * that the caller makes at the same time (a read opens the chat): one change of the settings for all.
 */
export function makeRoomForComments(ui: Partial<Ui> = {}): void {
  showComments()
  const app = useApp.getState()
  const now = app.settings?.ui
  if (!now) return
  const next = { ...now, ...ui }
  const patch: Partial<Ui> = { ...ui }
  const page = next.sidebarOpen ? pageWidth() : 0
  const closes = page > 0 && !columnFits(deskWidth(next), page) && columnFits(deskWidth({ ...next, sidebarOpen: false }), page)
  if (closes) patch.sidebarOpen = false
  useReadUi.setState((s) => ({ roomTaken: { sidebarWasOpen: Boolean(s.roomTaken?.sidebarWasOpen) || closes } }))
  if (Object.keys(patch).length) app.setUi(patch)
}

/** Give the room back: the page goes back to the middle, and the chapter list opens when a read closed it. */
function giveRoomBack(): void {
  const taken = useReadUi.getState().roomTaken
  useReadUi.setState({ room: false, roomTaken: null, selected: null, popover: null })
  const app = useApp.getState()
  if (taken?.sidebarWasOpen && app.settings && !app.settings.ui.sidebarOpen) app.setUi({ sidebarOpen: true })
}

/**
 * A read ended: its reply is saved (also a reply that stopped or failed). When the book has no open comment,
 * the margin would be empty: give the room back. "Hide" stays as the author chose it.
 */
export function readEnded(): void {
  if (useReadUi.getState().room && !hasOpenComments()) giveRoomBack()
}

/** "Hide": no cards and no marks, for this book. The page and the chapter list go back to their places. */
export function hideComments(): void {
  writeHidden(useReadUi.getState().root, true)
  useReadUi.setState({ hidden: true })
  useCommentMarks.setState({ hidden: true })
  giveRoomBack()
}

/**
 * The author decides about comments ("Done", "Ignore", "It's intentional", "Mark as done"). Every decision
 * of the author goes through here. When it closes the last open comment of the book, the room goes back, as
 * with "Hide", but the margin stays on; the Undo of the toast takes the room again. A comments file of a newer
 * Wordelia cannot change: then a decision does nothing.
 */
export function decideComments(ids: string[], state: CommentState, reason?: string): void {
  if (useComments.getState().readOnly) return
  let gaveBack = false
  setCommentState(ids, state, reason, {
    onUndo: () => {
      if (gaveBack && hasOpenComments()) makeRoomForComments()
    }
  })
  if (useReadUi.getState().room && !hasOpenComments()) {
    giveRoomBack()
    gaveBack = true
  }
}

/** Show the comments of one lens in the margin and in the text, or of all lenses. */
export function setCommentLens(lens: LensChoice): void {
  useReadUi.setState({ lens })
  useCommentMarks.setState({ lens })
}

/** The desk shows the column of the cards, or not (PageEditor, from the zoom of the desk). */
export function setColumnShown(column: boolean): void {
  if (useReadUi.getState().column !== column) useReadUi.setState({ column })
}

/** Select a card: a line joins it to its passage. */
export function selectComment(id: string | null): void {
  if (useReadUi.getState().selected !== id) useReadUi.setState({ selected: id })
}

/** Show the card of a comment in a popover beside its number (a narrow desk), or close the popover. */
export function showCardPopover(id: string | null): void {
  if (useReadUi.getState().popover !== id) useReadUi.setState({ popover: id })
}

// A book opens (the comments of another book load), or none.
useComments.subscribe((s, prev) => {
  if (s.root !== prev.root) bookOpened(s.root)
})

// Test runs (WORDELIA_E2E) can read the state of the margin.
if (typeof window !== 'undefined' && window.wordelia?.isE2E) {
  ;(window as unknown as Record<string, unknown>).__readUi = useReadUi
}

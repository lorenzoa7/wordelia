// What the author can do with a comment of an editor's read: go to its passage, discuss it in the chat,
// polish its passage, ask for a change of the planning that it is about, or say that the text is
// intentional. The margin, the letter of a read and the revision list use these.
//
// The AI never changes the text here. "Polish passage" opens the normal review (Enter accepts, Esc
// rejects), and "Update the note" asks in the chat, where the normal proposal cards follow. Every decision
// goes through `decideComments`, with Undo.

import { newId } from '@shared/book'
import type { EditorComment } from '@shared/comments'
import type { Mention, Quote, Thread } from '@shared/types'
import { allActions, findAction } from '@/features/actions/allActions'
import { runAction } from '@/features/actions/runAction'
import { resolveTarget } from '@/features/chat/applyProposal'
import { composerEditor, focusComposer, useChat } from '@/features/chat/chatStore'
import { mentionToken } from '@/features/chat/draft'
import { sendInThread } from '@/features/chat/send'
import { getChapterEditor, scrollToPos, whenChapterEditor, type ChapterEditor } from '@/features/editor/registry'
import { onReviewEnd } from '@/features/editor/review'
import { getT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { askText } from '@/ui/prompt'
import { commentRanges, marginNumbers, rangesKnown, useMarksDrawn } from './marks'
import { chapterName, readThreadFor } from './start'
import { useComments } from './store'
import { closeRevisionList, decideComments, makeRoomForComments, selectComment, showCardPopover, useReadUi } from './ui'

/** The longest wait for the editor of a chapter to find the passages of its comments */
const PASSAGES_WAIT_MS = 2000

/** Run `fn` when the editor of a chapter has looked for the passages of its comments. */
function whenPassages(chapterId: string, fn: () => void): void {
  if (rangesKnown(chapterId)) return fn()
  let done = false
  const finish = (): void => {
    if (done) return
    done = true
    off()
    clearTimeout(timer)
    fn()
  }
  const off = useMarksDrawn.subscribe(() => {
    if (rangesKnown(chapterId)) finish()
  })
  const timer = setTimeout(finish, PASSAGES_WAIT_MS)
}

/**
 * The chapter of a comment in the Write view, with the passages of its comments: run `go` then. A chapter
 * on screen becomes the active chapter; another chapter opens first. The revision list closes: the text shows.
 */
function inChapter(chapterId: string, go: (e: ChapterEditor) => void): void {
  closeRevisionList()
  const ready = (e: ChapterEditor): void => whenPassages(chapterId, () => !e.editor.isDestroyed && go(e))
  const book = useBook.getState()
  const here = book.view === 'write' ? getChapterEditor(chapterId) : null
  if (here) {
    book.setActiveChapter(chapterId)
    return ready(here)
  }
  book.selectChapter(chapterId)
  // The chapter jumps into view first.
  whenChapterEditor(chapterId, (e) => setTimeout(() => ready(e), 60))
}

const inBook = (c: EditorComment): boolean => useBook.getState().chapters.some((ch) => ch.id === c.chapterId)

/**
 * Go to a comment: open its chapter, scroll to its passage and select its card (in a narrow window, its card
 * opens beside its number). Hidden comments show again first. A closed comment has no card: its passage is
 * selected in the text.
 */
export function goToComment(c: EditorComment): void {
  if (!inBook(c)) return
  const open = c.state === 'open'
  const ui = useReadUi.getState()
  if (open && (ui.hidden || !ui.room)) makeRoomForComments()
  inChapter(c.chapterId, (e) => {
    const range = commentRanges(c.chapterId).get(c.id)
    if (!open) {
      if (!range) return
      scrollToPos(e.editor, range.from)
      e.editor.chain().focus(null, { scrollIntoView: false }).setTextSelection(range).run()
      return
    }
    const narrow = !useReadUi.getState().column
    // The popover finds its number on screen: no smooth scroll then.
    if (range) scrollToPos(e.editor, range.from, narrow ? 'auto' : 'smooth')
    selectComment(c.id)
    requestAnimationFrame(() => {
      if (narrow && range) showCardPopover(c.id)
      // A comment without a passage in the text: its card is after the others.
      else if (!range) document.querySelector(`.cm-card[data-comment="${CSS.escape(c.id)}"]`)?.scrollIntoView({ block: 'nearest' })
    })
  })
}

/** The thread of the read of a comment, in the chat. When that thread is gone, the read thread of its chapter. */
function showThread(c: EditorComment): Thread {
  const book = useBook.getState()
  const thread = book.threads.find((t) => t.id === c.threadId) ?? readThreadFor(c.chapterId)
  const chat = useChat.getState()
  if (book.threads.some((t) => t.id === thread.id)) {
    if (chat.activeThreadId !== thread.id || chat.blank || chat.listOpen) chat.setActiveThread(thread.id)
  } else if (chat.blank?.id !== thread.id) chat.openBlank(thread)
  const app = useApp.getState()
  if (app.settings && !app.settings.ui.chatOpen) app.setUi({ chatOpen: true })
  return thread
}

/** The passage of a comment as a quote of the chat, from its chapter. */
function passageQuote(c: EditorComment): Omit<Quote, 'id'> | null {
  const chapter = useBook.getState().chapters.find((ch) => ch.id === c.chapterId)
  return chapter ? { text: c.passage, source: { kind: 'chapter', id: chapter.id, label: chapterName(chapter.title) } } : null
}

/**
 * "Discuss in chat": the thread of the read shows, with the passage as a quote in the composer and words
 * about the comment in the draft. The author writes the question. A draft of the author stays as it is.
 */
export function discussComment(c: EditorComment): void {
  const quote = passageQuote(c)
  if (!quote) return
  showThread(c)
  if (!useChat.getState().quotes.some((q) => q.text === quote.text)) useChat.setState((s) => ({ quotes: [...s.quotes, { ...quote, id: newId('q') }] }))
  const chat = useChat.getState()
  if (!chat.draft.trim()) chat.setDraft(getT().read.aboutComment(marginNumbers(c.chapterId).get(c.id) ?? null, c.text))
  // The cursor goes to the end of the composer: at once when the composer shows (a focus that comes later
  // could take the focus from what the author opens next), else when the chat that just opened shows it.
  const composer = composerEditor()
  if (composer) composer.commands.focus('end')
  else focusComposer(200)
}

/** The comments whose Polish waits in a review, by chapter and comment text (the note of the review). */
const polishing = new Map<string, string>()
const polishKey = (chapterId: string, note: string): string => `${chapterId}\n${note}`

/**
 * "Polish passage": the main action (Polish) runs on the passage of the comment, with the comment as an extra
 * instruction, in the normal review. When the author accepts the change, a toast asks to mark the comment as
 * done. Returns when the AI answered.
 */
export function polishComment(c: EditorComment): Promise<void> {
  const action = findAction(useApp.getState().settings?.defaultActionId) ?? allActions()[0]
  if (!action || !inBook(c)) return Promise.resolve()
  return new Promise((resolve) => {
    inChapter(c.chapterId, (e) => {
      const range = commentRanges(c.chapterId).get(c.id)
      if (!range) {
        toast(getT().read.noPassage)
        return resolve()
      }
      scrollToPos(e.editor, range.from)
      // The cursor goes to the text: Enter accepts the change and Esc rejects it.
      e.editor.commands.focus(null, { scrollIntoView: false })
      polishing.set(polishKey(c.chapterId, c.text), c.id)
      void runAction(action, range, { editor: e, note: c.text }).then(resolve)
    })
  })
}

// The author accepted the Polish of a comment (also a Retry of it): ask whether the comment is done.
onReviewEnd((e) => {
  if (!e.accepted || !e.data.note || !e.data.docId) return
  const key = polishKey(e.data.docId, e.data.note)
  const id = polishing.get(key)
  polishing.delete(key)
  if (id) askDoneAfterPolish(id)
})

/**
 * The author accepted the Polish of a comment: a toast asks whether the comment is done. Nothing closes by
 * itself, and no question comes for a comment that is closed, or in a comments file of a newer Wordelia.
 */
export function askDoneAfterPolish(id: string): void {
  const { list, readOnly } = useComments.getState()
  if (readOnly || !list.some((c) => c.id === id && c.state === 'open')) return
  const t = getT()
  toast(t.read.polished, {
    ms: 12000,
    action: {
      label: t.read.markDone(1),
      run: () => {
        // The author can close the comment in the meantime: close it only while it is still open.
        const still = useComments
          .getState()
          .list.filter((c) => c.id === id && c.state === 'open')
          .map((c) => c.id)
        if (still.length) decideComments(still, 'done')
      }
    }
  })
}

/**
 * "Update the note" (Continuity): a message in the thread of the read asks for a change of the planning note
 * or of the story line (the sources of the comment, as mentions) to agree with the text, with the passage as
 * a quote. The normal proposal cards follow: nothing changes before the author accepts.
 */
export async function updateNoteFor(c: EditorComment): Promise<void> {
  const quote = passageQuote(c)
  if (!quote) return
  const thread = showThread(c)
  // One reply at a time in a thread: say it, and send nothing.
  if (useChat.getState().streaming[thread.id]) {
    toast(getT().read.threadBusy)
    return
  }
  const mentions: Mention[] = []
  const targets: string[] = []
  for (const s of c.sources) {
    const target = resolveTarget(s.file)
    const m: Mention | null =
      target.kind === 'chapter' ? { kind: 'chapter', id: target.chapter.id, label: target.chapter.title } : target.kind === 'entry' ? { kind: 'entry', id: target.entry.id, label: target.entry.name } : null
    if (m && mentions.some((x) => x.id === m.id)) continue
    if (m) mentions.push(m)
    targets.push(m ? mentionToken(m) : s.file)
  }
  await sendInThread(thread.id, getT().read.updateNoteAsk(c.text, targets), { quotes: [{ ...quote, id: newId('q') }], ...(mentions.length ? { mentions } : {}) })
}

/** "It's intentional" (Continuity): an optional short reason, which the next reads get. */
export async function markIntentional(c: EditorComment): Promise<void> {
  if (useComments.getState().readOnly) return
  const ask = getT().read.intentionalAsk
  const reason = await askText({ title: ask.title, label: ask.label, placeholder: ask.placeholder, confirm: ask.confirm, optional: true })
  if (reason === null) return
  decideComments([c.id], 'intentional', reason)
}

// The comments of the open book: the store, and the file `ai/comments.json` behind it.
//
// A comment is data about the text. The store never changes a chapter. Each change of the list goes to
// the file through the saver. The comments of a reply are made again from the reply, so a reply that
// the app reads twice (a stream, a book that opens again) does not make a comment twice.

import { create } from 'zustand'
import { COMMENTS_FILE, markdownToPlainBlocks } from '@shared/book'
import { READ_LIMIT_ALL, READ_LIMIT_ONE, mergeComments, readCommentsFile, serializeComments, uniqueById, type CommentState, type EditorComment } from '@shared/comments'
import { parseProposals } from '@shared/proposals/parse'
import type { ChatMessage, ReadRequest, Thread } from '@shared/types'
import { invoke } from '@/lib/api'
import { getT } from '@/lib/i18n'
import { saver } from '@/stores/saver'
import { toast } from '@/stores/ui'
import { commentsFromSegments } from './fromReply'

interface CommentsState {
  /** The comments of all the chapters of the book, in the order that they came */
  list: EditorComment[]
  /** The book of the list. The list is empty when no book is open. */
  root: string | null
  /** The app shows the comments and never writes the file: the file comes from a newer Wordelia, or it is damaged. */
  readOnly: boolean
  /**
   * The book opened with a file that is not a comments file (conflict marks of git, a partial write of a sync
   * client). Its decisions must not be lost: the list stays empty, and the replies of the reads make no comments
   * over it, until a good file arrives or the file goes away.
   */
  damaged: boolean
}

export const useComments = create<CommentsState>(() => ({ list: [], root: null, readOnly: false, damaged: false }))

const now = (): string => new Date().toISOString()

/** Write the file. A file from a newer Wordelia stays as it is. */
function persist(): void {
  const { root, list, readOnly } = useComments.getState()
  if (root && !readOnly) saver.write(root, COMMENTS_FILE, serializeComments(list))
}

/** Set a new list and write it. */
function change(list: EditorComment[]): void {
  useComments.setState({ list })
  persist()
}

/** The writer hears once that a newer Wordelia wrote the file. */
function sayNewer(): void {
  toast(getT().read.newerFile, { ms: 12000 })
}

/** The writer hears once that the file is damaged, and that the app does not change it. */
function sayDamaged(): void {
  toast(getT().read.damagedFile, { ms: 30000 })
}

/**
 * Show the comments of a book: the book opens, or its file changed. The list of another book goes away.
 * `version` is the version of the file: a newer one than 1 is shown and never written. `damaged`: the file is
 * there, but it is not a comments file; it is never written. The writer hears each of the two once for the book.
 */
export function loadComments(root: string | null, list: EditorComment[], version = 1, damaged = false): void {
  const before = useComments.getState()
  const newer = version > 1 && !damaged
  useComments.setState({ root, list: uniqueById(list), readOnly: newer || damaged, damaged })
  if (!root) return
  const same = before.root === root
  if (damaged && !(same && before.damaged)) sayDamaged()
  if (newer && !(same && before.readOnly && !before.damaged)) sayNewer()
}

/**
 * The file `ai/comments.json` changed outside the app (a sync client, git). Show the new list. When the app
 * has a change of its own that waits to be written, the two lists merge: each comment of the two stays, the
 * later version of a comment wins, and the app writes the merge. A file of a newer Wordelia always wins: the
 * change of the app is dropped, and the app does not write the file any more (also when the newer Wordelia
 * changed the shape of the file: then the list stays). Other text that is not a comments file (a sync client
 * has not finished the write) changes nothing. A good file, or no file, after a damaged one makes the list
 * normal again.
 */
export function commentsChangedOutside(root: string, content: string | null): void {
  const { root: open, readOnly, damaged } = useComments.getState()
  if (open !== root) return
  const file = readCommentsFile(content)
  if (file.version > 1) saver.cancel(root, COMMENTS_FILE)
  // A damaged file has no list of the app to merge with: the good file comes as it is.
  if (file.valid && file.version === 1 && !damaged && saver.isPending(root, COMMENTS_FILE)) {
    change(mergeComments(useComments.getState().list, file.comments))
    return
  }
  if (file.valid) {
    loadComments(root, file.comments, file.version)
    return
  }
  if (file.version > 1 && (!readOnly || damaged)) {
    useComments.setState({ readOnly: true, damaged: false })
    sayNewer()
  }
}

/**
 * Add the comments of the notes of a reply that came in. A reply that grows (a stream) adds only its new
 * notes: the same thread, message and key give the same comment, and a read never passes its limit.
 * Returns the comments that this call added. A damaged file gets none: the comments of the reply are in it,
 * with the decisions of the writer.
 */
export function addFromReply(thread: Thread, message: ChatMessage, req: ReadRequest, chapterText: string): EditorComment[] {
  const { list, root, damaged } = useComments.getState()
  if (!root || damaged || !message.content.includes('<note')) return []
  const limit = req.lens === 'all' ? READ_LIMIT_ALL : READ_LIMIT_ONE
  const mine = list.filter((c) => c.threadId === thread.id && c.messageId === message.id)
  if (mine.length >= limit) return []
  const found = commentsFromSegments(parseProposals(message.content), {
    threadId: thread.id,
    messageId: message.id,
    chapterId: req.chapterId,
    chapterPlain: markdownToPlainBlocks(chapterText),
    selection: req.selection?.text,
    limit,
    now: now()
  })
  const have = new Set(mine.map((c) => c.key))
  const added = found.filter((c) => !have.has(c.key)).slice(0, limit - mine.length)
  if (!added.length) return []
  change([...list, ...added])
  return added
}

/** A comment in a state. The reason belongs to the state "intentional" only. */
function inState(c: EditorComment, state: CommentState, reason: string | undefined, updatedAt: string): EditorComment {
  const next: EditorComment = { ...c, state, updatedAt }
  if (reason) next.reason = reason
  else delete next.reason
  return next
}

/**
 * Put comments in a state. A toast says it and has Undo: the old states come back, except for a comment
 * that the writer changed again in the meantime. `onUndo` runs after an Undo (the margin takes its room again).
 */
export function setCommentState(ids: string[], state: CommentState, reason?: string, opts: { onUndo?: () => void } = {}): void {
  const { list, root } = useComments.getState()
  const wanted = new Set(ids)
  const why = state === 'intentional' ? reason?.trim() || undefined : undefined
  const old = new Map<string, EditorComment>()
  const stamp = now()
  const next = list.map((c) => {
    if (!wanted.has(c.id) || (c.state === state && c.reason === why)) return c
    old.set(c.id, c)
    return inState(c, state, why, stamp)
  })
  if (!old.size) return
  change(next)
  const t = getT()
  toast(t.read.stateChanged[state](old.size), {
    ms: 9000,
    action: {
      label: t.common.undo,
      run: () => {
        const current = useComments.getState()
        if (current.root !== root) return
        change(
          current.list.map((c) => {
            const before = old.get(c.id)
            // The Undo is a decision of the writer too: it gets a new time.
            return before && c.state === state && c.reason === why ? inState(c, before.state, before.reason, now()) : c
          })
        )
        opts.onUndo?.()
      }
    }
  })
}

/**
 * The passage of a comment changed because the writer edited it. `updatedAt` is the time of the last decision
 * of the writer (the state), so it stays: a decision from another computer always wins a merge, and the
 * editor of the chapter writes the passage again from its own text.
 */
export function updatePassage(id: string, passage: string): void {
  const { list } = useComments.getState()
  if (!list.some((c) => c.id === id && c.passage !== passage)) return
  change(list.map((c) => (c.id === id ? { ...c, passage } : c)))
}

/** The passage of a comment is gone from the text ("lost"), or is there again. `updatedAt` stays, as for `updatePassage`. */
export function setLost(id: string, lost: boolean): void {
  const { list } = useComments.getState()
  if (!list.some((c) => c.id === id && Boolean(c.lost) !== lost)) return
  change(
    list.map((c) => {
      if (c.id !== id) return c
      const next: EditorComment = { ...c }
      if (lost) next.lost = true
      else delete next.lost
      return next
    })
  )
}

/**
 * The chapter goes to the trash: take its comments out of the list and return them, for the Undo of the
 * delete (`putBackComments`). With `trash` (a path in the book, in `.wordelia/trash`) they also go to a
 * file there, next to the file of the chapter.
 */
export function takeChapterComments(chapterId: string, trash?: string): EditorComment[] {
  const { list, root } = useComments.getState()
  const taken = list.filter((c) => c.chapterId === chapterId)
  if (!taken.length) return []
  change(list.filter((c) => c.chapterId !== chapterId))
  if (root && trash) void invoke('book:writeFile', root, trash, serializeComments(taken)).catch(() => {})
  return taken
}

/**
 * Replies of reads leave their thread (Retry, Rewind, the Edit of an earlier message, a deleted thread): their
 * open comments go too, because a comment comes from a reply. A decided comment (done, ignored, intentional)
 * stays, also when its reply or thread is gone: it is the memory of the chapter, and the next read gets it so
 * that it does not write the comment again. Returns the comments that went, for the Undo of a thread delete
 * (`putBackComments`).
 */
export function dropMessageComments(messageIds: string[]): EditorComment[] {
  const { list } = useComments.getState()
  const gone = new Set(messageIds)
  const goes = (c: EditorComment): boolean => c.state === 'open' && gone.has(c.messageId)
  const taken = list.filter(goes)
  if (taken.length) change(list.filter((c) => !goes(c)))
  return taken
}

/** Bring comments back (the Undo of a chapter or thread delete). A comment that is already in the list stays as it is. */
export function putBackComments(back: EditorComment[]): void {
  const { list } = useComments.getState()
  const have = new Set(list.map((c) => c.id))
  const fresh = uniqueById(back).filter((c) => !have.has(c.id))
  if (fresh.length) change([...list, ...fresh])
}

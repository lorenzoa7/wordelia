// Undo toasts for the decisions on proposals: a rejection goes back to "pending", and an accepted
// note, portrait or a whole reply ("Apply all") goes back out of the book where the text of the AI is
// still there, unchanged.

import type { HunkState, Thread } from '@shared/types'
import { getT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { setHunkStates } from './applyProposal'
import { bookChangesIn, undoBookChanges } from './rewind'

function latestThread(id: string): Thread | undefined {
  return useBook.getState().threads.find((t) => t.id === id)
}

/** Reject proposals of a message, with a toast that sets them back to "pending". */
export function rejectWithUndo(thread: Thread, messageId: string, keys: string[]): void {
  rejectManyWithUndo(thread, [{ messageId, keys }])
}

/** Reject proposals of several messages of a thread, with one toast that sets them back to "pending". */
export function rejectManyWithUndo(thread: Thread, items: Array<{ messageId: string; keys: string[] }>): void {
  const todo = items.filter((x) => x.keys.length)
  const n = todo.reduce((sum, x) => sum + x.keys.length, 0)
  if (!n) return
  const t = getT()
  for (const x of todo) {
    const now = latestThread(thread.id) ?? thread
    setHunkStates(now, x.messageId, Object.fromEntries(x.keys.map((k) => [k, 'rejected' as HunkState])))
  }
  toast(t.chat.rejectedCount(n), {
    ms: 7000,
    action: {
      label: t.common.undo,
      run: () => {
        for (const x of todo) {
          const now = latestThread(thread.id)
          const m = now?.messages.find((y) => y.id === x.messageId)
          if (!now || !m) continue
          // Only the proposals that are still rejected go back.
          const back = x.keys.filter((k) => m.hunks?.[k] === 'rejected')
          if (back.length) setHunkStates(now, x.messageId, Object.fromEntries(back.map((k) => [k, 'pending' as HunkState])))
        }
      }
    }
  })
}

/**
 * Undo accepted proposals of a message in the book (the newest first), and set them back to
 * "pending". A change that the author changed after the AI change stays: then the toast tells it.
 */
export async function undoAccepted(threadId: string, messageId: string, keys: string[]): Promise<void> {
  const t = getT()
  const thread = latestThread(threadId)
  const m = thread?.messages.find((x) => x.id === messageId)
  if (!thread || !m) return
  const mine = keys.filter((k) => m.hunks?.[k] === 'accepted')
  if (!mine.length) return
  const only = { ...m, hunks: Object.fromEntries(mine.map((k) => [k, 'accepted' as HunkState])) }
  const r = await undoBookChanges(bookChangesIn([only]))
  if (r.failed) {
    toast(t.chat.undonePartial(r.undone, r.undone + r.failed), { kind: 'error', ms: 9000 })
    return
  }
  const now = latestThread(threadId)
  if (now) setHunkStates(now, messageId, Object.fromEntries(mine.map((k) => [k, 'pending' as HunkState])))
}

/** A toast after an accepted note, portrait or reply, with Undo. */
export function acceptedToast(message: string, threadId: string, messageId: string, keys: string[]): void {
  const t = getT()
  toast(message, { ms: 9000, action: { label: t.common.undo, run: () => void undoAccepted(threadId, messageId, keys) } })
}

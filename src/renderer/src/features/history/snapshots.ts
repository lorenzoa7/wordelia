// Automatic snapshots of chapters, for the version history.

import { invoke } from '@/lib/api'
import { useBook } from '@/stores/book'
import { flushEditor } from '@/features/editor/registry'

export function snapshot(chapterId: string | null, label: string): void {
  if (!chapterId) return
  flushEditor()
  const { root, chapters } = useBook.getState()
  const ch = chapters.find((c) => c.id === chapterId)
  if (!root || !ch || !ch.body.trim()) return
  void invoke('history:save', root, ch.id, label, ch.body).catch(() => {})
}

let timer: ReturnType<typeof setInterval> | undefined
let unsub: (() => void) | undefined

/** Start automatic snapshots: when a chapter opens, and every few minutes. */
export function startAutoSnapshots(): () => void {
  stopAutoSnapshots()
  let last = useBook.getState().activeChapterId
  snapshot(last, 'Opened')
  unsub = useBook.subscribe((s) => {
    if (s.activeChapterId !== last) {
      snapshot(last, 'Left the chapter')
      last = s.activeChapterId
      snapshot(last, 'Opened')
    }
  })
  timer = setInterval(() => snapshot(useBook.getState().activeChapterId, 'Autosave'), 8 * 60 * 1000)
  return stopAutoSnapshots
}

export function stopAutoSnapshots(): void {
  clearInterval(timer)
  unsub?.()
  unsub = undefined
}

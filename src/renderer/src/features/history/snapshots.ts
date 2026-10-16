// Automatic snapshots of chapters, for the version history.

import { messagesFor, type Messages } from '@shared/i18n'
import { invoke } from '@/lib/api'
import { useBook } from '@/stores/book'
import { flushEditor } from '@/features/editor/registry'

const EN = messagesFor('en')

/** Snapshot files keep English labels. snapshotLabel shows them in the interface language. */
export const SNAPSHOT_EN = EN.history
const L = SNAPSHOT_EN.labels

/** The label of a saved version, in the interface language. Labels that are not known stay as they are. */
export function snapshotLabel(t: Messages, label: string): string {
  const key = (Object.keys(L) as Array<keyof typeof L>).find((k) => L[k] === label)
  if (key) return t.history.labels[key]
  const before = /^Before (.+)$/.exec(label)
  if (before) {
    const name = before[1]
    const builtIn = Object.keys(EN.common.builtinActions).find((id) => EN.common.builtinActions[id] === name)
    return t.history.before(builtIn ? (t.common.builtinActions[builtIn] ?? name) : name)
  }
  return label
}

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
  snapshot(last, L.opened)
  unsub = useBook.subscribe((s) => {
    if (s.activeChapterId !== last) {
      snapshot(last, L.left)
      last = s.activeChapterId
      snapshot(last, L.opened)
    }
  })
  timer = setInterval(() => snapshot(useBook.getState().activeChapterId, L.autosave), 8 * 60 * 1000)
  return stopAutoSnapshots
}

export function stopAutoSnapshots(): void {
  clearInterval(timer)
  unsub?.()
  unsub = undefined
}

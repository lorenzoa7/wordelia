import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { ClockCounterClockwise } from '@phosphor-icons/react'
import { markdownToPlain } from '@shared/book'
import { wordDiff, diffStats } from '@shared/text/diff'
import type { HistoryItem } from '@shared/types'
import { Button, Dialog, Spinner } from '@/ui'
import { invoke } from '@/lib/api'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { flushEditor } from '@/features/editor/registry'
import { snapshot } from './snapshots'
import './history.css'

function when(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return `Today, ${time}`
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`
}

export function HistoryDialog({ chapterId, onClose }: { chapterId: string | null; onClose: () => void }): React.JSX.Element {
  const root = useBook((s) => s.root)
  const chapter = useBook((s) => s.chapters.find((c) => c.id === chapterId))
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(null)

  useEffect(() => {
    setItems(null)
    setSelected(null)
    if (!chapterId || !root) return
    flushEditor()
    void invoke('history:list', root, chapterId).then((list) => {
      setItems(list)
      setSelected(list[0]?.id ?? null)
    })
  }, [chapterId, root])

  useEffect(() => {
    setBody(null)
    if (!selected || !chapterId || !root) return
    void invoke('history:read', root, chapterId, selected).then(setBody)
  }, [selected, chapterId, root])

  const ops = useMemo(() => {
    if (body == null || !chapter) return null
    return wordDiff(markdownToPlain(chapter.body).trim(), markdownToPlain(body).trim())
  }, [body, chapter])
  const stats = ops ? diffStats(ops) : null

  const restore = (): void => {
    if (!chapter || body == null) return
    snapshot(chapter.id, 'Before restore')
    useBook.getState().restoreChapter(chapter.id, body)
    toast(`"${chapter.title}" is back to the version of ${when(items?.find((i) => i.id === selected)?.at ?? '')}.`)
    onClose()
  }

  return (
    <Dialog
      open={chapterId !== null}
      onOpenChange={(v) => !v && onClose()}
      title={chapter ? `History of “${chapter.title}”` : 'History'}
      description="Wordelia keeps versions when you open a chapter, every few minutes while you write, and before AI changes."
      width={900}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={<ClockCounterClockwise size={14} />} disabled={body == null} onClick={restore}>
            Restore this version
          </Button>
        </>
      }
    >
      {items === null ? (
        <div className="history-empty">
          <Spinner /> Reading the history…
        </div>
      ) : items.length === 0 ? (
        <div className="history-empty">No versions yet. Wordelia saves one when you open the chapter and while you write.</div>
      ) : (
        <div className="history">
          <ol className="history-list">
            {items.map((it) => (
              <li key={it.id}>
                <button className={clsx('history-item', it.id === selected && 'is-active')} onClick={() => setSelected(it.id)}>
                  <span className="history-when">{when(it.at)}</span>
                  <span className="history-label">
                    {it.label} · {it.words.toLocaleString('en-US')} words
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="history-preview">
            {stats && (
              <div className="history-stats">
                If you restore this version: <span className="plus">+{stats.added}</span> <span className="minus">−{stats.removed}</span> words
              </div>
            )}
            <div className="history-text prose">
              {ops ? (
                ops.map((op, i) =>
                  op.type === 'equal' ? (
                    <span key={i}>{op.text}</span>
                  ) : op.type === 'insert' ? (
                    <ins key={i}>{op.text}</ins>
                  ) : (
                    <del key={i}>{op.text}</del>
                  )
                )
              ) : (
                <Spinner />
              )}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

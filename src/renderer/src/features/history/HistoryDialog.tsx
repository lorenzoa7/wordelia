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
import type { Messages } from '@shared/i18n'
import { useT } from '@/lib/i18n'
import { SNAPSHOT_EN, snapshot, snapshotLabel } from './snapshots'
import './history.css'

function when(t: Messages, iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const time = d.toLocaleTimeString(t.common.locale, { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return t.history.today(time)
  return `${d.toLocaleDateString(t.common.locale, { month: 'short', day: 'numeric' })}, ${time}`
}

export function HistoryDialog({ chapterId, onClose }: { chapterId: string | null; onClose: () => void }): React.JSX.Element {
  const t = useT()
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
    snapshot(chapter.id, SNAPSHOT_EN.labels.beforeRestore)
    useBook.getState().restoreChapter(chapter.id, body)
    toast(t.history.restored(chapter.title, when(t, items?.find((i) => i.id === selected)?.at ?? '')))
    onClose()
  }

  return (
    <Dialog
      open={chapterId !== null}
      onOpenChange={(v) => !v && onClose()}
      title={chapter ? t.history.titleOf(chapter.title) : t.history.title}
      description={t.history.description}
      width={900}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.close}
          </Button>
          <Button variant="primary" icon={<ClockCounterClockwise size={14} />} disabled={body == null} onClick={restore}>
            {t.history.restore}
          </Button>
        </>
      }
    >
      {items === null ? (
        <div className="history-empty">
          <Spinner /> {t.history.reading}
        </div>
      ) : items.length === 0 ? (
        <div className="history-empty">{t.history.empty}</div>
      ) : (
        <div className="history">
          <ol className="history-list">
            {items.map((it) => (
              <li key={it.id}>
                <button aria-current={it.id === selected ? 'true' : undefined} className={clsx('history-item', it.id === selected && 'is-active')} onClick={() => setSelected(it.id)}>
                  <span className="history-when">{when(t, it.at)}</span>
                  <span className="history-label">
                    {snapshotLabel(t, it.label)} · {t.common.words(it.words)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="history-preview">
            {stats && (
              <div className="history-stats">
                {t.history.ifRestore} <span className="plus">+{t.common.number(stats.added)}</span> <span className="minus">−{t.common.number(stats.removed)}</span> {t.history.words}
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

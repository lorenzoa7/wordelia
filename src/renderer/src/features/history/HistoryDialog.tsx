import { useEffect, useMemo, useRef, useState } from 'react'
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

/** The first change shows this far from the top of the compare view, so the text before it gives context. */
const CHANGE_AT = 0.3

/**
 * Scroll the compare view to its first change (the first word that the restore adds or removes), smoothly,
 * so the author sees at once what changed. A version without changes goes back to the top.
 *
 * The glide takes the time of the `--dur-slow` motion token, also for a long chapter: the smooth scroll of
 * the browser takes about 2 s for a few thousand pixels. A wheel, a key or a click on the view stops it.
 * Returns a function that stops it.
 */
function scrollToFirstChange(box: HTMLElement): () => void {
  const mark = box.querySelector('ins, del')
  const wanted = mark ? box.scrollTop + mark.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight * CHANGE_AT : 0
  const to = Math.round(Math.min(Math.max(0, wanted), box.scrollHeight - box.clientHeight))
  const from = box.scrollTop
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const duration = parseFloat(getComputedStyle(box).getPropertyValue('--dur-slow')) || 0
  if (reduced || !duration || Math.abs(to - from) < 2) {
    box.scrollTop = to
    return () => {}
  }
  const start = performance.now()
  let frame = 0
  const stop = (): void => {
    cancelAnimationFrame(frame)
    for (const type of ['wheel', 'keydown', 'pointerdown'] as const) box.removeEventListener(type, stop)
  }
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / duration)
    // Ease out, like the --ease-out token: fast at the start, slow at the end.
    box.scrollTop = from + (to - from) * (1 - Math.pow(1 - t, 4))
    if (t < 1) frame = requestAnimationFrame(step)
    else stop()
  }
  for (const type of ['wheel', 'keydown', 'pointerdown'] as const) box.addEventListener(type, stop, { passive: true })
  frame = requestAnimationFrame(step)
  return stop
}

export function HistoryDialog({ chapterId, onClose }: { chapterId: string | null; onClose: () => void }): React.JSX.Element {
  const t = useT()
  const root = useBook((s) => s.root)
  const chapter = useBook((s) => s.chapters.find((c) => c.id === chapterId))
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  /** The text of a saved version, with the id of that version */
  const [loaded, setLoaded] = useState<{ id: string; text: string | null } | null>(null)
  // Only the text of the selected version: while a new version loads, the old text does not show.
  const body = loaded && loaded.id === selected ? loaded.text : null
  const textRef = useRef<HTMLDivElement>(null)
  /** The version that the compare view went to the first change of, so a later render does not move the view again. */
  const shownRef = useRef<string | null>(null)
  /** Stops the glide to the first change */
  const glideRef = useRef<() => void>(() => {})

  useEffect(() => {
    setItems(null)
    setSelected(null)
    shownRef.current = null
    if (!chapterId || !root) return
    flushEditor()
    void invoke('history:list', root, chapterId).then((list) => {
      setItems(list)
      setSelected(list[0]?.id ?? null)
    })
  }, [chapterId, root])

  useEffect(() => {
    if (!selected || !chapterId || !root) return
    let live = true
    void invoke('history:read', root, chapterId, selected).then((text) => live && setLoaded({ id: selected, text }))
    return () => {
      live = false
    }
  }, [selected, chapterId, root])

  const ops = useMemo(() => {
    if (body == null || !chapter) return null
    return wordDiff(markdownToPlain(chapter.body).trim(), markdownToPlain(body).trim())
  }, [body, chapter])
  const stats = ops ? diffStats(ops) : null

  // A new version in the compare view: go to its first change, one time.
  useEffect(() => {
    const box = textRef.current
    if (!ops || !box || shownRef.current === selected) return
    // After the layout of the new text. A glide to the change of another version stops first.
    const frame = requestAnimationFrame(() => {
      shownRef.current = selected
      glideRef.current()
      glideRef.current = scrollToFirstChange(box)
    })
    return () => cancelAnimationFrame(frame)
  }, [ops, selected])
  useEffect(() => () => glideRef.current(), [])

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
            <div className="history-text prose" ref={textRef}>
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

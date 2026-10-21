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
import { flushEditor, getChapterEditor } from '@/features/editor/registry'
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
 * A version that loads for longer than this shows a spinner. A faster load shows no spinner: the compare
 * view keeps the version before it until the new text is there, so nothing flashes.
 */
const SPINNER_AFTER_MS = 300

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
  /**
   * The version in the compare view: its id and its text (null: the file cannot be read). While the
   * selected version loads, this is still the version before it.
   */
  const [loaded, setLoaded] = useState<{ id: string; text: string | null } | null>(null)
  const body = loaded?.text ?? null
  /** The selected version is not in the compare view yet */
  const waiting = selected !== null && loaded?.id !== selected
  /** The selected version takes long to load: show a spinner */
  const [slow, setSlow] = useState(false)
  /** The reads of the versions of this chapter, by id. A version that the author selects again shows at once. */
  const reads = useRef(new Map<string, Promise<string | null>>())
  const textRef = useRef<HTMLDivElement>(null)
  /** The version that the compare view went to the first change of, so a later render does not move the view again. */
  const shownRef = useRef<string | null>(null)
  /** Stops the glide to the first change */
  const glideRef = useRef<() => void>(() => {})
  /** A restore waits for its version: a second click does nothing */
  const restoring = useRef(false)

  const read = (id: string): Promise<string | null> => {
    let p = reads.current.get(id)
    if (!p && root && chapterId) {
      p = invoke('history:read', root, chapterId, id)
      reads.current.set(id, p)
    }
    return p ?? Promise.resolve(null)
  }

  useEffect(() => {
    setItems(null)
    setSelected(null)
    setLoaded(null)
    reads.current = new Map()
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
    void read(selected).then((text) => live && setLoaded({ id: selected, text }))
    return () => {
      live = false
    }
  }, [selected, chapterId, root]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSlow(false)
    if (!waiting) return
    const timer = setTimeout(() => setSlow(true), SPINNER_AFTER_MS)
    return () => clearTimeout(timer)
  }, [waiting, selected])

  const ops = useMemo(() => {
    if (body == null || !chapter) return null
    return wordDiff(markdownToPlain(chapter.body).trim(), markdownToPlain(body).trim())
  }, [body, chapter])
  const stats = ops ? diffStats(ops) : null

  // A new version in the compare view: go to its first change, one time.
  const shownId = loaded?.id ?? null
  useEffect(() => {
    const box = textRef.current
    if (!ops || !box || shownRef.current === shownId) return
    // After the layout of the new text. A glide to the change of another version stops first.
    const frame = requestAnimationFrame(() => {
      shownRef.current = shownId
      glideRef.current()
      glideRef.current = scrollToFirstChange(box)
    })
    return () => cancelAnimationFrame(frame)
  }, [ops, shownId])
  useEffect(() => () => glideRef.current(), [])

  /**
   * Restore the selected version. The button stays on while a version loads, so it does not flash at
   * each new selection: a click then waits for the text of the selected version, never the one on screen.
   */
  const restore = async (): Promise<void> => {
    const id = selected
    if (!chapter || !id || restoring.current) return
    restoring.current = true
    const text = loaded?.id === id ? loaded.text : await read(id)
    restoring.current = false
    if (text == null) {
      toast(t.history.unreadable, { kind: 'error' })
      return
    }
    snapshot(chapter.id, SNAPSHOT_EN.labels.beforeRestore)
    const id_ = chapter.id
    const before = useBook.getState().chapters.find((c) => c.id === id_)?.body ?? chapter.body
    // An open chapter loads the version as one step: Ctrl+Z undoes it. The toast has an Undo too.
    useBook.getState().restoreChapter(id_, text)
    toast(t.history.restored(chapter.title, when(t, items?.find((i) => i.id === id)?.at ?? '')), {
      action: {
        label: t.common.undo,
        run: () => {
          getChapterEditor(id_)?.flush()
          // Only while the chapter is as the restore left it.
          if (useBook.getState().chapters.find((c) => c.id === id_)?.body === text) useBook.getState().restoreChapter(id_, before)
        }
      }
    })
    onClose()
  }
  // Off only when there is nothing to restore: no versions, or the selected version cannot be read.
  const cannotRestore = (items !== null && items.length === 0) || (loaded !== null && loaded.id === selected && loaded.text === null)
  const spinner = loaded === null || (waiting && slow)

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
          <Button variant="primary" icon={<ClockCounterClockwise size={14} />} disabled={cannotRestore} onClick={() => void restore()}>
            {t.history.restore}
          </Button>
        </>
      }
    >
      {items === null ? (
        // As high as the versions and the compare view, so the dialog keeps its size when they show.
        <div className="history-empty is-reading">
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
          <div className="history-preview" aria-busy={waiting}>
            {/* The line keeps its height without numbers, so the compare view does not move. */}
            <div className={clsx('history-stats', (!stats || spinner) && 'is-empty')} aria-hidden={!stats || spinner}>
              {stats ? (
                <>
                  {t.history.ifRestore} <span className="plus">+{t.common.number(stats.added)}</span> <span className="minus">−{t.common.number(stats.removed)}</span> {t.history.words}
                </>
              ) : (
                '\u00a0'
              )}
            </div>
            <div className="history-text prose" ref={textRef}>
              {spinner ? (
                <Spinner />
              ) : loaded?.text == null ? (
                <span className="history-unreadable">{t.history.unreadable}</span>
              ) : ops ? (
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

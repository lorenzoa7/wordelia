import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CheckCircle, ClockCounterClockwise, CloudArrowUp, WarningCircle } from '@phosphor-icons/react'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { useApp } from '@/stores/app'
import { wordsToday } from './today'
import { saver, type SaveState } from '@/stores/saver'
import { useStats } from '@/features/editor/stats'
import { getT, useT } from '@/lib/i18n'
import { Tooltip } from '@/ui'

export function StatusBar(): React.JSX.Element {
  const t = useT()
  const s = t.write.status
  const { root: countedFor, chapterWords, bookWords, selectionWords } = useStats()
  const [save, setSave] = useState<SaveState>('saved')
  useEffect(() => saver.subscribe(setSave), [])
  const root = useBook((st) => st.root)
  const bookId = useBook((st) => st.manifest?.id ?? '')
  const goal = useApp((st) => st.settings?.editor.dailyGoal ?? 0)
  // The counts of this book only: right after a book opens, they can still be the counts of the last book.
  const counted = countedFor !== null && countedFor === root
  const written = counted && bookId ? wordsToday(bookId, bookWords) : 0
  const progress = goal ? Math.min(1, written / goal) : 0
  const minutes = Math.max(1, Math.round(chapterWords / 230))
  const barRef = useRef<HTMLElement>(null)

  // One line: when the counts do not fit, the parts that matter less hide, one level at a time
  // (book.css). The bar measures again after each render and when its width changes.
  const fit = (): void => {
    const bar = barRef.current
    const left = bar?.querySelector<HTMLElement>('.status-left')
    if (!bar || !left) return
    for (let level = 0; level <= 4; level++) {
      bar.dataset.tight = String(level)
      if (left.scrollWidth <= left.clientWidth + 1) break
    }
  }
  useLayoutEffect(fit)
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  // A failed save: a message in plain words, once, with "Try again". The saver tries again by itself.
  useEffect(() => {
    let told = false
    return saver.subscribe((state) => {
      if (state === 'saved') told = false
      if (state !== 'error' || told) return
      told = true
      const tt = getT()
      toast(tt.write.notSavedToast(tt.write.saveProblems[saver.problem]), { kind: 'error', ms: 20000, action: { label: tt.common.retry, run: () => saver.retry() } })
    })
  }, [])

  return (
    <footer ref={barRef} className="status-bar">
      <span className="status-left">
        {selectionWords > 0 ? (
          <span className="status-part">
            <b>{t.common.number(selectionWords)}</b> {s.selected}
          </span>
        ) : null}
        <span className="status-part">
          <b>{t.common.number(counted ? chapterWords : 0)}</b> {s.wordsInChapter}
        </span>
        <span className="status-part">{s.inBook(t.common.number(counted ? bookWords : 0))}</span>
        {counted && chapterWords > 0 && <span className="status-part status-read">{s.minRead(minutes)}</span>}
      </span>
      <span className="status-right">
        {goal > 0 && (
          <Tooltip label={s.dailyGoal(goal)} side="top">
            <span className={`today${progress >= 1 ? ' is-done' : ''}`}>
              <span className="today-bar">
                <span style={{ width: `${progress * 100}%` }} />
              </span>
              <span className="today-text">
                {progress >= 1 ? <span className="today-done">{s.goalReached} · </span> : null}
                {s.today(t.common.number(written))}
              </span>
            </span>
          </Tooltip>
        )}
        <Tooltip label={s.versionHistory} side="top">
          <button className="status-btn" aria-label={s.versionHistory} onClick={() => useUi.getState().openHistory(useBook.getState().activeChapterId)}>
            <ClockCounterClockwise size={12} /> <span className="status-btn-text">{s.history}</span>
          </button>
        </Tooltip>
        {save === 'error' ? (
          <Tooltip label={`${t.write.saveProblems[saver.problem]} ${t.write.clickToRetry}`} side="top">
            <button className="save-state is-error" role="status" aria-live="polite" onClick={() => saver.retry()}>
              <WarningCircle size={12} /> {s.notSaved}
            </button>
          </Tooltip>
        ) : (
          <span className={`save-state is-${save}`} role="status" aria-live="polite">
            {save === 'saved' ? <CheckCircle size={12} /> : <CloudArrowUp size={12} />} {save === 'saved' ? s.saved : s.saving}
          </span>
        )}
      </span>
    </footer>
  )
}

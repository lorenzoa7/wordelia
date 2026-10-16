import { useEffect, useState } from 'react'
import { CheckCircle, ClockCounterClockwise, CloudArrowUp, WarningCircle } from '@phosphor-icons/react'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { useApp } from '@/stores/app'
import { wordsToday } from './today'
import { formatCount } from '@shared/book'
import { saver, type SaveState } from '@/stores/saver'
import { useStats } from '@/features/editor/stats'
import { useT } from '@/lib/i18n'

export function StatusBar(): React.JSX.Element {
  const t = useT()
  const s = t.write.status
  const { chapterWords, bookWords, selectionWords } = useStats()
  const [save, setSave] = useState<SaveState>('saved')
  useEffect(() => saver.subscribe(setSave), [])
  const minutes = Math.max(1, Math.round(chapterWords / 230))
  const bookId = useBook((st) => st.manifest?.id ?? '')
  const goal = useApp((st) => st.settings?.editor.dailyGoal ?? 0)
  const written = bookId && bookWords ? wordsToday(bookId, bookWords) : 0
  const progress = goal ? Math.min(1, written / goal) : 0

  return (
    <footer className="status-bar">
      <span className="status-left">
        {selectionWords > 0 ? (
          <>
            <b>{t.common.number(selectionWords)}</b> {s.selected} ·{' '}
          </>
        ) : null}
        <b>{t.common.number(chapterWords)}</b> {s.wordsInChapter} · {s.inBook(formatCount(bookWords))} · {s.minRead(minutes)}
      </span>
      <span className="status-right">
      {goal > 0 && (
        <span className={`today${progress >= 1 ? ' is-done' : ''}`} title={s.dailyGoal(goal)}>
          <span className="today-bar">
            <span style={{ width: `${progress * 100}%` }} />
          </span>
          {progress >= 1 ? `${s.goalReached} · ` : ''}{s.today(t.common.number(written))}
        </span>
      )}
      <button className="status-btn" onClick={() => useUi.getState().openHistory(useBook.getState().activeChapterId)} title={s.versionHistory}>
        <ClockCounterClockwise size={12} /> {s.history}
      </button>
      <span className={`save-state is-${save}`} title={save === 'error' ? saver.error : undefined} role="status" aria-live="polite">
        {save === 'saved' && (
          <>
            <CheckCircle size={12} /> {s.saved}
          </>
        )}
        {save === 'saving' && (
          <>
            <CloudArrowUp size={12} /> {s.saving}
          </>
        )}
        {save === 'error' && (
          <>
            <WarningCircle size={12} /> {s.notSaved}
          </>
        )}
      </span>
      </span>
    </footer>
  )
}

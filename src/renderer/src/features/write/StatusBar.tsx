import { useEffect, useState } from 'react'
import { CheckCircle, ClockCounterClockwise, CloudArrowUp, WarningCircle } from '@phosphor-icons/react'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { useApp } from '@/stores/app'
import { wordsToday } from './today'
import { formatCount } from '@shared/book'
import { saver, type SaveState } from '@/stores/saver'
import { useStats } from '@/features/editor/stats'

export function StatusBar(): React.JSX.Element {
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
      <span>
        {selectionWords > 0 ? (
          <>
            <b>{selectionWords.toLocaleString('en-US')}</b> selected ·{' '}
          </>
        ) : null}
        <b>{chapterWords.toLocaleString('en-US')}</b> words in chapter · {formatCount(bookWords)} in book · {minutes} min read
      </span>
      <span className="status-right">
      {goal > 0 && (
        <span className={`today${progress >= 1 ? ' is-done' : ''}`} title={`Daily goal: ${goal} words`}>
          <span className="today-bar">
            <span style={{ width: `${progress * 100}%` }} />
          </span>
          {progress >= 1 ? 'Goal reached · ' : ''}+{written.toLocaleString('en-US')} today
        </span>
      )}
      <button className="status-btn" onClick={() => useUi.getState().openHistory(useBook.getState().activeChapterId)} title="Version history">
        <ClockCounterClockwise size={12} /> History
      </button>
      <span className={`save-state is-${save}`} title={save === 'error' ? saver.error : undefined}>
        {save === 'saved' && (
          <>
            <CheckCircle size={12} /> Saved
          </>
        )}
        {save === 'saving' && (
          <>
            <CloudArrowUp size={12} /> Saving…
          </>
        )}
        {save === 'error' && (
          <>
            <WarningCircle size={12} /> Not saved
          </>
        )}
      </span>
      </span>
    </footer>
  )
}

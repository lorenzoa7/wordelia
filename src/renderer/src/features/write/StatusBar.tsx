import { useEffect, useState } from 'react'
import { CheckCircle, CloudArrowUp, WarningCircle } from '@phosphor-icons/react'
import { formatCount } from '@shared/book'
import { saver, type SaveState } from '@/stores/saver'
import { useStats } from '@/features/editor/stats'

export function StatusBar(): React.JSX.Element {
  const { chapterWords, bookWords, selectionWords } = useStats()
  const [save, setSave] = useState<SaveState>('saved')
  useEffect(() => saver.subscribe(setSave), [])
  const minutes = Math.max(1, Math.round(chapterWords / 230))

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
    </footer>
  )
}

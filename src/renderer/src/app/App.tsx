import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { TooltipProvider } from '@/ui'
import { PromptHost } from '@/ui/prompt'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { invoke, isE2E, on } from '@/lib/api'
import { runFlushers } from '@/lib/flush'
import { saver } from '@/stores/saver'
import { LibraryView } from '@/features/library/LibraryView'
import { BookView } from '@/features/book/BookView'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { Welcome } from '@/features/onboarding/Welcome'
import { getActiveEditor } from '@/features/editor/registry'
import { runAction } from '@/features/actions/runAction'
import { TitleBar } from './TitleBar'
import { Toasts } from './Toasts'
import { useGlobalShortcuts } from './shortcuts'
import './app.css'

export function App(): React.JSX.Element {
  const ready = useApp((s) => s.settings !== null)
  const root = useBook((s) => s.root)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    void useApp
      .getState()
      .init()
      .then(async () => {
        setBooting(false)
        await useApp.getState().checkAllProviders()
        await useApp.getState().autoRoute()
      })
    if (isE2E()) {
      // Hooks for end-to-end tests and screenshots.
      ;(window as unknown as Record<string, unknown>).__wordelia = {
        openBook: async (path: string) => useBook.getState().open(await invoke('book:open', path)),
        book: useBook,
        app: useApp,
        editor: () => getActiveEditor()?.editor,
        runAction: (id: string) => {
          const a = useApp.getState().settings?.actions.find((x) => x.id === id)
          return a ? runAction(a) : Promise.resolve()
        }
      }
    }
  }, [])

  useGlobalShortcuts()

  // Save everything before the window closes.
  useEffect(
    () =>
      on('app:flushRequest', () => {
        runFlushers()
        void saver.flush().finally(() => void invoke('app:flushDone'))
      }),
    []
  )

  return (
    <TooltipProvider>
      <div className="app">
        <TitleBar />
        <main className="app-main">
          {ready && !booting && (
            <AnimatePresence mode="wait" initial={false}>
              {root ? (
                <motion.div
                  key={`book-${root}`}
                  className="app-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <BookView />
                </motion.div>
              ) : (
                <motion.div
                  key="library"
                  className="app-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <LibraryView />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>
        {ready && !booting && <Welcome />}
        {ready && <SettingsDialog />}
        <PromptHost />
        <Toasts />
      </div>
    </TooltipProvider>
  )
}

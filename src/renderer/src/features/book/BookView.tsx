import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { PageEditor } from '@/features/editor/PageEditor'
import { ChapterSidebar } from '@/features/write/ChapterSidebar'
import { StatusBar } from '@/features/write/StatusBar'
import { ChatPanel } from '@/features/chat/ChatPanel'
import { PlanView } from '@/features/plan/PlanView'
import { PlanSidebar } from '@/features/plan/PlanSidebar'
import { ExportDialog } from '@/features/export/ExportDialog'
import { runAction } from '@/features/actions/runAction'
import { HistoryDialog } from '@/features/history/HistoryDialog'
import { startAutoSnapshots } from '@/features/history/snapshots'
import './book.css'

const SIDEBAR_W = 256
const CHAT_W = 400

export function BookView(): React.JSX.Element {
  const view = useBook((s) => s.view)
  const sidebarOpen = useApp((s) => s.settings?.ui.sidebarOpen ?? true)
  const chatOpen = useApp((s) => s.settings?.ui.chatOpen ?? true)
  const exportOpen = useUi((s) => s.exportOpen)
  const setExportOpen = useUi((s) => s.setExportOpen)
  const historyChapterId = useUi((s) => s.historyChapterId)

  useEffect(() => startAutoSnapshots(), [])

  // Action shortcuts: Ctrl+J for the default action, Alt+1…9 for the others.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (useBook.getState().view !== 'write') return
      const s = useApp.getState().settings
      if (!s) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        const a = s.actions.find((x) => x.id === s.defaultActionId) ?? s.actions[0]
        if (a) void runAction(a)
      } else if (e.altKey && /^[1-9]$/.test(e.key)) {
        const a = s.actions[Number(e.key) - 1]
        if (a) {
          e.preventDefault()
          void runAction(a)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="book">
      <motion.div
        className="book-sidebar"
        initial={false}
        animate={{ width: sidebarOpen ? SIDEBAR_W : 0, opacity: sidebarOpen ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 40 }}
      >
        <div className="book-sidebar-inner" style={{ width: SIDEBAR_W }}>
          {view === 'write' ? <ChapterSidebar /> : <PlanSidebar />}
        </div>
      </motion.div>

      <div className="book-main">
        <AnimatePresence mode="wait" initial={false}>
          {view === 'write' ? (
            <motion.div key="write" className="book-pane" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <PageEditor />
              <StatusBar />
            </motion.div>
          ) : (
            <motion.div key="plan" className="book-pane" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <PlanView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className="book-chat"
        initial={false}
        animate={{ width: chatOpen ? CHAT_W : 0, opacity: chatOpen ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 40 }}
      >
        <div className="book-chat-inner" style={{ width: CHAT_W }}>
          <ChatPanel />
        </div>
      </motion.div>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <HistoryDialog chapterId={historyChapterId} onClose={() => useUi.getState().openHistory(null)} />
    </div>
  )
}

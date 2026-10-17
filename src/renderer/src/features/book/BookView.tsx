import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { useT } from '@/lib/i18n'
import { PageEditor } from '@/features/editor/PageEditor'
import { ChapterSidebar } from '@/features/write/ChapterSidebar'
import { StatusBar } from '@/features/write/StatusBar'
import { ChatPanel } from '@/features/chat/ChatPanel'
import { PlanView } from '@/features/plan/PlanView'
import { PlanSidebar } from '@/features/plan/PlanSidebar'
import { ExportDialog } from '@/features/export/ExportDialog'
import { useActionShortcuts } from '@/features/actions/useActionShortcuts'
import { HistoryDialog } from '@/features/history/HistoryDialog'
import { startAutoSnapshots } from '@/features/history/snapshots'
import './book.css'

const SIDEBAR_W = 256
const CHAT_MIN = 320
const CHAT_MAX = 680

export function BookView(): React.JSX.Element {
  const t = useT()
  const view = useBook((s) => s.view)
  const sidebarOpen = useApp((s) => s.settings?.ui.sidebarOpen ?? true)
  const chatOpen = useApp((s) => s.settings?.ui.chatOpen ?? true)
  const savedWidth = useApp((s) => s.settings?.ui.chatWidth ?? 400)
  const [chatW, setChatW] = useState(savedWidth)
  const [resizing, setResizing] = useState(false)
  useEffect(() => setChatW(savedWidth), [savedWidth])

  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = chatW
    let w = startW
    setResizing(true)
    const move = (ev: PointerEvent): void => {
      w = Math.min(CHAT_MAX, Math.max(CHAT_MIN, startW + (startX - ev.clientX)))
      setChatW(w)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setResizing(false)
      useApp.getState().setUi({ chatWidth: Math.round(w) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const exportOpen = useUi((s) => s.exportOpen)
  const setExportOpen = useUi((s) => s.setExportOpen)
  const historyChapterId = useUi((s) => s.historyChapterId)

  useEffect(() => startAutoSnapshots(), [])

  useActionShortcuts()

  return (
    <div className="book">
      <motion.div
        className="book-sidebar"
        initial={false}
        animate={{ width: sidebarOpen ? SIDEBAR_W : 0, opacity: sidebarOpen ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 40 }}
      >
        <div className="book-sidebar-inner" style={{ width: SIDEBAR_W }} inert={!sidebarOpen}>
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
        className={`book-chat${resizing ? ' is-resizing' : ''}`}
        initial={false}
        animate={{ width: chatOpen ? chatW : 0, opacity: chatOpen ? 1 : 0 }}
        transition={resizing ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 40 }}
      >
        {chatOpen && (
          <div
            className="chat-resizer"
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={t.app.chatWidth}
            aria-valuemin={CHAT_MIN}
            aria-valuemax={CHAT_MAX}
            aria-valuenow={Math.round(chatW)}
            onPointerDown={startResize}
            onDoubleClick={() => useApp.getState().setUi({ chatWidth: 400 })}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 60 : 20
              const next = e.key === 'ArrowLeft' ? chatW + step : e.key === 'ArrowRight' ? chatW - step : null
              if (next == null) return
              e.preventDefault()
              const w = Math.min(CHAT_MAX, Math.max(CHAT_MIN, next))
              setChatW(w)
              useApp.getState().setUi({ chatWidth: w })
            }}
          />
        )}
        <div className="book-chat-inner" style={{ width: chatW }} inert={!chatOpen}>
          <ChatPanel />
        </div>
      </motion.div>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <HistoryDialog chapterId={historyChapterId} onClose={() => useUi.getState().openHistory(null)} />
    </div>
  )
}

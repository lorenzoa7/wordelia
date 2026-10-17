import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
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
import { SidePanel } from './SidePanel'
import { ShowSidebarButton } from './SidebarToggle'
import './book.css'

const SIDEBAR = { min: 200, max: 420, default: 256 }
const CHAT = { min: 320, max: 680, default: 400 }
/** The page keeps at least this width. In a narrow window the chat gives up width first, then the sidebar. */
const MAIN_MIN = 560

const clampTo = (r: { min: number; max: number }, v: number): number => Math.min(r.max, Math.max(r.min, v))

function useWindowWidth(): number {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const on = (): void => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

export function BookView(): React.JSX.Element {
  const t = useT()
  const view = useBook((s) => s.view)
  const sidebarOpen = useApp((s) => s.settings?.ui.sidebarOpen ?? true)
  const sidebarWidth = useApp((s) => s.settings?.ui.sidebarWidth ?? SIDEBAR.default)
  const chatOpen = useApp((s) => s.settings?.ui.chatOpen ?? true)
  const chatWidth = useApp((s) => s.settings?.ui.chatWidth ?? CHAT.default)
  const setUi = useApp((s) => s.setUi)
  const vw = useWindowWidth()
  const sideNow = sidebarOpen ? clampTo(SIDEBAR, sidebarWidth) : 0
  const chatFit = vw - MAIN_MIN - sideNow
  const chatNow = chatOpen ? Math.max(CHAT.min, Math.min(clampTo(CHAT, chatWidth), chatFit)) : 0
  const sidebarFit = vw - MAIN_MIN - chatNow
  const exportOpen = useUi((s) => s.exportOpen)
  const setExportOpen = useUi((s) => s.setExportOpen)
  const historyChapterId = useUi((s) => s.historyChapterId)

  useEffect(() => startAutoSnapshots(), [])

  useActionShortcuts()

  return (
    <div className="book">
      <SidePanel
        side="left"
        className="book-sidebar"
        edgeClassName="sidebar-resizer"
        open={sidebarOpen}
        width={sidebarWidth}
        min={SIDEBAR.min}
        max={SIDEBAR.max}
        defaultWidth={SIDEBAR.default}
        fit={sidebarFit}
        label={t.app.sidebarWidth}
        onChange={(p) => setUi({ ...(p.open !== undefined && { sidebarOpen: p.open }), ...(p.width !== undefined && { sidebarWidth: p.width }) })}
      >
        {view === 'write' ? <ChapterSidebar /> : <PlanSidebar />}
      </SidePanel>

      <div className={clsx('book-main', !sidebarOpen && 'is-sidebar-closed')}>
        <ShowSidebarButton open={sidebarOpen} />
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

      <SidePanel
        side="right"
        className="book-chat"
        edgeClassName="chat-resizer"
        open={chatOpen}
        width={chatWidth}
        min={CHAT.min}
        max={CHAT.max}
        defaultWidth={CHAT.default}
        fit={chatFit}
        label={t.app.chatWidth}
        onChange={(p) => setUi({ ...(p.open !== undefined && { chatOpen: p.open }), ...(p.width !== undefined && { chatWidth: p.width }) })}
      >
        <ChatPanel />
      </SidePanel>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <HistoryDialog chapterId={historyChapterId} onClose={() => useUi.getState().openHistory(null)} />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { useT } from '@/lib/i18n'
import { useUndoGuard } from '@/lib/undoKeys'
import { PageEditor } from '@/features/editor/PageEditor'
import { ChapterSidebar } from '@/features/write/ChapterSidebar'
import { StatusBar } from '@/features/write/StatusBar'
import { ChatPanel } from '@/features/chat/ChatPanel'
import { PlanView } from '@/features/plan/PlanView'
import { PlanSidebar } from '@/features/plan/PlanSidebar'
import { ExportDialog } from '@/features/export/ExportDialog'
import { useActionShortcuts } from '@/features/actions/useActionShortcuts'
import { useInlineProposalSync } from '@/features/editor/inlineProposals'
import { useReadSync } from '@/features/read/useReadSync'
import { RevisionList } from '@/features/read/RevisionList'
import { HistoryDialog } from '@/features/history/HistoryDialog'
import { startAutoSnapshots } from '@/features/history/snapshots'
import { SidePanel } from './SidePanel'
import { ShowSidebarButton } from './SidebarToggle'
import { CHAT, SIDEBAR, panelLayout } from './panels'
import './book.css'

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
  const { chatFit, sidebarFit } = panelLayout(vw, { sidebarOpen, sidebarWidth, chatOpen, chatWidth })
  const exportOpen = useUi((s) => s.exportOpen)
  const setExportOpen = useUi((s) => s.setExportOpen)
  const historyChapterId = useUi((s) => s.historyChapterId)
  // The revision list of the editor's reads covers the desk of the Write view.
  const revision = useUi((s) => s.revisionOpen) && view === 'write'
  const writeAway = view !== 'write' || revision

  useEffect(() => startAutoSnapshots(), [])

  // Spell check (Settings → General) for every text of the book: the chapters, the notes and the
  // chat. Their texts have no attribute of their own, so they take the one of the page, at once.
  const spellcheck = useApp((s) => s.settings?.editor.spellcheck ?? true)
  useEffect(() => {
    const html = document.documentElement
    if (spellcheck) html.removeAttribute('spellcheck')
    else html.setAttribute('spellcheck', 'false')
  }, [spellcheck])

  useActionShortcuts()
  // Chat proposals in the text of chapters (Write) and notes (Plan)
  useInlineProposalSync()
  // The comments of the editor's reads, from the replies in the chat
  useReadSync()
  // Outside a text, Ctrl+Z never runs the Undo of the browser: it would change a text that does not show.
  useUndoGuard()

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
        {/* The Write view stays mounted under the Plan view and under the revision list: back in Write,
            the scroll, the cursor and the undo history are as they were. Meanwhile it is hidden and inert. */}
        <div className={clsx('book-pane book-pane-write', writeAway && 'is-away')} inert={writeAway}>
          <PageEditor />
          <StatusBar />
        </div>
        {revision && (
          <div className="book-pane book-pane-revision">
            <RevisionList />
          </div>
        )}
        <AnimatePresence initial={false}>
          {view === 'plan' && (
            <motion.div key="plan" className="book-pane book-pane-plan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
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

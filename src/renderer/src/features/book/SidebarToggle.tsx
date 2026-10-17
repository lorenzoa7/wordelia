import { AnimatePresence, motion } from 'motion/react'
import { SidebarSimple } from '@phosphor-icons/react'
import { IconButton } from '@/ui'
import { useApp } from '@/stores/app'
import { useT } from '@/lib/i18n'

const toggle = (): void => {
  const app = useApp.getState()
  app.setUi({ sidebarOpen: !app.settings?.ui.sidebarOpen })
}

/** The button in the sidebar header that hides the sidebar (Ctrl+\). */
export function HideSidebarButton(): React.JSX.Element {
  const t = useT()
  return (
    <IconButton label={t.app.hideSidebar} shortcut="Ctrl+\" onClick={toggle} className="sidebar-toggle">
      <SidebarSimple size={16} />
    </IconButton>
  )
}

/**
 * When the sidebar is hidden, a small button floats at the top-left corner of the page area
 * (Write and Plan views) and shows it again. The edge of the window and Ctrl+\ also show it.
 */
export function ShowSidebarButton({ open }: { open: boolean }): React.JSX.Element {
  const t = useT()
  return (
    <AnimatePresence>
      {!open && (
        <motion.div
          className="sidebar-show"
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -6, transition: { duration: 0.1 } }}
          transition={{ duration: 0.2, delay: 0.12 }}
        >
          <IconButton label={t.app.showSidebar} shortcut="Ctrl+\" side="right" onClick={toggle} className="sidebar-toggle">
            <SidebarSimple size={16} />
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

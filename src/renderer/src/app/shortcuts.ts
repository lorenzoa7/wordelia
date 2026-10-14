import { useEffect } from 'react'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'

/** App-wide keyboard shortcuts. Editor shortcuts live in the editor extensions. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      const app = useApp.getState()
      const book = useBook.getState()
      const ui = useUi.getState()
      if (key === ',') {
        e.preventDefault()
        ui.openSettings()
      } else if (key === '\\' && !e.shiftKey) {
        e.preventDefault()
        app.setUi({ sidebarOpen: !app.settings?.ui.sidebarOpen })
      } else if (key === 'l' && e.shiftKey === false && book.root) {
        e.preventDefault()
        app.setUi({ chatOpen: !app.settings?.ui.chatOpen })
        if (!app.settings?.ui.chatOpen) setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer-input')?.focus(), 250)
      } else if (key === '1' && book.root) {
        e.preventDefault()
        book.setView('write')
      } else if (key === '2' && book.root) {
        e.preventDefault()
        book.setView('plan')
      } else if (key === 'e' && e.shiftKey && book.root) {
        e.preventDefault()
        ui.setExportOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

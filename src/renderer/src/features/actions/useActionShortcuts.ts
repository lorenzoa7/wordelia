// Keyboard shortcuts of the actions. Each action has its own shortcut (`AiAction.shortcut`), set in
// Settings → Actions. The defaults are Ctrl+J for the main action and Alt+2, Alt+3… for the others.

import { useEffect } from 'react'
import { actionForKeys } from '@shared/ai/shortcuts'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { runAction } from './runAction'

export function useActionShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || useBook.getState().view !== 'write') return
      // The settings record shortcuts: do not run an action behind the dialog.
      if (useUi.getState().settingsOpen) return
      const s = useApp.getState().settings
      if (!s) return
      const a = actionForKeys(
        {
          key: e.key,
          code: e.code,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          altGraph: e.getModifierState?.('AltGraph')
        },
        s.actions
      )
      if (!a) return
      e.preventDefault()
      void runAction(a)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

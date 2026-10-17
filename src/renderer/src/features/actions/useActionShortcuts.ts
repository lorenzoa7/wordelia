// Keyboard shortcuts of the actions: Ctrl+J for the main action, Alt+1…9 for the others.

import { useEffect } from 'react'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { runAction } from './runAction'

export function useActionShortcuts(): void {
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
}

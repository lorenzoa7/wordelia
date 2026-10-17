import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { X } from '@phosphor-icons/react'
import type { AiAction } from '@shared/types'
import { heldModifiers, isModifierKey, isUsableShortcut, shortcutConflict, shortcutFromKeys, type KeyPress } from '@shared/ai/shortcuts'
import { IconButton } from '@/ui'
import { actionName, useT } from '@/lib/i18n'

function keyPress(e: KeyboardEvent): KeyPress {
  return {
    key: e.key,
    code: e.code,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey,
    altGraph: e.getModifierState?.('AltGraph')
  }
}

/**
 * Records the shortcut of an action: click, then press the keys. Esc cancels.
 * A shortcut that the app or another action uses is refused, with the reason.
 */
export function ShortcutField({ action, actions, onChange }: { action: AiAction; actions: AiAction[]; onChange: (shortcut: string | undefined) => void }): React.JSX.Element {
  const t = useT()
  const ta = t.settings.actions
  const [recording, setRecording] = useState(false)
  const [held, setHeld] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stop = (): void => {
    setRecording(false)
    setHeld('')
    setError(null)
  }

  // Another action: stop.
  useEffect(stop, [action.id])

  useEffect(() => {
    if (!recording) return
    // Listen before everything else (capture on window): Esc must not close the dialog,
    // and the keys must not run app shortcuts or actions.
    const onDown = (e: KeyboardEvent): void => {
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
        stop()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return stop()
      const press = keyPress(e)
      if (isModifierKey(e.key)) return setHeld(heldModifiers(press))
      const shortcut = shortcutFromKeys(press)
      setHeld('')
      if (!shortcut || !isUsableShortcut(shortcut)) return setError(ta.shortcutNeedsModifier)
      const conflict = shortcutConflict(shortcut, actions, action.id)
      if (conflict) {
        setError(ta.shortcutTaken(shortcut, conflict.kind === 'app' ? ta.reservedKeys[conflict.use] : `“${actionName(t, conflict.action)}”`))
        return
      }
      stop()
      onChange(shortcut)
    }
    const onUp = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (isModifierKey(e.key)) setHeld(heldModifiers(keyPress(e)))
    }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
    }
  })

  const current = action.shortcut
  return (
    <div className="shortcut-field">
      <div className={clsx('shortcut-row-ctl', recording && 'is-recording', error && 'has-error')}>
        <button
          className="shortcut-box"
          aria-label={`${ta.shortcut}: ${recording ? ta.pressKeys : (current ?? ta.noShortcut)}`}
          title={ta.recordShortcut}
          onClick={() => {
            if (recording) return stop()
            setError(null)
            setRecording(true)
          }}
          onBlur={stop}
        >
          {recording ? (
            held ? (
              <kbd className="kbd">{held}…</kbd>
            ) : (
              <span className="shortcut-wait">{ta.pressKeys}</span>
            )
          ) : current ? (
            <kbd className="kbd">{current}</kbd>
          ) : (
            <span className="shortcut-none">{ta.noShortcut}</span>
          )}
        </button>
        {current && !recording && (
          <IconButton label={ta.clearShortcut} onClick={() => onChange(undefined)} className="shortcut-clear">
            <X size={13} />
          </IconButton>
        )}
      </div>
      {error && (
        <p className="shortcut-error" role="alert">
          {error}
        </p>
      )}
      {recording && <p className="shortcut-hint">{ta.escCancels}</p>}
    </div>
  )
}

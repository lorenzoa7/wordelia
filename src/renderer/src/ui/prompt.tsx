// In-app replacements for window.prompt and window.confirm (Electron has no window.prompt).

import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useT } from '@/lib/i18n'
import { Button, Dialog, Field, TextInput } from './index'

type Request =
  | { kind: 'text'; title: string; label: string; placeholder?: string; initial?: string; confirm?: string; optional?: boolean; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; confirm?: string; cancel?: string; danger?: boolean; resolve: (v: boolean) => void }

const usePrompt = create<{ req: Request | null }>(() => ({ req: null }))

/**
 * Ask for a short text. Null: the user cancelled. `optional`: the user can confirm without a text (the
 * answer is then '').
 */
export function askText(opts: { title: string; label: string; placeholder?: string; initial?: string; confirm?: string; optional?: boolean }): Promise<string | null> {
  return new Promise((resolve) => usePrompt.setState({ req: { kind: 'text', ...opts, resolve } }))
}

/** A yes or no question. `cancel` is the label of the no button (default: Cancel). */
export function askConfirm(opts: { title: string; message: string; confirm?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => usePrompt.setState({ req: { kind: 'confirm', ...opts, resolve } }))
}

export function PromptHost(): React.JSX.Element {
  const t = useT()
  const req = usePrompt((s) => s.req)
  const [value, setValue] = useState('')
  useEffect(() => {
    if (req?.kind === 'text') setValue(req.initial ?? '')
  }, [req])

  const close = (result: string | boolean | null): void => {
    if (!req) return
    if (req.kind === 'text') req.resolve(typeof result === 'string' ? result : null)
    else req.resolve(result === true)
    usePrompt.setState({ req: null })
  }

  return (
    <Dialog
      open={req !== null}
      onOpenChange={(v) => !v && close(req?.kind === 'confirm' ? false : null)}
      title={req?.title ?? ''}
      description={req?.kind === 'confirm' ? req.message : undefined}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(req?.kind === 'confirm' ? false : null)}>
            {(req?.kind === 'confirm' && req.cancel) || t.common.cancel}
          </Button>
          <Button
            variant={req?.kind === 'confirm' && req.danger ? 'ribbon' : 'primary'}
            onClick={() => close(req?.kind === 'text' ? (value.trim() || (req.optional ? '' : null)) : true)}
            disabled={req?.kind === 'text' && !req.optional && !value.trim()}
          >
            {req?.confirm ?? (req?.kind === 'confirm' ? t.common.confirm : t.common.ok)}
          </Button>
        </>
      }
    >
      {req?.kind === 'text' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim() || req.optional) close(value.trim())
          }}
        >
          <Field label={req.label}>
            <TextInput autoFocus value={value} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)} />
          </Field>
        </form>
      )}
    </Dialog>
  )
}

// The question before a rewind: what leaves the thread, and which book changes can be undone.

import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { BookOpenText, FilePlus, Notebook, UserCircle } from '@phosphor-icons/react'
import { Button, Dialog } from '@/ui'
import { useT } from '@/lib/i18n'
import type { BookChanges } from './rewind'

export type RewindMode = 'rewind' | 'edit' | 'retry'

interface Ask {
  mode: RewindMode
  /** Messages that leave the thread after the point of the rewind */
  after: number
  changes: BookChanges
  resolve: (v: { undo: boolean } | null) => void
}

const useAsk = create<{ req: Ask | null }>(() => ({ req: null }))

/** Ask the user. Null: the user cancels. */
export function askRewind(opts: Omit<Ask, 'resolve'>): Promise<{ undo: boolean } | null> {
  return new Promise((resolve) => useAsk.setState({ req: { ...opts, resolve } }))
}

export function RewindHost(): React.JSX.Element {
  const t = useT()
  const req = useAsk((s) => s.req)
  const [undo, setUndo] = useState(true)
  useEffect(() => {
    if (req) setUndo(true)
  }, [req])

  const close = (v: { undo: boolean } | null): void => {
    req?.resolve(v)
    useAsk.setState({ req: null })
  }

  const mode = req?.mode ?? 'rewind'
  const items = req
    ? [
        ...req.changes.edits.map((f) => ({
          key: `e-${f.id}`,
          icon: f.kind === 'chapter' ? <BookOpenText size={13} /> : <Notebook size={13} />,
          label: f.label,
          detail: t.chat.changeCount(f.changes.length)
        })),
        ...req.changes.creates.map((c, i) => ({
          key: `c-${i}`,
          icon: <FilePlus size={13} />,
          label: c.label,
          detail: c.previous ? t.chat.noteComesBack : t.chat.noteToTrash
        })),
        ...req.changes.portraits.map((p, i) => ({
          key: `p-${i}`,
          icon: <UserCircle size={13} />,
          label: t.chat.portraitAlt(p.label),
          detail: p.previous ? t.chat.portraitComesBack : t.chat.portraitGoes
        }))
      ]
    : []
  const title = mode === 'edit' ? t.chat.editTitle : mode === 'retry' ? t.chat.retryTitle : t.chat.rewindTitle
  const message = mode === 'edit' ? t.chat.editMessageText(req?.after ?? 0) : mode === 'retry' ? t.chat.retryText : t.chat.rewindText(req?.after ?? 0)
  const confirm = mode === 'edit' ? t.chat.send : mode === 'retry' ? t.chat.retry : t.chat.rewindConfirm

  return (
    <Dialog
      open={req !== null}
      onOpenChange={(v) => !v && close(null)}
      title={title}
      description={message}
      width={470}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(null)}>
            {t.common.cancel}
          </Button>
          <Button variant={mode === 'rewind' ? 'ribbon' : 'primary'} onClick={() => close({ undo: items.length > 0 && undo })}>
            {confirm}
          </Button>
        </>
      }
    >
      {items.length > 0 && (
        <div className="rewind-changes">
          <p className="rewind-changes-title">{t.chat.rewindBookChanged}</p>
          <ul className="rewind-list">
            {items.map((i) => (
              <li key={i.key}>
                {i.icon}
                <span className="rewind-file">{i.label}</span>
                <span className="rewind-detail">{i.detail}</span>
              </li>
            ))}
          </ul>
          <label className="rewind-undo">
            <input type="checkbox" checked={undo} onChange={(e) => setUndo(e.target.checked)} />
            <span>
              <span className="rewind-undo-label">{t.chat.rewindUndo}</span>
              <span className="rewind-undo-hint">{undo ? t.chat.rewindUndoHint : t.chat.rewindKeepHint}</span>
            </span>
          </label>
        </div>
      )}
    </Dialog>
  )
}

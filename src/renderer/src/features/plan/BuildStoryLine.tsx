// Build the story line from a source: a planning note, a pasted text or the written chapters.
// The build goes through the chat: a new thread, a message, and the AI replies with a proposal.

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { isStoryLine } from '@shared/storyline'
import type { Entry } from '@shared/types'
import { Button, Dialog, Select } from '@/ui'
import { getT, useT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useChat } from '@/features/chat/chatStore'
import { newThread, sendMessage } from '@/features/chat/send'

export type StoryLineSource = { kind: 'entry'; entryId: string } | { kind: 'text'; text: string } | { kind: 'chapters' }

const PLOT = /^(plot|enredo|trama)$/i

/** The notes that can be a source: the plot notes first. */
function sourceEntries(entries: Entry[]): Entry[] {
  const notes = entries.filter((e) => !isStoryLine(e))
  return [...notes.filter((e) => PLOT.test(e.category)), ...notes.filter((e) => !PLOT.test(e.category))]
}

/** Ask the AI for the story line in a new chat thread. The draft of the composer stays. */
export async function askBuildStoryLine(source: StoryLineSource): Promise<void> {
  const t = getT()
  const book = useBook.getState()
  useApp.getState().setUi({ chatOpen: true })
  const chat = useChat.getState()
  const kept = { draft: chat.draft, draftDoc: chat.draftDoc, quotes: chat.quotes, mentions: chat.mentions, images: chat.images }
  chat.openBlank(newThread(t.plan.line.threadTitle))
  let text: string = t.plan.line.askFromChapters
  let mentions: typeof kept.mentions = []
  if (source.kind === 'entry') {
    const e = book.entries.find((x) => x.id === source.entryId)
    if (e) {
      text = t.plan.line.askFromEntry(e.name)
      mentions = [{ kind: 'entry', id: e.id, label: e.name }]
    }
  } else if (source.kind === 'text') {
    text = `${t.plan.line.askFromText}\n\n${source.text.trim()}`
  }
  useChat.setState({ quotes: [], mentions, images: [] })
  // sendMessage clears the composer before it waits for the reply: put the draft back then.
  const sent = sendMessage(text)
  useChat.setState((s) => ({ ...kept, draftRev: s.draftRev + 1 }))
  await sent
}

export function BuildStoryLineDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const t = useT()
  const entries = useBook((s) => s.entries)
  const notes = useMemo(() => sourceEntries(entries), [entries])
  const [kind, setKind] = useState<StoryLineSource['kind']>(notes.length ? 'entry' : 'chapters')
  const [entryId, setEntryId] = useState('')
  const [text, setText] = useState('')
  const chosen = entryId || notes[0]?.id || ''
  const ready = kind === 'chapters' || (kind === 'entry' && Boolean(chosen)) || (kind === 'text' && text.trim().length > 0)

  const build = (): void => {
    if (!ready) return
    onClose()
    void askBuildStoryLine(kind === 'entry' ? { kind, entryId: chosen } : kind === 'text' ? { kind, text } : { kind })
  }

  const option = (k: StoryLineSource['kind'], label: string, extra?: React.ReactNode): React.JSX.Element => (
    <label className={clsx('line-source', kind === k && 'is-on')}>
      <span className="line-source-head">
        <input type="radio" name="line-source" checked={kind === k} onChange={() => setKind(k)} />
        <span>{label}</span>
      </span>
      {kind === k && extra}
    </label>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={t.plan.line.buildTitle}
      description={t.plan.line.buildText}
      width={480}
      className="line-build"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={build} disabled={!ready}>
            {t.plan.line.build}
          </Button>
        </>
      }
    >
      <div className="line-sources" role="radiogroup">
        {notes.length > 0 &&
          option(
            'entry',
            t.plan.line.fromEntry,
            <Select value={chosen} onValueChange={setEntryId} options={notes.map((e) => ({ value: e.id, label: e.name }))} ariaLabel={t.plan.line.pickEntry} />
          )}
        {option('text', t.plan.line.fromText, <textarea className="input textarea line-paste" rows={6} value={text} placeholder={t.plan.line.pastePlaceholder} onChange={(e) => setText(e.target.value)} />)}
        {option('chapters', t.plan.line.fromChapters)}
      </div>
    </Dialog>
  )
}

import { memo, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { At, BookOpenText, ChatsCircle, Check, Copy, Notebook, Quotes, TextIndent, WarningCircle } from '@phosphor-icons/react'
import { parseProposals, proposalSummary, type Segment } from '@shared/proposals/parse'
import { toast } from '@/stores/ui'
import { getActiveEditor } from '@/features/editor/registry'
import { sliceFromMarkdown } from '@/features/editor/review'
import type { ChatMessage, Thread } from '@shared/types'
import { ProposalCard } from './ProposalCard'
import { acceptPending, pendingKeys, setHunkStates } from './applyProposal'
import { Spinner } from '@/ui'
import { typesetForBook } from '@/lib/typeset'
import { useT } from '@/lib/i18n'
import { mentionLabel } from './send'

const mdComponents = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {text}
    </ReactMarkdown>
  )
}

export const MessageView = memo(function MessageView({ message, thread }: { message: ChatMessage; thread: Thread }): React.JSX.Element {
  const t = useT()
  if (message.role === 'user') {
    return (
      <div className="msg msg-user">
        {message.quotes?.map((q) => (
          <blockquote key={q.id} className="msg-quote">
            <span className="msg-quote-src">
              <Quotes size={11} weight="fill" /> {q.source.label}
            </span>
            {q.text}
          </blockquote>
        ))}
        {message.mentions && message.mentions.length > 0 && (
          <div className="msg-mentions">
            {message.mentions.map((m) => (
              <span key={m.id} className="mention-chip">
                <MentionIcon kind={m.kind} /> {mentionLabel(t, m)}
              </span>
            ))}
          </div>
        )}
        {message.content && <div className="msg-user-text">{message.content}</div>}
      </div>
    )
  }
  return <AssistantMessage message={message} thread={thread} />
})

export function MentionIcon({ kind }: { kind: 'chapter' | 'entry' | 'thread' }): React.JSX.Element {
  if (kind === 'chapter') return <BookOpenText size={11} />
  if (kind === 'entry') return <Notebook size={11} />
  if (kind === 'thread') return <ChatsCircle size={11} />
  return <At size={11} />
}

function AssistantMessage({ message, thread }: { message: ChatMessage; thread: Thread }): React.JSX.Element {
  const segments = useMemo(() => parseProposals(message.content), [message.content])
  return (
    <div className="msg msg-ai">
      {segments.map((s, i) =>
        s.kind === 'text' ? (
          <div key={i} className="msg-ai-text prose">
            <Markdown text={s.text} />
          </div>
        ) : (
          <ProposalCard key={i} segment={s} message={message} thread={thread} />
        )
      )}
      {message.error && (
        <div className="msg-error">
          <WarningCircle size={14} /> {message.error}
        </div>
      )}
      <BulkBar segments={segments} message={message} thread={thread} />
      {message.content.trim() && <MessageActions text={proposalSummary(message.content).trim()} model={message.model} />}
    </div>
  )
}

/** One decision for all the proposals of a reply, for example after a planning sync. */
function BulkBar({ segments, message, thread }: { segments: Segment[]; message: ChatMessage; thread: Thread }): React.JSX.Element | null {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const pending = pendingKeys(segments, message.hunks)
  if (pending.length < 2) return null
  const acceptAll = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await acceptPending(segments, message.hunks)
      setHunkStates(thread, message.id, result)
      const states = Object.values(result)
      const ok = states.filter((s) => s === 'accepted').length
      const failed = states.length - ok
      const chapters = segments.some((s) => s.kind === 'edit' && s.file.replace(/\\/g, '/').startsWith('manuscript/'))
      toast(failed ? t.chat.bulkPartial(ok, states.length, failed) : t.chat.bulkApplied(ok, chapters), failed ? { kind: 'error' } : {})
    } finally {
      setBusy(false)
    }
  }
  const rejectAll = (): void => setHunkStates(thread, message.id, Object.fromEntries(pending.map((k) => [k, 'rejected'])))
  return (
    <div className="msg-bulk">
      <span className="msg-bulk-count">{t.chat.toReview(pending.length)}</span>
      <button className="proposal-btn" onClick={rejectAll} disabled={busy}>
        {t.common.rejectAll}
      </button>
      <button className="proposal-btn is-accept" onClick={() => void acceptAll()} disabled={busy}>
        {busy ? <Spinner size={11} /> : <Check size={12} weight="bold" />} {t.common.acceptAll}
      </button>
    </div>
  )
}

function MessageActions({ text, model }: { text: string; model?: string }): React.JSX.Element {
  const t = useT()
  const copy = (): void => {
    navigator.clipboard.writeText(text).then(
      () => toast(t.common.copied),
      () => toast(t.chat.copyFailed, { kind: 'error' })
    )
  }
  const insert = (): void => {
    const a = getActiveEditor()
    if (!a) {
      toast(t.chat.openChapterFirst)
      return
    }
    const { state } = a.editor
    const slice = sliceFromMarkdown(state.schema, typesetForBook(text))
    a.editor.view.dispatch(state.tr.replaceSelection(slice).scrollIntoView())
    a.editor.commands.focus()
  }
  return (
    <div className="msg-actions">
      <button onClick={copy} title={t.chat.copyReply}>
        <Copy size={13} /> {t.common.copy}
      </button>
      <button onClick={insert} title={t.chat.insertHint}>
        <TextIndent size={13} /> {t.chat.insert}
      </button>
      {model && <span className="msg-model">{model}</span>}
    </div>
  )
}

export function StreamingMessage({ text }: { text: string }): React.JSX.Element {
  const t = useT()
  const segments = useMemo(() => parseProposals(text), [text])
  return (
    <div className="msg msg-ai is-streaming">
      {segments.length === 0 && (
        <div className="msg-thinking" role="status" aria-label={t.chat.thinking}>
          <span />
          <span />
          <span />
        </div>
      )}
      {segments.map((s, i) =>
        s.kind === 'text' ? (
          <div key={i} className="msg-ai-text prose">
            <Markdown text={s.text} />
          </div>
        ) : (
          <ProposalCard key={i} segment={s} streaming />
        )
      )}
      {segments.length > 0 && <span className="stream-caret" />}
    </div>
  )
}

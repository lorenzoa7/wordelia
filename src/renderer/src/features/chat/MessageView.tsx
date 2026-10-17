import { memo, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  At,
  BookOpenText,
  CaretDown,
  ChatsCircle,
  Checks,
  Copy,
  CursorText,
  ListChecks,
  Notebook,
  PencilSimple,
  Quotes,
  WarningCircle
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { modelLabel } from '@shared/ai/effort'
import { parseProposals, proposalSummary, type Segment } from '@shared/proposals/parse'
import { toast } from '@/stores/ui'
import { getActiveEditor } from '@/features/editor/registry'
import { sliceFromMarkdown } from '@/features/editor/review'
import type { ChatMessage, Thread } from '@shared/types'
import { ProposalCard } from './ProposalCard'
import { acceptPending, pendingKeys, resolveTarget, setHunkStates } from './applyProposal'
import { Button, Spinner, Tooltip } from '@/ui'
import { typesetForBook } from '@/lib/typeset'
import { getT, useT } from '@/lib/i18n'
import { mentionLabel, resendEdited, retryLast } from './send'
import { useChat, type Streaming } from './chatStore'
import { confirmAndRewind } from './rewind'
import { latestThought, streamPhase, type StreamPhase } from './thinking'

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

function copyText(text: string): void {
  const t = getT()
  navigator.clipboard.writeText(text).then(
    () => toast(t.common.copied),
    () => toast(t.chat.copyFailed, { kind: 'error' })
  )
}

interface Props {
  message: ChatMessage
  thread: Thread
  index: number
  /** Messages after this one */
  after: number
  /** False while the thread works, and in the planning sync thread */
  canAct: boolean
}

export const MessageView = memo(function MessageView(props: Props): React.JSX.Element {
  if (props.message.role === 'user') return <UserMessage {...props} />
  return <AssistantMessage {...props} />
})

export function MentionIcon({ kind }: { kind: 'chapter' | 'entry' | 'thread' }): React.JSX.Element {
  if (kind === 'chapter') return <BookOpenText size={11} />
  if (kind === 'entry') return <Notebook size={11} />
  if (kind === 'thread') return <ChatsCircle size={11} />
  return <At size={11} />
}

/* ------------------------------------------------------------------ */
/* Messages of the user: Edit and Rewind                                */
/* ------------------------------------------------------------------ */

function UserBubble({ message }: { message: ChatMessage }): React.JSX.Element {
  const t = useT()
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

function UserMessage({ message, thread, index, after, canAct }: Props): React.JSX.Element {
  const t = useT()
  const editing = useChat((s) => s.editingId === message.id)
  const setEditing = useChat((s) => s.setEditing)
  if (editing && canAct) return <EditBox message={message} thread={thread} after={after} />
  return (
    <div className="msg-user-wrap">
      <UserBubble message={message} />
      <div className="msg-user-actions">
        {message.content && (
          <Tooltip label={t.chat.copyMessage}>
            <button onClick={() => copyText(message.content)} aria-label={t.chat.copyMessage}>
              <Copy size={13} />
            </button>
          </Tooltip>
        )}
        {canAct && (
          <Tooltip label={t.chat.editHint}>
            <button className="msg-edit-btn" onClick={() => setEditing(message.id)}>
              <PencilSimple size={13} /> {t.chat.editMessage}
            </button>
          </Tooltip>
        )}
        {canAct && after > 0 && (
          <Tooltip label={t.chat.rewindHint}>
            <button className="msg-rewind-btn" onClick={() => void confirmAndRewind(thread, index + 1, 'rewind')}>
              <ArrowCounterClockwise size={13} /> {t.chat.rewind}
            </button>
          </Tooltip>
        )}
      </div>
      {canAct && after === 0 && (
        <div className="msg-noreply">
          {t.chat.noReply}
          <button onClick={() => void retryLast(thread.id)}>
            <ArrowClockwise size={12} /> {t.chat.getReply}
          </button>
        </div>
      )}
    </div>
  )
}

function EditBox({ message, thread, after }: { message: ChatMessage; thread: Thread; after: number }): React.JSX.Element {
  const t = useT()
  const setEditing = useChat((s) => s.setEditing)
  const [text, setText] = useState(message.content)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`
  }, [text])

  const canSend = Boolean(text.trim() || message.quotes?.length) && !busy
  const send = async (): Promise<void> => {
    if (!canSend) return
    setBusy(true)
    try {
      if (await resendEdited(thread.id, message.id, text)) setEditing(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="msg-edit">
      {(message.quotes?.length || message.mentions?.length) && (
        <div className="msg-edit-context">
          {message.quotes?.map((q) => (
            <span key={q.id} className="quote-chip" title={q.text}>
              <Quotes size={11} weight="fill" />
              <span className="quote-chip-text">{q.text}</span>
            </span>
          ))}
          {message.mentions?.map((m) => (
            <span key={m.id} className="mention-chip">
              <MentionIcon kind={m.kind} /> {mentionLabel(t, m)}
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        className="msg-edit-input"
        aria-label={t.chat.editHint}
        value={text}
        spellCheck
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(null)
          }
        }}
      />
      <div className="msg-edit-foot">
        <span className="msg-edit-hint">{t.chat.editAfter(after)}</span>
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
          {t.common.cancel}
        </Button>
        <Button variant="primary" size="sm" onClick={() => void send()} disabled={!canSend}>
          {t.chat.send}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Replies of the AI                                                    */
/* ------------------------------------------------------------------ */

function AssistantMessage({ message, thread, after, canAct }: Props): React.JSX.Element {
  const segments = useMemo(() => parseProposals(message.content), [message.content])
  const thought = useChat((s) => s.thoughts[message.id])
  return (
    <div className="msg msg-ai">
      {thought && <ThinkingLine thinking={thought} phase={{ kind: 'text' }} />}
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
      <ReplyReview segments={segments} message={message} thread={thread} />
      <MessageActions message={message} threadId={thread.id} canRetry={canAct && after === 0} />
    </div>
  )
}

/** One decision for all the proposals of a reply, for example after a planning sync. */
function ReplyReview({ segments, message, thread }: { segments: Segment[]; message: ChatMessage; thread: Thread }): React.JSX.Element | null {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const pending = pendingKeys(segments, message.hunks)
  const files = useMemo(() => {
    const keys = new Set(pending)
    const labels: string[] = []
    for (const s of segments) {
      if (s.kind === 'text') continue
      const mine = s.kind === 'create' ? keys.has(`${s.index}:0`) : s.hunks.some((_, i) => keys.has(`${s.index}:${i}`))
      const label = resolveTarget(s.file).label
      if (mine && !labels.includes(label)) labels.push(label)
    }
    return labels
  }, [segments, pending.join(',')])
  if (pending.length < 2) return null

  const applyAll = async (): Promise<void> => {
    setBusy(true)
    try {
      const { states: result, replaced } = await acceptPending(segments, message.hunks)
      setHunkStates(thread, message.id, result, replaced)
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
    <div className="msg-bulk" role="group" aria-label={t.chat.replyProposals(pending.length)}>
      <span className="msg-bulk-icon" aria-hidden>
        <ListChecks size={18} />
      </span>
      <div className="msg-bulk-info">
        <span className="msg-bulk-count">{t.chat.replyProposals(pending.length)}</span>
        {files.length > 0 && <span className="msg-bulk-files">{files.join(' · ')}</span>}
      </div>
      <div className="msg-bulk-actions">
        <button className="proposal-btn msg-bulk-reject" onClick={rejectAll} disabled={busy}>
          {t.common.rejectAll}
        </button>
        <Tooltip label={t.chat.applyAllHint} side="top">
          <button className="proposal-btn is-accept msg-bulk-apply" onClick={() => void applyAll()} disabled={busy}>
            {busy ? <Spinner size={12} /> : <Checks size={14} weight="bold" />} {t.chat.applyAll(pending.length)}
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

function MessageActions({ message, threadId, canRetry }: { message: ChatMessage; threadId: string; canRetry: boolean }): React.JSX.Element | null {
  const t = useT()
  const text = message.content.trim() ? proposalSummary(message.content).trim() : ''
  if (!text && !canRetry) return null
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
    <div className={clsx('msg-actions', canRetry && message.error && 'is-shown')}>
      {text && (
        <Tooltip label={t.chat.copyReply}>
          <button onClick={() => copyText(text)}>
            <Copy size={13} /> {t.common.copy}
          </button>
        </Tooltip>
      )}
      {canRetry && (
        <Tooltip label={t.chat.retryHint}>
          <button className="msg-retry" onClick={() => void retryLast(threadId)}>
            <ArrowClockwise size={13} /> {t.chat.retry}
          </button>
        </Tooltip>
      )}
      {text && (
        <Tooltip label={t.chat.insertHint}>
          <button className="msg-insert" onClick={insert}>
            <CursorText size={13} /> {t.chat.insert}
          </button>
        </Tooltip>
      )}
      {message.model && <span className="msg-model">{modelLabel(message.model)}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* While the AI works                                                   */
/* ------------------------------------------------------------------ */

/**
 * One quiet line above the reply: the latest thought of the model, or what the reply does now.
 * The full thinking opens below it. Thinking stays in memory: it is never saved or sent to the AI.
 */
function ThinkingLine({ thinking, status, phase }: { thinking?: string; status?: string; phase: StreamPhase }): React.JSX.Element | null {
  const t = useT()
  const [open, setOpen] = useState(false)
  const full = thinking?.trim() ?? ''
  let line: string | null = null
  let live = true
  if (phase.kind === 'edit') line = t.chat.phaseEdit(resolveTarget(phase.file).label)
  else if (phase.kind === 'create') line = t.chat.phaseCreate
  else if (phase.kind === 'reading') line = (full && latestThought(full)) || status || t.chat.phaseReading
  else if (full) {
    line = t.chat.thoughtProcess
    live = false
  }
  if (!line) return null
  const head = (
    <>
      <span className={clsx('think-mark', live && 'is-live')} aria-hidden />
      <span key={line} className={clsx('think-line', live && 'is-live')}>
        {line}
      </span>
      {full && <CaretDown size={11} className="think-caret" aria-hidden />}
    </>
  )
  return (
    <div className={clsx('think', open && 'is-open', !live && 'is-done')}>
      {full ? (
        <button
          className="think-head"
          aria-expanded={open}
          aria-label={`${line} — ${open ? t.chat.hideThinking : t.chat.showThinking}`}
          title={open ? t.chat.hideThinking : t.chat.showThinking}
          onClick={() => setOpen(!open)}
        >
          {head}
        </button>
      ) : (
        <div className="think-head" role="status" aria-label={t.chat.thinking}>
          {head}
        </div>
      )}
      {open && full && <div className="think-body">{full}</div>}
    </div>
  )
}

export function StreamingMessage({ streaming }: { streaming: Streaming }): React.JSX.Element {
  const segments = useMemo(() => parseProposals(streaming.text), [streaming.text])
  const phase = streamPhase(segments)
  const writing = phase.kind === 'edit' || phase.kind === 'create'
  return (
    <div className="msg msg-ai is-streaming">
      {/* The thinking stays at the top. What the reply writes now shows at its end, where the text grows. */}
      <ThinkingLine thinking={streaming.thinking} status={streaming.status} phase={writing ? { kind: 'text' } : phase} />
      {segments.map((s, i) =>
        s.kind === 'text' ? (
          <div key={i} className="msg-ai-text prose">
            <Markdown text={s.text} />
          </div>
        ) : (
          <ProposalCard key={i} segment={s} streaming />
        )
      )}
      {writing && <ThinkingLine phase={phase} />}
      {phase.kind === 'text' && <span className="stream-caret" />}
    </div>
  )
}

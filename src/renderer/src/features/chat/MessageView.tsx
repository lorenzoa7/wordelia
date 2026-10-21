import { memo, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  Checks,
  Copy,
  CursorText,
  ListChecks,
  PencilSimple,
  Quotes,
  StopCircle,
  WarningCircle
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { modelLabel } from '@shared/ai/effort'
import { hasProposals, isFileSegment, parseProposals, replyProse, type Segment } from '@shared/proposals/parse'
import { Selection } from '@tiptap/pm/state'
import { toast } from '@/stores/ui'
import { describeError } from '@/lib/ai'
import { getActiveEditor } from '@/features/editor/registry'
import { sliceFromMarkdown } from '@/features/editor/review'
import type { ChatMessage, ReadRequest, Thread } from '@shared/types'
import { ProposalCard } from './ProposalCard'
import { ReadHead, ReadOfferCard } from '@/features/read/ReadOfferCard'
import { acceptPending, pendingKeys, resolveTarget, segmentKeys, setHunkStates } from './applyProposal'
import { acceptLineProposal, isLineSegment, messageLineProposal } from '@/features/plan/line/proposal'
import { findStoryLine } from '@shared/storyline'
import { useBook } from '@/stores/book'
import { Button, Spinner, Tooltip } from '@/ui'
import { typesetForBook } from '@/lib/typeset'
import { getT, useT } from '@/lib/i18n'
import { resendEdited, retryLast } from './send'
import { ChatInput } from './ChatInput'
import { MentionPill } from './MentionPill'
import { MessageImages } from './ChatImages'
import { docFromParts, readDraft, splitMentions } from './draft'
import { useChat, type Streaming } from './chatStore'
import { confirmAndRewind } from './rewind'
import { latestThought, streamPhase, type StreamPhase } from './thinking'
import { closeMarkdown } from './markdown'
import { acceptedToast, rejectWithUndo } from './undo'
import { formatCost } from './usage'

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

/* ------------------------------------------------------------------ */
/* Messages of the user: Edit and Rewind                                */
/* ------------------------------------------------------------------ */

function UserBubble({ message }: { message: ChatMessage }): React.JSX.Element {
  // Each mention shows as a pill in its place in the text. Older messages kept their mentions apart: they show above the text.
  const { parts, rest } = useMemo(() => splitMentions(message.content, message.mentions ?? []), [message.content, message.mentions])
  return (
    <div className="msg msg-user">
      {message.images?.length ? <MessageImages images={message.images} /> : null}
      {message.quotes?.map((q) => (
        <blockquote key={q.id} className="msg-quote">
          <span className="msg-quote-src">
            <Quotes size={11} weight="fill" /> {q.source.label}
          </span>
          {q.text}
        </blockquote>
      ))}
      {rest.length > 0 && (
        <div className="msg-mentions">
          {rest.map((m) => (
            <MentionPill key={m.id} mention={m} />
          ))}
        </div>
      )}
      {message.content && (
        <div className="msg-user-text">{parts.map((p, i) => (typeof p === 'string' ? p : <MentionPill key={i} mention={p} />))}</div>
      )}
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
  // The mentions show as pills in the text again. Mentions of older messages, apart from the text, stay apart.
  const [{ initial, rest }] = useState(() => {
    const split = splitMentions(message.content, message.mentions ?? [])
    return { initial: docFromParts(split.parts), rest: split.rest }
  })
  const [draft, setDraft] = useState(() => readDraft(initial))
  const [busy, setBusy] = useState(false)

  const canSend = Boolean(draft.text.trim() || message.quotes?.length || message.images?.length) && !busy
  const send = async (): Promise<void> => {
    if (!canSend) return
    setBusy(true)
    try {
      const mentions = [...rest, ...draft.mentions.filter((m) => !rest.some((r) => r.id === m.id))]
      if (await resendEdited(thread.id, message.id, draft.text, mentions)) setEditing(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="msg-edit">
      {(message.quotes?.length || rest.length > 0) && (
        <div className="msg-edit-context">
          {message.quotes?.map((q) => (
            <span key={q.id} className="quote-chip" title={q.text}>
              <Quotes size={11} weight="fill" />
              <span className="quote-chip-text">{q.text}</span>
            </span>
          ))}
          {rest.map((m) => (
            <MentionPill key={m.id} mention={m} />
          ))}
        </div>
      )}
      <ChatInput
        initial={initial}
        className="msg-edit-input"
        ariaLabel={t.chat.editHint}
        placeholder=""
        autoFocus
        onChange={(doc) => setDraft(readDraft(doc))}
        onEnter={() => void send()}
        onEscape={() => setEditing(null)}
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

/**
 * The error of a failed reply: the plain message, the button that fixes it (for example "Open
 * settings", which opens the row of the provider), and the words of the provider under "Details".
 */
function ReplyError({ message }: { message: ChatMessage }): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const fix = message.errorKind ? describeError({ ok: false, text: '', errorKind: message.errorKind, provider: message.provider }).fix : undefined
  return (
    <div className="msg-error">
      <WarningCircle size={14} />
      <div className="msg-error-text">
        {message.error}
        {message.errorDetail && (
          <>
            {' '}
            <button className="msg-error-more" aria-expanded={open} onClick={() => setOpen(!open)}>
              {t.chat.errorDetails}
            </button>
            {open && <span className="msg-error-detail">{message.errorDetail}</span>}
          </>
        )}
      </div>
      {fix && (
        <button className="msg-error-btn" onClick={fix.run}>
          {fix.label}
        </button>
      )}
    </div>
  )
}

function AssistantMessage({ message, thread, index, after, canAct }: Props): React.JSX.Element {
  const t = useT()
  const segments = useMemo(() => parseProposals(message.content), [message.content])
  // The reply to a read has a card above its letter. The comments are in the margin, not in the chat.
  const read = thread.messages[index - 1]?.role === 'user' ? thread.messages[index - 1].read : undefined
  const thought = useChat((s) => s.thoughts[message.id])
  // A reply that stopped or failed can end in the middle of a mark ("**bold"): close it.
  const cut = Boolean(message.stopped || message.error)
  return (
    <div className="msg msg-ai">
      {thought && <ThinkingLine thinking={thought} phase={{ kind: 'text' }} />}
      {read && <ReadHead read={read} threadId={thread.id} messageId={message.id} />}
      {segments.map((s, i) =>
        s.kind === 'text' ? (
          <div key={i} className="msg-ai-text prose">
            <Markdown text={cut && i === segments.length - 1 ? closeMarkdown(s.text) : s.text} />
          </div>
        ) : isFileSegment(s) ? (
          <ProposalCard key={i} segment={s} message={message} thread={thread} />
        ) : s.kind === 'read' ? (
          <ReadOfferCard key={i} segment={s} />
        ) : null
      )}
      {message.stopped && (
        <p className="msg-stopped" title={t.chat.stoppedHint}>
          <StopCircle size={13} aria-hidden /> {t.chat.stoppedMark}
        </p>
      )}
      {message.error && <ReplyError message={message} />}
      <ReplyReview segments={segments} message={message} thread={thread} />
      <MessageActions message={message} threadId={thread.id} canRetry={canAct && after === 0} />
    </div>
  )
}

/** How many file names the bar of a reply shows before the count of the others ("+5"). */
const BULK_NAMES = 3

/** One decision for all the proposals of a reply, for example after a planning sync. */
function ReplyReview({ segments, message, thread }: { segments: Segment[]; message: ChatMessage; thread: Thread }): React.JSX.Element | null {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const pending = pendingKeys(segments, message.hunks)
  const files = useMemo(() => {
    const keys = new Set(pending)
    const labels: string[] = []
    for (const s of segments) {
      if (!isFileSegment(s)) continue
      const mine = segmentKeys(s).some((k) => keys.has(k))
      const label = resolveTarget(s.file).label
      if (mine && !labels.includes(label)) labels.push(label)
    }
    return labels
  }, [segments, pending.join(',')])
  // A change of the story line is one proposal, also when it has many parts.
  const count = useMemo(() => {
    const keys = new Set(pending)
    let line = 0
    const inLine = new Set<string>()
    for (const s of segments) {
      if (!isFileSegment(s) || !isLineSegment(s)) continue
      const mine = segmentKeys(s).filter((k) => keys.has(k))
      mine.forEach((k) => inLine.add(k))
      if (mine.length) line++
    }
    return pending.filter((k) => !inLine.has(k)).length + line
  }, [segments, pending.join(',')])
  if (count < 2) return null

  const applyAll = async (): Promise<void> => {
    setBusy(true)
    try {
      // The story line takes its change in one piece, as its board showed it.
      const story = findStoryLine(useBook.getState().entries)
      const line = messageLineProposal(thread, message, story ? story.body : null)
      if (line) await acceptLineProposal(line)
      const others = segments.filter((s) => s.kind === 'text' || !isLineSegment(s))
      const { states: result, replaced } = await acceptPending(others, message.hunks)
      setHunkStates(thread, message.id, result, replaced)
      const states = Object.values(result)
      const ok = states.filter((s) => s === 'accepted').length
      const failed = states.length - ok
      const chapters = segments.some((s) => s.kind === 'edit' && s.file.replace(/\\/g, '/').startsWith('manuscript/'))
      const done = Object.keys(result).filter((k) => result[k] === 'accepted')
      if (failed) toast(t.chat.bulkPartial(ok, states.length, failed), { kind: 'error' })
      // Undo takes the changes of this reply out of the book again, where their text is unchanged.
      else if (done.length) acceptedToast(t.chat.bulkApplied(ok, chapters), thread.id, message.id, done)
      else if (line) toast(t.chat.bulkApplied(ok, chapters))
    } finally {
      setBusy(false)
    }
  }
  const rejectAll = (): void => rejectWithUndo(thread, message.id, pending)

  // A few names, then a count of the others. The names get "…" when they do not fit; the count always shows.
  const named = files.slice(0, BULK_NAMES)
  const more = files.length - named.length

  return (
    <div className="msg-bulk" role="group" aria-label={t.chat.replyProposals(count)}>
      <div className="msg-bulk-main">
        <span className="msg-bulk-icon" aria-hidden>
          <ListChecks size={18} />
        </span>
        <div className="msg-bulk-info">
          <span className="msg-bulk-count">{t.chat.replyProposals(count)}</span>
          {files.length > 0 && (
            <Tooltip label={<span className="msg-bulk-tip">{files.join(' · ')}</span>} side="top">
              <span className="msg-bulk-files">
                <span className="msg-bulk-names">{named.join(' · ')}</span>
                {more > 0 && (
                  <span className="msg-bulk-more" aria-label={t.chat.moreFilesLabel(more)}>
                    {t.chat.moreFiles(more)}
                  </span>
                )}
              </span>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="msg-bulk-actions">
        <button className="proposal-btn msg-bulk-reject" onClick={rejectAll} disabled={busy}>
          {t.common.rejectAll}
        </button>
        <Tooltip label={t.chat.applyAllHint} side="top">
          <button className="proposal-btn is-accept msg-bulk-apply" onClick={() => void applyAll()} disabled={busy}>
            {busy ? <Spinner size={12} /> : <Checks size={14} weight="bold" />} {t.chat.applyAll(count)}
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

/**
 * Put text as new paragraphs after the paragraph of the cursor. A selection stays as it is: the text
 * never takes its place, and never joins the paragraph.
 */
function insertParagraphs(markdown: string): boolean {
  const a = getActiveEditor()
  if (!a) return false
  const { state } = a.editor
  const slice = sliceFromMarkdown(state.schema, typesetForBook(markdown))
  const $to = state.selection.$to
  const at = $to.depth > 0 ? $to.after(1) : $to.pos
  const tr = state.tr.insert(at, slice.content)
  tr.setSelection(Selection.near(tr.doc.resolve(at + slice.content.size), -1))
  a.editor.view.dispatch(tr.scrollIntoView())
  a.editor.commands.focus()
  return true
}

/** "1,234 tokens in · 210 out · about $0.012" */
function usageLabel(t: ReturnType<typeof useT>, u: NonNullable<ChatMessage['usage']>): string {
  return t.chat.usage(t.common.number(u.inputTokens ?? 0), t.common.number(u.outputTokens ?? 0), typeof u.costUsd === 'number' ? formatCost(u.costUsd, t.common.locale) : null)
}

/** True when a reply has comments of a read, an offer of a read, or the ids of comments that look fixed. */
function hasReadParts(content: string): boolean {
  return parseProposals(content).some((s) => s.kind === 'note' || s.kind === 'read' || s.kind === 'resolved')
}

function MessageActions({ message, threadId, canRetry }: { message: ChatMessage; threadId: string; canRetry: boolean }): React.JSX.Element | null {
  const t = useT()
  // Copy and Insert take the prose of the reply: never the proposals, never the words about them.
  const text = message.content.trim() ? replyProse(message.content) : ''
  // A reply with proposals is about changes, and the letter of a read is about the chapter: their text is not for the book.
  const canInsert = Boolean(text) && !hasProposals(message.content) && !hasReadParts(message.content)
  if (!text && !canRetry && !message.model && !message.usage) return null
  const insert = (): void => {
    if (!insertParagraphs(text)) toast(t.chat.openChapterFirst)
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
      {canInsert && (
        <Tooltip label={t.chat.insertHint}>
          <button className="msg-insert" onClick={insert}>
            <CursorText size={13} /> {t.chat.insert}
          </button>
        </Tooltip>
      )}
      {(message.model || message.usage) && (
        <span className="msg-model">
          {[message.model ? modelLabel(message.model) : '', message.usage ? usageLabel(t, message.usage) : ''].filter(Boolean).join(' · ')}
        </span>
      )}
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

/** `read` is the request of the read that this reply answers (in the thread `threadId`), when it answers one. */
export function StreamingMessage({ streaming, read, threadId }: { streaming: Streaming; read?: ReadRequest; threadId?: string }): React.JSX.Element {
  const segments = useMemo(() => parseProposals(streaming.text), [streaming.text])
  const phase = streamPhase(segments)
  const writing = phase.kind === 'edit' || phase.kind === 'create'
  return (
    <div className="msg msg-ai is-streaming">
      {/* The thinking stays at the top. What the reply writes now shows at its end, where the text grows. */}
      <ThinkingLine thinking={streaming.thinking} status={streaming.status} phase={writing ? { kind: 'text' } : phase} />
      {read && threadId && <ReadHead read={read} threadId={threadId} messageId={streaming.messageId} />}
      {segments.map((s, i) =>
        s.kind === 'text' ? (
          <div key={i} className="msg-ai-text prose">
            <Markdown text={i === segments.length - 1 ? closeMarkdown(s.text) : s.text} />
          </div>
        ) : isFileSegment(s) ? (
          <ProposalCard key={i} segment={s} streaming />
        ) : null
      )}
      {writing && <ThinkingLine phase={phase} />}
      {phase.kind === 'text' && <span className="stream-caret" />}
    </div>
  )
}

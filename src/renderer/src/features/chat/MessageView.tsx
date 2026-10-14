import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { At, BookOpenText, ChatsCircle, Copy, Notebook, Quotes, TextIndent, WarningCircle } from '@phosphor-icons/react'
import { parseProposals, proposalSummary } from '@shared/proposals/parse'
import { toast } from '@/stores/ui'
import { getActiveEditor } from '@/features/editor/registry'
import { sliceFromMarkdown } from '@/features/editor/review'
import type { ChatMessage, Thread } from '@shared/types'
import { ProposalCard } from './ProposalCard'

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
                <MentionIcon kind={m.kind} /> {m.label}
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
      {message.content.trim() && <MessageActions text={proposalSummary(message.content).trim()} />}
    </div>
  )
}

function MessageActions({ text }: { text: string }): React.JSX.Element {
  const copy = (): void => {
    navigator.clipboard.writeText(text).then(
      () => toast('Copied.'),
      () => toast('Could not copy.', { kind: 'error' })
    )
  }
  const insert = (): void => {
    const a = getActiveEditor()
    if (!a) {
      toast('Open a chapter first.')
      return
    }
    const { state } = a.editor
    const slice = sliceFromMarkdown(state.schema, text)
    a.editor.view.dispatch(state.tr.replaceSelection(slice).scrollIntoView())
    a.editor.commands.focus()
  }
  return (
    <div className="msg-actions">
      <button onClick={copy} title="Copy the reply">
        <Copy size={13} /> Copy
      </button>
      <button onClick={insert} title="Insert the reply at the cursor in the open chapter (Ctrl+Z undoes it)">
        <TextIndent size={13} /> Insert into chapter
      </button>
    </div>
  )
}

export function StreamingMessage({ text }: { text: string }): React.JSX.Element {
  const segments = useMemo(() => parseProposals(text), [text])
  return (
    <div className="msg msg-ai is-streaming">
      {segments.length === 0 && (
        <div className="msg-thinking" role="status" aria-label="The editor is thinking">
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

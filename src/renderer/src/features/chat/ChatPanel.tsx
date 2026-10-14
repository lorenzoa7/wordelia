import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CaretDown, ChatsCircle, DotsThree, NotePencil, Plus, PushPin, Trash } from '@phosphor-icons/react'
import { Popover } from 'radix-ui'
import clsx from 'clsx'
import type { Thread } from '@shared/types'
import { Button, Dialog, Field, IconButton, Menu, MenuItem, MenuSeparator, TextArea, TextInput } from '@/ui'
import { useBook } from '@/stores/book'
import { useChat } from './chatStore'
import { askConfirm } from '@/ui/prompt'
import { newThread } from './send'
import { MessageView, StreamingMessage } from './MessageView'
import { Composer } from './Composer'
import './chat.css'

export function ChatPanel(): React.JSX.Element {
  const threads = useBook((s) => s.threads)
  const activeId = useChat((s) => s.activeThreadId)
  const setActive = useChat((s) => s.setActiveThread)
  const thread = threads.find((t) => t.id === activeId) ?? null
  const streaming = useChat((s) => (thread ? s.streaming[thread.id] : undefined))
  const [editing, setEditing] = useState<Thread | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Open the most recent thread when the book opens.
  useEffect(() => {
    if (!activeId && threads.length) setActive(threads[0].id)
  }, [activeId, threads, setActive])

  // Keep the newest message in view.
  const count = thread?.messages.length ?? 0
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (nearBottom || !streaming) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [count, streaming?.text.length, activeId, streaming])

  const create = (): void => {
    const t = newThread()
    useBook.getState().saveThread(t, true)
    setActive(t.id)
    setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer-input')?.focus(), 50)
  }

  return (
    <aside className="chat-panel" aria-label="Chat">
      <header className="chat-head">
        <ThreadSwitcher threads={threads} active={thread} onSelect={setActive} onCreate={create} />
        <div className="chat-head-actions">
          <IconButton label="New thread" onClick={create}>
            <Plus size={16} />
          </IconButton>
          {thread && (
            <Menu
              align="end"
              trigger={
                <IconButton label="Thread options">
                  <DotsThree size={18} weight="bold" />
                </IconButton>
              }
            >
              <MenuItem icon={<NotePencil size={15} />} onSelect={() => setEditing(thread)}>
                Title and purpose…
              </MenuItem>
              <MenuItem
                icon={<PushPin size={15} />}
                onSelect={() => useBook.getState().saveThread({ ...thread, pinned: !thread.pinned })}
              >
                {thread.pinned ? 'Unpin' : 'Pin'}
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash size={15} />}
                onSelect={() =>
                  void askConfirm({
                    title: `Delete “${thread.title}”?`,
                    message: 'The messages of this thread will be deleted. Other threads keep their own digests.',
                    confirm: 'Delete',
                    danger: true
                  }).then((ok) => {
                    if (!ok) return
                    void useBook.getState().deleteThread(thread.id)
                    setActive(null)
                  })
                }
              >
                Delete thread
              </MenuItem>
            </Menu>
          )}
        </div>
      </header>
      {thread?.brief && (
        <div className="chat-brief">
          <span className="caps">Purpose</span> {thread.brief}
        </div>
      )}

      <div className="chat-scroll" ref={scrollRef}>
        {!thread || (thread.messages.length === 0 && !streaming) ? (
          <ChatEmpty />
        ) : (
          <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions">
            {thread.messages.map((m) => (
              <MessageView key={m.id} message={m} thread={thread} />
            ))}
            {streaming && <StreamingMessage text={streaming.text} />}
          </div>
        )}
      </div>

      <Composer thread={thread} />
      <ThreadEditor thread={editing} onClose={() => setEditing(null)} />
    </aside>
  )
}

function ThreadSwitcher({
  threads,
  active,
  onSelect,
  onCreate
}: {
  threads: Thread[]
  active: Thread | null
  onSelect: (id: string) => void
  onCreate: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const sorted = useMemo(() => {
    const list = [...threads].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
    const f = q.trim().toLowerCase()
    return f ? list.filter((t) => `${t.title} ${t.brief} ${t.digest}`.toLowerCase().includes(f)) : list
  }, [threads, q])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="thread-switch">
          <ChatsCircle size={16} />
          <span>{active?.title ?? 'New thread'}</span>
          <CaretDown size={11} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="thread-pop" align="start" sideOffset={6}>
          <input className="thread-search" aria-label="Search threads" placeholder="Search threads" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="thread-list">
            {sorted.length === 0 && <p className="thread-none">No threads yet.</p>}
            {sorted.map((t) => (
              <button
                key={t.id}
                className={clsx('thread-item', t.id === active?.id && 'is-active')}
                onClick={() => {
                  onSelect(t.id)
                  setOpen(false)
                }}
              >
                <span className="thread-item-title">
                  {t.pinned && <PushPin size={11} weight="fill" />}
                  {t.title}
                </span>
                <span className="thread-item-sub">{t.brief || firstLine(t.digest) || `${t.messages.length} ${t.messages.length === 1 ? 'message' : 'messages'}`}</span>
              </button>
            ))}
          </div>
          <button
            className="thread-new"
            onClick={() => {
              onCreate()
              setOpen(false)
            }}
          >
            <Plus size={13} /> New thread
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function firstLine(s: string): string {
  return s.split('\n').find((l) => l.trim())?.replace(/^-\s*/, '') ?? ''
}

function ThreadEditor({ thread, onClose }: { thread: Thread | null; onClose: () => void }): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  useEffect(() => {
    if (thread) {
      setTitle(thread.title)
      setBrief(thread.brief)
    }
  }, [thread])
  return (
    <Dialog
      open={thread !== null}
      onOpenChange={(v) => !v && onClose()}
      title="Thread"
      description="The purpose helps the AI focus. Other threads see this thread's purpose and digest."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (thread) useBook.getState().saveThread({ ...thread, title: title.trim() || thread.title, brief: brief.trim() })
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <Field label="Title">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Purpose" hint="Example: Heitor's arc in part two. His guilt and his loyalty to the Carpinteiros.">
        <TextArea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} />
      </Field>
      {thread?.digest && (
        <Field label="Digest (kept by the AI)">
          <div className="digest-box">{thread.digest}</div>
        </Field>
      )}
    </Dialog>
  )
}

const SUGGESTIONS = [
  'What is the weakest part of this chapter?',
  'Check this chapter against the planning. Is anything inconsistent?',
  'Suggest three titles for this chapter.',
  'Which scene could be cut or merged?'
]

function ChatEmpty(): React.JSX.Element {
  const setDraft = useChat((s) => s.setDraft)
  return (
    <AnimatePresence>
      <motion.div className="chat-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        <p className="chat-empty-title">Your editor is here.</p>
        <p className="chat-empty-text">
          It reads the whole book, the planning, and your other threads. It can propose changes; you approve each one.
        </p>
        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="chat-suggestion"
              onClick={() => {
                setDraft(s)
                document.querySelector<HTMLTextAreaElement>('.composer-input')?.focus()
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CaretDown, ChatsCircle, DotsThree, NotePencil, Plus, PushPin, Trash } from '@phosphor-icons/react'
import { Popover } from 'radix-ui'
import clsx from 'clsx'
import type { Thread } from '@shared/types'
import { Button, Dialog, Field, IconButton, Menu, MenuItem, MenuSeparator, TextArea, TextInput } from '@/ui'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { SYNC_THREAD_ID } from '@/features/plan/sync'
import { useChat } from './chatStore'
import { askConfirm } from '@/ui/prompt'
import { newThread, threadBrief, threadTitle } from './send'
import { MessageView, StreamingMessage } from './MessageView'
import { Composer } from './Composer'
import { RewindHost } from './RewindDialog'
import { lastReplyAt, markSeen, StatusDot, useChatAttention, useThreadStatuses } from './status'
import './chat.css'

export function ChatPanel(): React.JSX.Element {
  const t = useT()
  const threads = useBook((s) => s.threads)
  const activeId = useChat((s) => s.activeThreadId)
  const setActive = useChat((s) => s.setActiveThread)
  const thread = threads.find((th) => th.id === activeId) ?? null
  const streaming = useChat((s) => (thread ? s.streaming[thread.id] : undefined))
  const chatOpen = useApp((s) => s.settings?.ui.chatOpen ?? true)
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
    // An empty thread shows its welcome text from the top.
    if (!count && !streaming) {
      el.scrollTo({ top: 0 })
      return
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (nearBottom || !streaming) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [count, streaming?.text.length, streaming?.thinking?.length, activeId, streaming])

  // The user sees the thread when the chat is open and the window shows. Then its new reply is seen.
  const lastReply = thread ? lastReplyAt(thread) : ''
  useEffect(() => {
    if (!thread || !chatOpen || streaming) return
    const id = thread.id
    const mark = (): void => {
      if (document.visibilityState === 'visible') markSeen(id)
    }
    mark()
    window.addEventListener('focus', mark)
    document.addEventListener('visibilitychange', mark)
    return () => {
      window.removeEventListener('focus', mark)
      document.removeEventListener('visibilitychange', mark)
    }
  }, [thread?.id, chatOpen, lastReply, Boolean(streaming)])

  // Edit, Rewind and Retry wait while the thread works. The planning sync thread has its own requests.
  const canAct = Boolean(thread) && !streaming && thread?.id !== SYNC_THREAD_ID

  const create = (): void => {
    const th = newThread()
    useBook.getState().saveThread(th, true)
    setActive(th.id)
    setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer-input')?.focus(), 50)
  }

  return (
    <aside className="chat-panel" aria-label={t.chat.panel}>
      <header className="chat-head">
        <ThreadSwitcher threads={threads} active={thread} onSelect={setActive} onCreate={create} />
        <div className="chat-head-actions">
          <IconButton label={t.chat.newThread} onClick={create}>
            <Plus size={16} />
          </IconButton>
          {thread && (
            <Menu
              align="end"
              trigger={
                <IconButton label={t.chat.threadOptions}>
                  <DotsThree size={18} weight="bold" />
                </IconButton>
              }
            >
              <MenuItem icon={<NotePencil size={15} />} onSelect={() => setEditing(thread)}>
                {t.chat.titleAndPurpose}
              </MenuItem>
              <MenuItem
                icon={<PushPin size={15} />}
                onSelect={() => useBook.getState().saveThread({ ...thread, pinned: !thread.pinned })}
              >
                {thread.pinned ? t.chat.unpin : t.chat.pin}
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash size={15} />}
                onSelect={() =>
                  void askConfirm({
                    title: t.chat.deleteTitle(threadTitle(t, thread.title)),
                    message: t.chat.deleteMessage,
                    confirm: t.common.delete,
                    danger: true
                  }).then((ok) => {
                    if (!ok) return
                    void useBook.getState().deleteThread(thread.id)
                    setActive(null)
                  })
                }
              >
                {t.chat.deleteThread}
              </MenuItem>
            </Menu>
          )}
        </div>
      </header>
      {thread?.brief && (
        <div className="chat-brief">
          <span className="caps">{t.chat.purpose}</span> {threadBrief(t, thread.brief)}
        </div>
      )}

      <div className="chat-scroll" ref={scrollRef}>
        {!thread || (thread.messages.length === 0 && !streaming) ? (
          <ChatEmpty />
        ) : (
          <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions">
            {thread.messages.map((m, i) => (
              <MessageView key={m.id} message={m} thread={thread} index={i} after={thread.messages.length - 1 - i} canAct={canAct} />
            ))}
            {streaming && <StreamingMessage streaming={streaming} />}
          </div>
        )}
      </div>

      <Composer thread={thread} />
      <ThreadEditor thread={editing} onClose={() => setEditing(null)} />
      <RewindHost />
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
  const t = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const statuses = useThreadStatuses()
  // A dot on the switch when another thread needs the user.
  const elsewhere = useChatAttention(active?.id)
  const sorted = useMemo(() => {
    const list = [...threads].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
    const f = q.trim().toLowerCase()
    return f ? list.filter((th) => `${threadTitle(t, th.title)} ${th.brief} ${th.digest}`.toLowerCase().includes(f)) : list
  }, [threads, q, t])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="thread-switch">
          <ChatsCircle size={16} />
          <span>{active ? threadTitle(t, active.title) : t.chat.newThread}</span>
          <CaretDown size={11} />
          {elsewhere && <StatusDot state={elsewhere} className="thread-switch-dot" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="thread-pop" align="start" sideOffset={6}>
          <input className="thread-search" aria-label={t.chat.searchThreads} placeholder={t.chat.searchThreads} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="thread-list">
            {sorted.length === 0 && <p className="thread-none">{t.chat.noThreads}</p>}
            {sorted.map((th) => {
              const st = statuses[th.id] ?? { state: null, pending: 0 }
              const statusText =
                st.state === 'working' ? t.chat.statusWorking : st.state === 'needs-you' ? t.chat.statusNeedsYou(st.pending) : st.state === 'unseen' ? t.chat.statusUnseen : ''
              return (
                <button
                  key={th.id}
                  className={clsx('thread-item', th.id === active?.id && 'is-active', st.state && `has-${st.state}`)}
                  onClick={() => {
                    onSelect(th.id)
                    setOpen(false)
                  }}
                >
                  <StatusDot state={st.state} className="thread-item-dot" />
                  <span className="thread-item-main">
                    <span className="thread-item-top">
                      <span className="thread-item-title">
                        {th.pinned && <PushPin size={11} weight="fill" />}
                        <span>{threadTitle(t, th.title)}</span>
                      </span>
                      <span className="thread-item-time">{timeAgo(th.updatedAt, t.common.locale)}</span>
                    </span>
                    <span className={clsx('thread-item-sub', statusText && 'is-status')}>
                      {statusText || threadBrief(t, th.brief) || firstLine(th.digest) || t.chat.messages(th.messages.length)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <button
            className="thread-new"
            onClick={() => {
              onCreate()
              setOpen(false)
            }}
          >
            <Plus size={13} /> {t.chat.newThread}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function firstLine(s: string): string {
  return s.split('\n').find((l) => l.trim())?.replace(/^-\s*/, '') ?? ''
}

/** "5 min ago", "yesterday", in the interface language. */
function timeAgo(iso: string, locale: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const s = Math.round((then - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
    ['year', Infinity]
  ]
  let v = s
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) return unit === 'second' ? rtf.format(0, 'second') : rtf.format(Math.round(v), unit)
    v /= size
  }
  return ''
}

function ThreadEditor({ thread, onClose }: { thread: Thread | null; onClose: () => void }): React.JSX.Element {
  const t = useT()
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  // A new thread shows its title in the interface language. If the user keeps that title, the stored title stays.
  const shownTitle = thread ? threadTitle(t, thread.title) : ''
  useEffect(() => {
    if (thread) {
      setTitle(shownTitle)
      setBrief(thread.brief)
    }
  }, [thread])
  return (
    <Dialog
      open={thread !== null}
      onOpenChange={(v) => !v && onClose()}
      title={t.chat.thread}
      description={t.chat.editorDescription}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (thread) {
                const next = title.trim()
                useBook.getState().saveThread({ ...thread, title: next && next !== shownTitle ? next : thread.title, brief: brief.trim() })
              }
              onClose()
            }}
          >
            {t.common.save}
          </Button>
        </>
      }
    >
      <Field label={t.chat.title}>
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t.chat.purpose} hint={t.chat.purposeHint}>
        <TextArea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} />
      </Field>
      {thread?.digest && (
        <Field label={t.chat.digest}>
          <div className="digest-box">{thread.digest}</div>
        </Field>
      )}
    </Dialog>
  )
}

function ChatEmpty(): React.JSX.Element {
  const t = useT()
  const setDraft = useChat((s) => s.setDraft)
  return (
    <AnimatePresence>
      <motion.div className="chat-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        <p className="chat-empty-title">{t.chat.emptyTitle}</p>
        <p className="chat-empty-text">{t.chat.emptyText}</p>
        <div className="chat-suggestions">
          {t.chat.suggestions.map((s) => (
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

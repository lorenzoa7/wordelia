import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, DotsThree, MagnifyingGlass, NotePencil, Plus, PushPin, Target, Trash } from '@phosphor-icons/react'
import clsx from 'clsx'
import type { Thread } from '@shared/types'
import { Button, Dialog, Field, IconButton, Menu, MenuItem, MenuSeparator, TextArea, TextInput, Tooltip } from '@/ui'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { SYNC_THREAD_ID } from '@/features/plan/sync'
import { focusComposer, useChat } from './chatStore'
import { askConfirm } from '@/ui/prompt'
import { newThread, threadBrief, threadTitle } from './send'
import { MessageView, StreamingMessage } from './MessageView'
import { Composer } from './Composer'
import { RewindHost } from './RewindDialog'
import { lastReplyAt, markSeen, StatusDot, useChatAttention, useThreadStatuses } from './status'
import './chat.css'

/** The most recently changed thread. */
function latest(threads: Thread[]): Thread | undefined {
  return threads.reduce<Thread | undefined>((a, b) => (!a || b.updatedAt > a.updatedAt ? b : a), undefined)
}

export function ChatPanel(): React.JSX.Element {
  const t = useT()
  const threads = useBook((s) => s.threads)
  const activeId = useChat((s) => s.activeThreadId)
  const listOpen = useChat((s) => s.listOpen)
  const setActive = useChat((s) => s.setActiveThread)
  const setListOpen = useChat((s) => s.setListOpen)
  const thread = threads.find((th) => th.id === activeId) ?? null
  const streaming = useChat((s) => (thread ? s.streaming[thread.id] : undefined))
  const chatOpen = useApp((s) => s.settings?.ui.chatOpen ?? true)
  const [editing, setEditing] = useState<Thread | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // The views slide only when the user goes from one to the other, not when the panel first shows.
  const shownView = useRef(listOpen)
  const switched = useRef(false)
  if (shownView.current !== listOpen) {
    shownView.current = listOpen
    switched.current = true
  }

  // Open the most recent thread when the book opens. An open thread list stays open.
  useEffect(() => {
    if (!activeId && threads.length) useChat.setState({ activeThreadId: latest(threads)?.id ?? null })
  }, [activeId, threads])

  // Keep the newest message in view.
  const count = thread?.messages.length ?? 0
  const lastUserId = useMemo(() => {
    for (let i = count - 1; i >= 0; i--) if (thread?.messages[i].role === 'user') return thread.messages[i].id
    return ''
  }, [thread, count])
  // The thread and the message of the user that the view last jumped to.
  const jumped = useRef('')
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) {
      jumped.current = ''
      return
    }
    // An empty thread shows its welcome text from the top.
    if (!count && !streaming) {
      el.scrollTo({ top: 0 })
      jumped.current = ''
      return
    }
    // A thread that opens, and a new message of the user: go to the end at once, so the whole message shows.
    const key = `${activeId}|${lastUserId}`
    if (key !== jumped.current) {
      jumped.current = key
      el.scrollTop = el.scrollHeight
      return
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (nearBottom || !streaming) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [count, streaming?.text.length, streaming?.thinking?.length, activeId, Boolean(streaming), listOpen, lastUserId])

  // The user sees the thread when the chat is open, the thread shows and the window shows. Then its new reply is seen.
  const lastReply = thread ? lastReplyAt(thread) : ''
  useEffect(() => {
    if (!thread || !chatOpen || streaming || listOpen) return
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
  }, [thread?.id, chatOpen, lastReply, Boolean(streaming), listOpen])

  // Edit, Rewind and Retry wait while the thread works. The planning sync thread has its own requests.
  const canAct = Boolean(thread) && !streaming && thread?.id !== SYNC_THREAD_ID

  const create = (): void => {
    const th = newThread()
    useBook.getState().saveThread(th, true)
    setActive(th.id)
    focusComposer(50)
  }
  const open = (id: string): void => {
    setActive(id)
    focusComposer(50)
  }
  const askDelete = (th: Thread): void =>
    void askConfirm({
      title: t.chat.deleteTitle(threadTitle(t, th.title)),
      message: t.chat.deleteMessage,
      confirm: t.common.delete,
      danger: true
    }).then(async (ok) => {
      if (!ok) return
      const wasActive = th.id === useChat.getState().activeThreadId
      const others = useBook.getState().threads.length > 1
      await useBook.getState().deleteThread(th.id)
      if (!wasActive) return
      useChat.setState({ activeThreadId: null })
      // The other threads show, so the user picks the next one. Without other threads, the empty chat shows.
      setListOpen(others)
    })

  return (
    <aside className="chat-panel" aria-label={t.chat.panel}>
      {listOpen ? (
        <ThreadList
          threads={threads}
          animate={switched.current}
          onOpen={open}
          onCreate={create}
          onEdit={setEditing}
          onDelete={askDelete}
          onClose={
            thread
              ? () => {
                  setListOpen(false)
                  focusComposer(50)
                }
              : undefined
          }
        />
      ) : (
        <div className={clsx('chat-view chat-thread', switched.current && 'is-entering')}>
          <ThreadHead thread={thread} onList={() => setListOpen(true)} onCreate={create} onEdit={setEditing} onDelete={askDelete} />
          {thread?.brief && (
            <Tooltip label={t.chat.editPurpose}>
              <button className={clsx('chat-brief', scrolled && 'is-scrolled')} onClick={() => setEditing(thread)}>
                <Target size={14} className="chat-brief-icon" aria-hidden />
                <span className="chat-brief-text">
                  <span className="caps">{t.chat.purpose}</span> {threadBrief(t, thread.brief)}
                </span>
              </button>
            </Tooltip>
          )}

          <div className="chat-scroll" ref={scrollRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}>
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
        </div>
      )}
      <ThreadEditor thread={editing} onClose={() => setEditing(null)} />
      <RewindHost />
    </aside>
  )
}

/** The header of a thread: back to the list, the title (it opens the title and the purpose), New thread, the options. */
function ThreadHead({
  thread,
  onList,
  onCreate,
  onEdit,
  onDelete
}: {
  thread: Thread | null
  onList: () => void
  onCreate: () => void
  onEdit: (th: Thread) => void
  onDelete: (th: Thread) => void
}): React.JSX.Element {
  const t = useT()
  // A dot on the back button when another thread needs the user.
  const elsewhere = useChatAttention(thread?.id)
  const backLabel = elsewhere
    ? `${t.chat.allThreads} (${elsewhere === 'needs-you' ? t.chat.statusNeedsYouShort : t.chat.statusUnseen})`
    : t.chat.allThreads
  return (
    <header className="chat-head">
      <IconButton className="chat-back" label={backLabel} onClick={onList}>
        <ArrowLeft size={16} />
        {elsewhere && <span className={clsx('chat-back-dot', `is-${elsewhere}`)} aria-hidden />}
      </IconButton>
      {thread ? (
        <Tooltip label={t.chat.titleAndPurpose}>
          <button className="chat-title" onClick={() => onEdit(thread)}>
            {thread.pinned && <PushPin size={12} weight="fill" aria-hidden />}
            <span>{threadTitle(t, thread.title)}</span>
          </button>
        </Tooltip>
      ) : (
        <span className="chat-title is-static">
          <span>{t.chat.newThread}</span>
        </span>
      )}
      <div className="chat-head-actions">
        <IconButton label={t.chat.newThread} onClick={onCreate}>
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
            <ThreadMenuItems thread={thread} onEdit={onEdit} onDelete={onDelete} />
          </Menu>
        )}
      </div>
    </header>
  )
}

function ThreadMenuItems({ thread, onEdit, onDelete }: { thread: Thread; onEdit: (th: Thread) => void; onDelete: (th: Thread) => void }): React.JSX.Element {
  const t = useT()
  return (
    <>
      <MenuItem icon={<NotePencil size={15} />} onSelect={() => onEdit(thread)}>
        {t.chat.titleAndPurpose}
      </MenuItem>
      <MenuItem icon={<PushPin size={15} />} onSelect={() => useBook.getState().saveThread({ ...thread, pinned: !thread.pinned })}>
        {thread.pinned ? t.chat.unpin : t.chat.pin}
      </MenuItem>
      <MenuSeparator />
      <MenuItem danger icon={<Trash size={15} />} onSelect={() => onDelete(thread)}>
        {t.chat.deleteThread}
      </MenuItem>
    </>
  )
}

/** Lower case, without accents: "José" matches "jose". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/**
 * All the threads of the book, in the full height of the panel: the pinned threads first, then the others,
 * the most recent first. Each thread shows its state (a dot or a spinner), its time and one line.
 * Keys: Up and Down go through the list, Enter opens a thread, Esc goes back to the open thread.
 */
function ThreadList({
  threads,
  animate,
  onOpen,
  onCreate,
  onEdit,
  onDelete,
  onClose
}: {
  threads: Thread[]
  animate: boolean
  onOpen: (id: string) => void
  onCreate: () => void
  onEdit: (th: Thread) => void
  onDelete: (th: Thread) => void
  /** Back to the open thread. Not set when no thread is open. */
  onClose?: () => void
}): React.JSX.Element {
  const t = useT()
  const [q, setQ] = useState('')
  const statuses = useThreadStatuses()
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { pinned, recent } = useMemo(() => {
    const f = fold(q.trim())
    const all = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const shown = f ? all.filter((th) => fold(`${threadTitle(t, th.title)} ${threadBrief(t, th.brief)} ${th.digest}`).includes(f)) : all
    return { pinned: shown.filter((th) => th.pinned), recent: shown.filter((th) => !th.pinned) }
  }, [threads, q, t])
  const first = pinned[0] ?? recent[0]

  // Focus goes from item to item with the arrow keys. Up from the first item goes back to the search.
  const items = (): HTMLButtonElement[] => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('.thread-item') ?? [])
  const onItemKey = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    const all = items()
    const i = all.indexOf(e.currentTarget)
    let next: HTMLElement | undefined
    if (e.key === 'ArrowDown') next = all[i + 1]
    else if (e.key === 'ArrowUp') next = i > 0 ? all[i - 1] : (searchRef.current ?? undefined)
    else if (e.key === 'Home') next = all[0]
    else if (e.key === 'End') next = all[all.length - 1]
    else return
    e.preventDefault()
    next?.focus()
    next?.scrollIntoView({ block: 'nearest' })
  }

  const row = (th: Thread): React.JSX.Element => {
    const st = statuses[th.id] ?? { state: null, pending: 0 }
    const statusText =
      st.state === 'working' ? t.chat.statusWorking : st.state === 'needs-you' ? t.chat.statusNeedsYou(st.pending) : st.state === 'unseen' ? t.chat.statusUnseen : ''
    // No row looks selected: in the list, the user is in no thread.
    return (
      <div key={th.id} className={clsx('thread-row', st.state && `has-${st.state}`)} role="listitem">
        <button className="thread-item" onClick={() => onOpen(th.id)} onKeyDown={onItemKey}>
          <StatusDot state={st.state} className="thread-item-dot" />
          <span className="thread-item-main">
            <span className="thread-item-top">
              <span className="thread-item-title">
                {th.pinned && <PushPin size={11} weight="fill" aria-hidden />}
                <span>{threadTitle(t, th.title)}</span>
              </span>
              <span className="thread-item-time">{timeAgo(th.updatedAt, t.common.locale)}</span>
            </span>
            <span className={clsx('thread-item-sub', statusText && 'is-status')}>
              {statusText || threadBrief(t, th.brief) || firstLine(th.digest) || t.chat.messages(th.messages.length)}
            </span>
          </span>
        </button>
        <Menu
          align="end"
          trigger={
            <IconButton className="thread-row-menu" label={t.chat.threadOptions} side="left">
              <DotsThree size={16} weight="bold" />
            </IconButton>
          }
        >
          <ThreadMenuItems thread={th} onEdit={onEdit} onDelete={onDelete} />
        </Menu>
      </div>
    )
  }

  return (
    <div
      className={clsx('chat-view thread-view', animate && 'is-entering')}
      onKeyDown={(e) => {
        // Esc in an open menu or dialog closes only that.
        if (e.key !== 'Escape' || e.defaultPrevented || !onClose || !e.currentTarget.contains(e.target as Node)) return
        e.preventDefault()
        onClose()
      }}
    >
      <header className="chat-head">
        <h2 className="chat-list-title">{t.chat.threads}</h2>
        <div className="chat-head-actions">
          <Button size="sm" variant="secondary" className="thread-new" icon={<Plus size={13} />} onClick={onCreate}>
            {t.chat.newThread}
          </Button>
        </div>
      </header>
      <div className="thread-search-wrap">
        <MagnifyingGlass size={14} aria-hidden />
        <input
          ref={searchRef}
          className="thread-search"
          aria-label={t.chat.searchThreads}
          placeholder={t.chat.searchThreads}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              items()[0]?.focus()
            } else if (e.key === 'Enter' && first) {
              e.preventDefault()
              onOpen(first.id)
            } else if (e.key === 'Escape' && q) {
              // Esc clears the search first.
              e.preventDefault()
              setQ('')
            }
          }}
        />
      </div>
      <div className="thread-list" ref={listRef} role="list" aria-label={t.chat.threads}>
        {threads.length === 0 && <p className="thread-none">{t.chat.noThreads}</p>}
        {threads.length > 0 && !first && <p className="thread-none">{t.chat.noMatches(q.trim())}</p>}
        {pinned.length > 0 && (
          <p className="caps thread-group" aria-hidden>
            {t.chat.pinned}
          </p>
        )}
        {pinned.map(row)}
        {pinned.length > 0 && recent.length > 0 && (
          <p className="caps thread-group" aria-hidden>
            {t.chat.recent}
          </p>
        )}
        {recent.map(row)}
      </div>
    </div>
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
                // Save the newest version of the thread: a reply can arrive while the dialog is open.
                const now = useBook.getState().threads.find((th) => th.id === thread.id) ?? thread
                useBook.getState().saveThread({ ...now, title: next && next !== shownTitle ? next : now.title, brief: brief.trim() })
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
                focusComposer()
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

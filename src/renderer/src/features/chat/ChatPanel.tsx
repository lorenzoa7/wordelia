import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Broom, DotsThree, MagnifyingGlass, NotePencil, Plus, PushPin, Target, Trash } from '@phosphor-icons/react'
import clsx from 'clsx'
import type { Thread } from '@shared/types'
import { Button, Dialog, Field, IconButton, Menu, MenuItem, MenuSeparator, TextArea, TextInput, Tooltip } from '@/ui'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { toast } from '@/stores/ui'
import { oldPending } from '@shared/proposals/state'
import { SYNC_THREAD_ID } from '@/features/plan/sync'
import { dropMessageComments, putBackComments } from '@/features/read/store'
import { composerEditor, draftKey, ensureBlank, focusComposer, useChat, worthKeeping } from './chatStore'
import { askConfirm } from '@/ui/prompt'
import { newThread, stopReply, threadBrief, threadTitle } from './send'
import { MessageView, StreamingMessage } from './MessageView'
import { Composer } from './Composer'
import { RewindHost } from './RewindDialog'
import { lastReplyAt, markSeen, StatusDot, useChatAttention, useThreadStatuses } from './status'
import { dropDraft, hasMessages, isUnsaved, keptThreads, latestThread, saveThreadChange, startThread } from './threads'
import { useFollowEnd } from './follow'
import { trashUnusedImages } from './images'
import { rejectManyWithUndo } from './undo'
import { formatCost, sumUsage } from './usage'
import { isE2E } from '@/lib/api'
import './chat.css'

export function ChatPanel(): React.JSX.Element {
  const t = useT()
  const threads = useBook((s) => s.threads)
  const activeId = useChat((s) => s.activeThreadId)
  const blank = useChat((s) => s.blank)
  const listOpen = useChat((s) => s.listOpen)
  const setActive = useChat((s) => s.setActiveThread)
  const setListOpen = useChat((s) => s.setListOpen)
  const saved = threads.find((th) => th.id === activeId) ?? null
  // The thread that shows: the blank new thread, else the open thread.
  const thread = blank ?? saved
  const streaming = useChat((s) => (thread ? s.streaming[thread.id] : undefined))
  const chatOpen = useApp((s) => s.settings?.ui.chatOpen ?? true)
  const [editing, setEditing] = useState<Thread | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [messagesEl, setMessagesEl] = useState<HTMLDivElement | null>(null)

  // The views slide only when the user goes from one to the other, not when the panel first shows.
  const shownView = useRef(listOpen)
  const switched = useRef(false)
  if (shownView.current !== listOpen) {
    shownView.current = listOpen
    switched.current = true
  }

  // No open thread (a book without threads, or the open thread was deleted): show a blank thread.
  // An open thread that is not in the book yet (the planning sync makes its thread) does not get one.
  useLayoutEffect(() => {
    if (!listOpen && !blank && !activeId) ensureBlank(newThread())
  }, [listOpen, blank, activeId])

  // Hooks for end-to-end tests and screenshots.
  useEffect(() => {
    const hooks = isE2E() ? (window as unknown as { __wordelia?: Record<string, unknown> }).__wordelia : undefined
    if (hooks) hooks.chat = useChat
  }, [])

  // Keep the newest message in view.
  const count = thread?.messages.length ?? 0
  const lastUserId = useMemo(() => {
    for (let i = count - 1; i >= 0; i--) if (thread?.messages[i].role === 'user') return thread.messages[i].id
    return ''
  }, [thread, count])
  const follow = useFollowEnd(scrollEl, messagesEl, Boolean(streaming))
  // The thread and the message of the user that the view last jumped to.
  const jumped = useRef('')
  useLayoutEffect(() => {
    if (!scrollEl) {
      jumped.current = ''
      return
    }
    // An empty thread shows its welcome text from the top.
    if (!count && !streaming) {
      scrollEl.scrollTop = 0
      jumped.current = ''
      return
    }
    // A thread that opens, and a new message of the user: go to the end at once, and stay there while the
    // layout settles and the reply streams, so the whole message and the start of the reply show.
    const key = `${thread?.id}|${lastUserId}`
    if (key !== jumped.current) {
      jumped.current = key
      follow()
    }
  }, [scrollEl, count, Boolean(streaming), thread?.id, lastUserId, follow])

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

  const open = (id: string): void => {
    // A new thread without messages that the user left: it shows again as the new thread.
    const kept = keptThreads().find((th) => th.id === id) ?? (useChat.getState().blank?.id === id ? useChat.getState().blank : null)
    if (kept) useChat.getState().openBlank(kept)
    else setActive(id)
    focusComposer(50)
  }
  const askDelete = (th: Thread): void => {
    // A new thread is not on disk: it goes away at once, and Undo brings it back.
    if (isUnsaved(th.id)) {
      const root = useBook.getState().root ?? ''
      const gone = useChat.getState().discardKept(th.id)
      let back = false
      toast(t.chat.newThreadRemoved, {
        ms: 8000,
        action: {
          label: t.common.undo,
          run: () => {
            back = true
            const s = useChat.getState()
            useChat.setState({
              kept: { ...s.kept, [root]: [th, ...(s.kept[root] ?? []).filter((x) => x.id !== th.id)] },
              drafts: { ...s.drafts, [draftKey(root, th.id)]: gone }
            })
          }
        }
      })
      // The images of its draft go to the trash when Undo is not used.
      if (gone.images.length) setTimeout(() => !back && void trashUnusedImages(gone.images.map((i) => i.file)), 8500)
      return
    }
    void askConfirm({
      title: t.chat.deleteTitle(threadTitle(t, th.title)),
      message: t.chat.deleteMessage,
      confirm: t.common.delete,
      danger: true
    }).then(async (ok) => {
      if (!ok) return
      // A reply in progress stops: the thread goes away.
      const replying = useChat.getState().streaming[th.id]?.messageId
      stopReply(th.id)
      const wasActive = th.id === useChat.getState().activeThreadId
      const latest = useBook.getState().threads.find((x) => x.id === th.id) ?? th
      const trash = await useBook.getState().deleteThread(th.id)
      dropDraft(th.id)
      // The comments of its reads go with it; Undo brings them back with their states.
      const comments = dropMessageComments([...latest.messages.map((m) => m.id), ...(replying ? [replying] : [])])
      toast(t.chat.threadDeleted(threadTitle(t, latest.title)), {
        ms: 9000,
        action: {
          label: t.common.undo,
          run: () => {
            // Before the thread: its replies then find their comments in the list and do not make them again.
            putBackComments(comments)
            void useBook
              .getState()
              .restoreThread(latest, trash)
              .then(() => {
                if (wasActive) useChat.getState().setActiveThread(latest.id)
              })
          }
        }
      })
      if (!wasActive) return
      const next = latestThread(useBook.getState().threads)
      useChat.setState({ activeThreadId: next?.id ?? null })
      // The other threads show, so the user picks the next one (Esc opens the most recent). Without other threads, a blank thread shows.
      setListOpen(Boolean(next))
    })
  }

  return (
    <aside className="chat-panel" aria-label={t.chat.panel}>
      {listOpen ? (
        <ThreadList
          threads={threads}
          animate={switched.current}
          onOpen={open}
          onCreate={startThread}
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
          <ThreadHead thread={thread} saved={thread === saved} onList={() => setListOpen(true)} onCreate={startThread} onEdit={setEditing} onDelete={askDelete} />
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

          <div className="chat-scroll" ref={setScrollEl} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}>
            {!thread || (thread.messages.length === 0 && !streaming) ? (
              <ChatEmpty />
            ) : (
              <div className="chat-messages" ref={setMessagesEl} role="log" aria-live="polite" aria-relevant="additions">
                {thread.messages.map((m, i) => (
                  <MessageView key={m.id} message={m} thread={thread} index={i} after={thread.messages.length - 1 - i} canAct={canAct} />
                ))}
                {streaming && <StreamingMessage streaming={streaming} read={thread.messages[thread.messages.length - 1]?.read} threadId={thread.id} />}
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
  saved,
  onList,
  onCreate,
  onEdit,
  onDelete
}: {
  thread: Thread | null
  /** False for the blank thread: it has no options until its first message. */
  saved: boolean
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
        {thread && saved && (
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
  // The proposals of the earlier replies that wait: they are not in the text any more, and one click rejects them.
  const old = thread.id === SYNC_THREAD_ID ? [] : oldPending(thread.messages)
  const count = old.reduce((n, x) => n + x.keys.length, 0)
  return (
    <>
      <MenuItem icon={<NotePencil size={15} />} onSelect={() => onEdit(thread)}>
        {t.chat.titleAndPurpose}
      </MenuItem>
      <MenuItem icon={<PushPin size={15} />} onSelect={() => saveThreadChange({ ...thread, pinned: !thread.pinned })}>
        {thread.pinned ? t.chat.unpin : t.chat.pin}
      </MenuItem>
      {count > 0 && (
        <MenuItem icon={<Broom size={15} />} onSelect={() => rejectManyWithUndo(thread, old)}>
          <span title={t.chat.dismissOldHint}>{t.chat.dismissOld(count)}</span>
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem danger icon={<Trash size={15} className="icon-trash" />} onSelect={() => onDelete(thread)}>
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
  threads: all,
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
  const root = useBook((s) => s.root ?? '')
  const kept = useChat((s) => s.kept[root])
  const blank = useChat((s) => s.blank)
  const blankKept = useChat((s) => Boolean(s.blank && worthKeeping(s.blank, s)))
  // A thread without messages does not show, except a new thread that the user gave a title, a purpose, a model or a draft.
  const threads = useMemo(
    () => [...(blank && blankKept ? [blank] : []), ...(kept ?? []), ...all.filter(hasMessages)],
    [all, kept, blank, blankKept]
  )
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { pinned, recent } = useMemo(() => {
    const f = fold(q.trim())
    const sorted = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const shown = f ? sorted.filter((th) => fold(`${threadTitle(t, th.title)} ${threadBrief(t, th.brief)} ${th.digest}`).includes(f)) : sorted
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
              {statusText || threadBrief(t, th.brief) || firstLine(th.digest) || (th.messages.length ? t.chat.messages(th.messages.length) : t.chat.notStarted)}
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
  const used = thread ? sumUsage(thread.messages) : null
  const save = (): void => {
    if (thread) {
      const next = title.trim()
      // Save the newest version of the thread: a reply can arrive while the dialog is open.
      // A new thread keeps its title and purpose in the chat store until its first message saves it.
      const s = useChat.getState()
      const now =
        useBook.getState().threads.find((th) => th.id === thread.id) ??
        (s.blank?.id === thread.id ? s.blank : keptThreads().find((th) => th.id === thread.id)) ??
        thread
      saveThreadChange({ ...now, title: next && next !== shownTitle ? next : now.title, brief: brief.trim() })
    }
    onClose()
  }
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
          <Button variant="primary" onClick={save}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <Field label={t.chat.title}>
        {/* Enter saves, as in the other dialogs. */}
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              save()
            }
          }}
        />
      </Field>
      <Field label={t.chat.purpose} hint={t.chat.purposeHint}>
        {/* Enter starts a new line in the purpose; Ctrl+Enter saves. */}
        <TextArea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              save()
            }
          }}
        />
      </Field>
      {thread?.digest && (
        <Field label={t.chat.digest}>
          <div className="digest-box">{thread.digest}</div>
        </Field>
      )}
      {used && used.replies > 0 && (
        <Field label={t.chat.usageOfThread}>
          <p className="thread-usage">
            {t.chat.usage(t.common.number(used.inputTokens), t.common.number(used.outputTokens), used.costUsd !== null ? formatCost(used.costUsd, t.common.locale) : null)}{' '}
            {t.chat.usageReplies(used.replies)}
          </p>
        </Field>
      )}
    </Dialog>
  )
}

/** Put a suggestion in the composer. A typed draft stays: the suggestion goes after it, on a new line (Ctrl+Z takes it out). */
function suggest(text: string): void {
  const ed = composerEditor()
  if (!useChat.getState().draft.trim() || !ed) {
    useChat.getState().setDraft(text)
    focusComposer()
    return
  }
  ed.chain().focus('end').insertContent([{ type: 'hardBreak' }, { type: 'text', text }]).run()
}

function ChatEmpty(): React.JSX.Element {
  const t = useT()
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
              onClick={() => suggest(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

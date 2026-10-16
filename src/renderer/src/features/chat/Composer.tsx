import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, At, Quotes, Stop, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { effortChoices, nearestEffort } from '@shared/ai/effort'
import type { Mention, ModelChoice, ModelInfo, Thread } from '@shared/types'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { folderCategoryName, routeText, useT } from '@/lib/i18n'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/ui'
import { useChat } from './chatStore'
import { mentionLabel, sendMessage, stopReply } from './send'
import { MentionIcon } from './MessageView'

interface Candidate extends Mention {
  sub?: string
}

function useCandidates(query: string | null): Candidate[] {
  const t = useT()
  const chapters = useBook((s) => s.chapters)
  const entries = useBook((s) => s.entries)
  const threads = useBook((s) => s.threads)
  const categories = useBook((s) => s.manifest?.planning.categories)
  return useMemo(() => {
    if (query === null) return []
    const q = query.toLowerCase()
    const all: Candidate[] = [
      ...chapters.map((c, i) => ({ kind: 'chapter' as const, id: c.id, label: c.title, sub: t.chat.chapterNumber(i + 1) })),
      ...entries.map((e) => ({ kind: 'entry' as const, id: e.id, label: e.name, sub: folderCategoryName(t, e.category, categories ?? []) })),
      ...threads.map((th) => ({ kind: 'thread' as const, id: th.id, label: th.title, sub: t.chat.thread }))
    ]
    return all.filter((c) => mentionLabel(t, c).toLowerCase().includes(q)).slice(0, 8)
  }, [query, chapters, entries, threads, categories, t])
}

export function Composer({ thread }: { thread: Thread | null }): React.JSX.Element {
  const t = useT()
  const draft = useChat((s) => s.draft)
  const setDraft = useChat((s) => s.setDraft)
  const quotes = useChat((s) => s.quotes)
  const mentions = useChat((s) => s.mentions)
  const removeQuote = useChat((s) => s.removeQuote)
  const removeMention = useChat((s) => s.removeMention)
  const addMention = useChat((s) => s.addMention)
  const streaming = useChat((s) => (thread ? s.streaming[thread.id] : undefined))
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  const candidates = useCandidates(mentionQuery)

  // Grow with the text.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [draft])

  const onChange = (v: string): void => {
    setDraft(v)
    const el = ref.current
    const caret = el?.selectionStart ?? v.length
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(v.slice(0, caret))
    setMentionQuery(m ? m[2] : null)
    setHighlight(0)
  }

  const pick = (c: Candidate): void => {
    addMention({ kind: c.kind, id: c.id, label: c.label })
    const el = ref.current
    const caret = el?.selectionStart ?? draft.length
    const before = draft.slice(0, caret).replace(/@[^\s@]{0,30}$/, '')
    setDraft(before + draft.slice(caret))
    setMentionQuery(null)
    setTimeout(() => el?.focus(), 0)
  }

  const submit = (): void => {
    if (streaming) return
    void sendMessage(draft)
  }

  return (
    <div className="composer-wrap">
      {mentionQuery !== null && candidates.length > 0 && (
        <div className="mention-pop" role="listbox" id="mention-list" aria-label={t.chat.mentionList}>
          {candidates.map((c, i) => (
            <button
              key={`${c.kind}-${c.id}`}
              id={`mention-${i}`}
              role="option"
              aria-selected={i === highlight}
              tabIndex={-1}
              className={clsx('mention-option', i === highlight && 'is-active')}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(c)
              }}
            >
              <MentionIcon kind={c.kind} />
              <span className="mention-label">{mentionLabel(t, c)}</span>
              <span className="mention-sub">{c.sub}</span>
            </button>
          ))}
        </div>
      )}
      <div className={clsx('composer', streaming && 'is-busy')}>
        {(quotes.length > 0 || mentions.length > 0) && (
          <div className="composer-chips">
            {quotes.map((q) => (
              <span key={q.id} className="quote-chip" title={q.text}>
                <Quotes size={11} weight="fill" />
                <span className="quote-chip-text">{q.text}</span>
                <button onClick={() => removeQuote(q.id)} aria-label={t.chat.removeQuote}>
                  <X size={10} />
                </button>
              </span>
            ))}
            {mentions.map((m) => (
              <span key={m.id} className="mention-chip">
                <MentionIcon kind={m.kind} /> {mentionLabel(t, m)}
                <button onClick={() => removeMention(m.id)} aria-label={t.chat.removeMention}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          className="composer-input"
          rows={1}
          aria-label={t.chat.composer}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mentionQuery !== null && candidates.length > 0}
          aria-controls="mention-list"
          aria-activedescendant={mentionQuery !== null && candidates.length > 0 ? `mention-${highlight}` : undefined}
          placeholder={quotes.length ? t.chat.askQuote : t.chat.placeholder}
          value={draft}
          spellCheck
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (mentionQuery !== null && candidates.length) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlight((h) => (h + 1) % candidates.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlight((h) => (h - 1 + candidates.length) % candidates.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                pick(candidates[highlight])
                return
              }
              if (e.key === 'Escape') {
                setMentionQuery(null)
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="composer-row">
          <button
            className="composer-tool"
            onClick={() => {
              setDraft(draft + (draft && !draft.endsWith(' ') ? ' @' : '@'))
              setMentionQuery('')
              ref.current?.focus()
            }}
            aria-label={t.chat.mention}
          >
            <At size={15} />
          </button>
          <ModelPicker thread={thread} />
          <span className="composer-spacer" />
          {streaming ? (
            <button className="composer-send is-stop" onClick={() => thread && stopReply(thread.id)} aria-label={t.chat.stop}>
              <Stop size={14} weight="fill" />
            </button>
          ) : (
            <button className="composer-send" onClick={submit} disabled={!draft.trim() && !quotes.length} aria-label={t.chat.send}>
              <ArrowUp size={15} weight="bold" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ModelPicker({ thread }: { thread: Thread | null }): React.JSX.Element {
  const t = useT()
  const label = (r: ModelChoice | null, list?: ModelInfo[]): string => routeText(t, r, list, t.chat.notSet, t.chat.defaultModel)
  const settings = useApp((s) => s.settings)
  const models = useApp((s) => s.models)
  const status = useApp((s) => s.status)
  const route = thread?.route ?? settings?.routes.chat ?? null
  const ready = (Object.keys(models) as Array<keyof typeof models>).filter((p) => status[p]?.installed && status[p]?.loggedIn !== false)
  const current = route ? models[route.provider]?.find((m) => m.id === route.model) : undefined
  const efforts = route ? effortChoices(current, route.effort) : null

  const choose = (choice: ModelChoice | null): void => {
    if (!thread) {
      void useApp.getState().updateSettings({ routes: { ...settings!.routes, chat: choice } })
      return
    }
    useBook.getState().saveThread({ ...thread, route: choice })
  }

  return (
    <Menu
      side="top"
      trigger={
        <button className="composer-model" title={t.chat.modelForThread}>
          {label(route, route ? models[route.provider] : undefined)}
        </button>
      }
    >
      {thread && (
        <>
          <MenuItem checked={!thread.route} onSelect={() => choose(null)}>
            {t.chat.defaultRoute(label(settings?.routes.chat ?? null, settings?.routes.chat ? models[settings.routes.chat.provider] : undefined))}
          </MenuItem>
          <MenuSeparator />
        </>
      )}
      {ready.map((p) => (
        <div key={p}>
          <MenuLabel>{label({ provider: p, model: '' }).split(' · ')[0]}</MenuLabel>
          {(models[p] ?? []).slice(0, 8).map((m) => (
            <MenuItem
              key={m.id}
              shortcut={m.resolvedLabel}
              checked={route?.provider === p && route.model === m.id}
              onSelect={() => {
                const effort = route?.effort ? nearestEffort(route.effort, m) : undefined
                choose({ provider: p, model: m.id, ...(effort ? { effort } : {}) })
              }}
            >
              {m.label}
            </MenuItem>
          ))}
        </div>
      ))}
      {ready.length === 0 && <MenuItem disabled>{t.chat.noAi}</MenuItem>}
      {route && efforts && (
        <>
          <MenuSeparator />
          <MenuLabel>{t.chat.effort}</MenuLabel>
          <MenuItem checked={!route.effort} onSelect={() => choose({ provider: route.provider, model: route.model })}>
            {t.chat.defaultEffort(
              current?.defaultEffort ? t.common.efforts[current.defaultEffort] : undefined,
              route.provider === 'claude-code' || route.provider === 'codex'
            )}
          </MenuItem>
          {efforts.map((e) => (
            <MenuItem key={e} checked={route.effort === e} onSelect={() => choose({ provider: route.provider, model: route.model, effort: e })}>
              {t.common.efforts[e]}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  )
}

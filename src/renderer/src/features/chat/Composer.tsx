import { useEffect, useMemo, useRef, useState } from 'react'
import { DropdownMenu } from 'radix-ui'
import { ArrowUp, At, CaretDown, CaretRight, Check, Quotes, Stop, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { effortChoices, nearestEffort } from '@shared/ai/effort'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import type { Messages } from '@shared/i18n'
import type { Mention, ModelChoice, ModelInfo, ProviderId, Thread } from '@shared/types'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { folderCategoryName, useT } from '@/lib/i18n'
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

const PER_PROVIDER = 8

/** "Opus 5.5 · Medium": the model and the effort of a route, without the provider. */
function shortRoute(t: Messages, route: ModelChoice, list: ModelInfo[] | undefined): string {
  const m = list?.find((x) => x.id === route.model)
  const effort = route.effort ?? m?.defaultEffort
  return [m?.label ?? (route.model || t.chat.defaultModel), effort ? t.common.efforts[effort] : ''].filter(Boolean).join(' · ')
}

/**
 * The model of the thread, like the model menu of the Claude app: the models with their versions
 * and a check on the current one, number keys 1–9 to pick, and an Effort item with a submenu.
 */
function ModelPicker({ thread }: { thread: Thread | null }): React.JSX.Element {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const models = useApp((s) => s.models)
  const status = useApp((s) => s.status)
  const [open, setOpen] = useState(false)
  const route = thread?.route ?? settings?.routes.chat ?? null
  const ready = (Object.keys(models) as ProviderId[]).filter((p) => status[p]?.installed && status[p]?.loggedIn !== false && models[p]?.length)
  const current = route ? models[route.provider]?.find((m) => m.id === route.model) : undefined
  const efforts = route ? effortChoices(current, route.effort) : null
  const effort = route?.effort ?? current?.defaultEffort

  // Each provider shows its first models, and always the current one.
  const groups = ready.map((p) => {
    const all = models[p] ?? []
    const shown = all.slice(0, PER_PROVIDER)
    const cur = route?.provider === p ? all.find((m) => m.id === route.model) : undefined
    if (cur && !shown.includes(cur)) shown.push(cur)
    return { provider: p, models: shown }
  })
  const flat = groups.flatMap((g) => g.models.map((m) => ({ provider: g.provider, model: m })))

  const choose = (choice: ModelChoice | null): void => {
    if (!thread) {
      void useApp.getState().updateSettings({ routes: { ...settings!.routes, chat: choice } })
      return
    }
    useBook.getState().saveThread({ ...thread, route: choice })
  }
  const pick = (p: ProviderId, m: ModelInfo): void => {
    const e = route?.effort ? nearestEffort(route.effort, m) : undefined
    choose({ provider: p, model: m.id, ...(e ? { effort: e } : {}) })
  }

  const defaultRoute = settings?.routes.chat ?? null
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button className="composer-model" title={t.chat.modelForThread}>
          <span>{route ? shortRoute(t, route, models[route.provider]) : t.chat.notSet}</span>
          <CaretDown size={10} weight="bold" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          className="menu model-menu"
          aria-label={t.chat.modelForThread}
          onKeyDown={(e) => {
            // 1–9 picks a model, as in the Claude app.
            const n = Number(e.key)
            if (!Number.isInteger(n) || n < 1 || n > 9 || e.ctrlKey || e.altKey || e.metaKey) return
            const item = flat[n - 1]
            if (!item) return
            e.preventDefault()
            pick(item.provider, item.model)
            setOpen(false)
          }}
        >
          {groups.map((g) => (
            <DropdownMenu.Group key={g.provider}>
              {ready.length > 1 && <DropdownMenu.Label className="menu-label caps model-provider">{PROVIDER_LABELS[g.provider].name}</DropdownMenu.Label>}
              {g.models.map((m) => {
                const n = flat.findIndex((x) => x.provider === g.provider && x.model.id === m.id) + 1
                const checked = route?.provider === g.provider && route.model === m.id
                return (
                  <DropdownMenu.Item
                    key={m.id}
                    className={clsx('menu-item model-item', checked && 'is-current')}
                    role="menuitemradio"
                    aria-checked={checked}
                    onSelect={() => pick(g.provider, m)}
                  >
                    <span className="model-item-name">{m.label}</span>
                    <span className="model-item-check">{checked && <Check size={14} weight="bold" />}</span>
                    <span className="model-item-key">{n <= 9 ? n : ''}</span>
                  </DropdownMenu.Item>
                )
              })}
            </DropdownMenu.Group>
          ))}
          {ready.length === 0 && (
            <DropdownMenu.Item className="menu-item" disabled>
              {t.chat.noAi}
            </DropdownMenu.Item>
          )}
          {route && efforts && (
            <>
              <DropdownMenu.Separator className="menu-sep" />
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className="menu-item model-item model-sub">
                  <span className="model-item-name">{t.chat.effort}</span>
                  <span className="model-sub-value">{effort ? t.common.efforts[effort] : t.chat.defaultEffort(undefined, route.provider === 'claude-code' || route.provider === 'codex')}</span>
                  <CaretRight size={11} className="model-sub-caret" />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className="menu model-menu" sideOffset={6} alignOffset={-5}>
                    {efforts.map((e) => (
                      <DropdownMenu.Item
                        key={e}
                        className={clsx('menu-item model-item', route.effort === e && 'is-current')}
                        role="menuitemradio"
                        aria-checked={route.effort === e}
                        onSelect={() => choose({ provider: route.provider, model: route.model, effort: e })}
                      >
                        <span className="model-item-name">{t.common.efforts[e]}</span>
                        <span className="model-item-check">{route.effort === e && <Check size={14} weight="bold" />}</span>
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            </>
          )}
          {thread?.route && defaultRoute && (
            <>
              <DropdownMenu.Separator className="menu-sep" />
              <DropdownMenu.Item className="menu-item model-item model-default" onSelect={() => choose(null)}>
                <span className="model-item-name">{t.chat.defaultRoute(shortRoute(t, defaultRoute, models[defaultRoute.provider]))}</span>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

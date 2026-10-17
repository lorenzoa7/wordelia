import { useEffect, useRef, useState } from 'react'
import { DropdownMenu } from 'radix-ui'
import { ArrowUp, At, CaretDown, CaretRight, Check, Quotes, Stop, X } from '@phosphor-icons/react'
import type { Editor } from '@tiptap/core'
import clsx from 'clsx'
import { effortChoices, nearestEffort } from '@shared/ai/effort'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import type { Messages } from '@shared/i18n'
import type { ModelChoice, ModelInfo, ProviderId, Thread } from '@shared/types'
import { useApp } from '@/stores/app'
import { useT } from '@/lib/i18n'
import { registerComposer, useChat } from './chatStore'
import { sendMessage, stopReply } from './send'
import { saveThreadChange } from './threads'
import { ChatInput } from './ChatInput'

export function Composer({ thread }: { thread: Thread | null }): React.JSX.Element {
  const t = useT()
  const hasText = useChat((s) => s.draft.trim().length > 0)
  const draftRev = useChat((s) => s.draftRev)
  const syncDraft = useChat((s) => s.syncDraft)
  const quotes = useChat((s) => s.quotes)
  const removeQuote = useChat((s) => s.removeQuote)
  const streaming = useChat((s) => (thread ? s.streaming[thread.id] : undefined))
  const [editor, setEditor] = useState<Editor | null>(null)
  // The content of the store when the composer shows (for example after the thread list).
  const [initial] = useState(() => useChat.getState().draftDoc)

  // Code outside the composer changed the draft (a suggestion, a mention from the Plan view, a sent message): load it.
  const loadedRev = useRef(draftRev)
  useEffect(() => {
    if (!editor || editor.isDestroyed || loadedRev.current === draftRev) return
    loadedRev.current = draftRev
    editor.commands.setContent((useChat.getState().draftDoc ?? '') as object, { emitUpdate: false })
    editor.commands.focus('end')
  }, [draftRev, editor])

  const submit = (): void => {
    if (useChat.getState().streaming[thread?.id ?? '']) return
    void sendMessage(useChat.getState().draft)
  }

  return (
    <div className="composer-wrap">
      <div className={clsx('composer', streaming && 'is-busy')}>
        {quotes.length > 0 && (
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
          </div>
        )}
        <ChatInput
          initial={initial}
          className="composer-input"
          ariaLabel={t.chat.composer}
          placeholder={quotes.length ? t.chat.askQuote : t.chat.placeholder}
          onChange={syncDraft}
          onEnter={submit}
          onReady={(e) => {
            setEditor(e)
            registerComposer(e)
          }}
        />
        <div className="composer-row">
          <button
            className="composer-tool"
            onClick={() => {
              if (!editor) return
              // "@" at the cursor opens the list of mentions. A space before it when the word goes on.
              const before = editor.state.selection.$from.nodeBefore
              const glued = before?.isText && !/\s$/.test(before.text ?? '')
              editor.chain().focus().insertContent(glued ? ' @' : '@').run()
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
            <button className="composer-send" onClick={submit} disabled={!hasText && !quotes.length} aria-label={t.chat.send}>
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
    // The blank thread keeps its model until its first message saves it.
    saveThreadChange({ ...thread, route: choice })
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

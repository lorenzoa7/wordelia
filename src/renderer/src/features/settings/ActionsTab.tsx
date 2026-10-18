import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowCounterClockwise, BookOpenText, Books, Plus, Star, Trash } from '@phosphor-icons/react'
import { freeShortcut } from '@shared/ai/shortcuts'
import { NEW_ACTION_CONTEXT, addToGroup, restoreBuiltIns, shortcutInBook, withoutShortcut, type ActionScope } from '@shared/ai/scopes'
import { newId } from '@shared/book'
import type { AiAction } from '@shared/types'
import { Button, IconButton, TextArea, TextInput, Tooltip } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { useApp } from '@/stores/app'
import { actionInstructions, actionName, useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { ActionIcon } from '@/features/actions/ActionIcon'
import { IconPicker } from './IconPicker'
import { ModelPicker } from './ModelPicker'
import { ShortcutField } from './ShortcutField'

const NONE: AiAction[] = []

/**
 * Settings → Actions. Two groups: the actions for all books (app settings) and, when a book is open, the
 * actions of this book (`ai/actions.json` in the book folder). "Use in" moves an action to the other group.
 */
export function ActionsTab(): React.JSX.Element | null {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const hasBook = useBook((s) => s.root !== null)
  const bookActions = useBook((s) => s.actions)
  const [selected, setSelected] = useState<{ scope: ActionScope; id: string } | null>(null)
  const t = useT()
  const ta = t.settings.actions
  if (!settings) return null

  const global = settings.actions
  const book = hasBook ? bookActions : NONE
  const group = (scope: ActionScope): AiAction[] => (scope === 'book' ? book : global)
  // The selected action, else the first global action (after a delete, or when the book closes).
  const current = selected && group(selected.scope).some((a) => a.id === selected.id) ? selected : global[0] ? { scope: 'global' as const, id: global[0].id } : null
  const scope: ActionScope = current?.scope ?? 'global'
  const action = current ? group(scope).find((a) => a.id === current.id) : undefined
  const isMain = scope === 'global' && action?.id === settings.defaultActionId
  // The shortcut checks see the two groups: the open book uses all these actions.
  const all = [...global, ...book]
  // A global action whose shortcut a book action has: the book action wins in this book.
  const overInBook = scope === 'global' && action ? shortcutInBook(action, book) : undefined

  const saveGroup = (s: ActionScope, next: AiAction[]): void => {
    if (s === 'book') useBook.getState().setActions(next)
    else void update({ actions: next })
  }
  const patch = (p: Partial<AiAction>): void => {
    if (action) saveGroup(scope, group(scope).map((a) => (a.id === action.id ? { ...a, ...p } : a)))
  }
  const setShortcut = (shortcut: string | undefined): void => {
    if (action) saveGroup(scope, group(scope).map((a) => (a.id === action.id ? (shortcut ? { ...a, shortcut } : withoutShortcut(a)) : a)))
  }

  const add = (s: ActionScope): void => {
    // The position of the new action in the list of the book: the global actions come first.
    const shortcut = freeShortcut(all, s === 'global' ? global.length : all.length)
    const a: AiAction = { id: newId('act'), name: ta.newAction, icon: 'Feather', builtIn: false, route: null, contextChars: NEW_ACTION_CONTEXT, instructions: '', ...(shortcut ? { shortcut } : {}) }
    saveGroup(s, [...group(s), a])
    setSelected({ scope: s, id: a.id })
  }
  const remove = async (): Promise<void> => {
    if (!action) return
    if (!(await askConfirm({ title: ta.deleteTitle(actionName(t, action)), message: ta.deleteMessage, confirm: t.common.delete, danger: true }))) return
    const next = group(scope).filter((a) => a.id !== action.id)
    saveGroup(scope, next)
    setSelected(next[0] ? { scope, id: next[0].id } : null)
  }
  const reset = async (): Promise<void> => {
    if (!(await askConfirm({ title: ta.resetTitle, message: ta.resetMessage, confirm: ta.restore }))) return
    const before = hasBook ? useBook.getState().actions : NONE
    const r = restoreBuiltIns(useApp.getState().settings?.actions ?? global, before)
    void update({ actions: r.global })
    // A built-in action of this book goes back to all books; an own action loses a shortcut that a built-in action gets back.
    if (r.book.length !== before.length || r.book.some((a, i) => a !== before[i])) useBook.getState().setActions(r.book)
  }
  /** Move the selected action to the other group. */
  const move = async (to: ActionScope): Promise<void> => {
    if (!action || to === scope || !hasBook || (to === 'book' && isMain)) return
    const name = actionName(t, action)
    // The other books lose a global action that moves to this book: ask first.
    if (to === 'book' && !(await askConfirm({ title: ta.toBookTitle(name), message: ta.toBookMessage, confirm: ta.toBookConfirm }))) return
    const globalNow = useApp.getState().settings?.actions ?? global
    const bookNow = useBook.getState().actions
    const r = addToGroup(to === 'book' ? bookNow : globalNow, action)
    // Add first, then remove: the action is always in one of the two groups.
    saveGroup(to, r.group)
    saveGroup(scope, (scope === 'book' ? bookNow : globalNow).filter((a) => a.id !== action.id))
    setSelected({ scope: to, id: r.action.id })
    if (r.taken && action.shortcut) toast(ta.movedWithoutShortcut(name, action.shortcut, actionName(t, r.taken)))
  }
  const openRules = (): void => useUi.getState().openSettings('rules')

  const item = (a: AiAction, s: ActionScope): React.JSX.Element => {
    const active = s === scope && a.id === action?.id
    const over = s === 'global' ? shortcutInBook(a, book) : undefined
    return (
      <button key={`${s}:${a.id}`} aria-current={active ? 'true' : undefined} className={clsx('action-item', active && 'is-active')} data-scope={s} onClick={() => setSelected({ scope: s, id: a.id })}>
        <ActionIcon name={a.icon} />
        <span className="action-item-name">{actionName(t, a)}</span>
        {s === 'global' && a.id === settings.defaultActionId && <Star size={11} weight="fill" className="action-star" aria-label={ta.isMain} />}
        {a.shortcut && (
          <span className={clsx('action-key', over && 'is-off')} title={over ? ta.shortcutInBook(a.shortcut, actionName(t, over)) : undefined}>
            {a.shortcut}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="actions-tab">
      <div className="actions-layout">
        <div className="actions-list">
          <div className="actions-group" role="group" aria-labelledby="actions-group-global">
            <div className="actions-group-head" id="actions-group-global">
              {ta.allBooks}
            </div>
            {global.map((a) => item(a, 'global'))}
            <div className="actions-list-foot">
              <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => add('global')} aria-label={ta.newForAll}>
                {ta.new}
              </Button>
              <IconButton label={ta.restoreDefaults} onClick={() => void reset()}>
                <ArrowCounterClockwise size={15} />
              </IconButton>
            </div>
          </div>
          {hasBook && (
            <div className="actions-group actions-group-book" role="group" aria-labelledby="actions-group-book">
              <div className="actions-group-head" id="actions-group-book">
                {ta.thisBook}
              </div>
              {book.length ? book.map((a) => item(a, 'book')) : <p className="actions-empty">{ta.bookEmpty}</p>}
              <div className="actions-list-foot">
                <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => add('book')} aria-label={ta.newForBook}>
                  {ta.new}
                </Button>
              </div>
            </div>
          )}
        </div>
        {action && (
          <div className="action-form" key={`${scope}:${action.id}`}>
            <div className="field">
              <span className="field-label">{ta.name}</span>
              <div className="action-name-row">
                <IconPicker value={action.icon} onChange={(icon) => patch({ icon })} label={ta.changeIcon} />
                <DraftInput key={`n-${action.id}-${settings.language}`} value={actionName(t, action)} onCommit={(v) => patch({ name: v })} />
              </div>
            </div>
            <div className="field">
              <span className="field-label">{ta.instructions}</span>
              <DraftArea key={`i-${action.id}-${settings.language}`} value={actionInstructions(t, action)} onCommit={(v) => patch({ instructions: v })} />
              <span className="field-hint">
                {ta.rulesNotePrefix}{' '}
                {hasBook ? (
                  <button className="link-btn" onClick={openRules}>
                    {ta.rulesNoteLink}
                  </button>
                ) : (
                  ta.rulesNoteLink
                )}{' '}
                {ta.rulesNoteSuffix}
              </span>
            </div>
            <div className="field">
              <span className="field-label">{ta.model}</span>
              <ModelPicker action={action} onChange={patch} />
            </div>
            <div className="field">
              <span className="field-label">{ta.shortcut}</span>
              <ShortcutField action={action} actions={all} onChange={setShortcut} />
              {overInBook && action.shortcut && <span className="field-hint shortcut-over">{ta.shortcutInBook(action.shortcut, actionName(t, overInBook))}</span>}
            </div>
            {hasBook && (
              <div className="field">
                <span className="field-label" id="action-scope-label">
                  {ta.useIn}
                </span>
                <div className="scope-switch" role="radiogroup" aria-labelledby="action-scope-label">
                  <button role="radio" aria-checked={scope === 'global'} className={clsx('scope-switch-btn', scope === 'global' && 'is-active')} onClick={() => void move('global')}>
                    <Books size={15} />
                    <span>{ta.allBooks}</span>
                  </button>
                  <button
                    role="radio"
                    aria-checked={scope === 'book'}
                    className={clsx('scope-switch-btn', scope === 'book' && 'is-active')}
                    disabled={isMain}
                    onClick={() => void move('book')}
                  >
                    <BookOpenText size={15} className="icon-book" />
                    <span>{ta.thisBook}</span>
                  </button>
                </div>
                <span className="field-hint">{isMain ? ta.mainForAll : scope === 'book' ? ta.bookHint : ta.globalHint}</span>
              </div>
            )}
            <div className="action-form-foot">
              {scope === 'global' ? (
                <Tooltip label={ta.mainHint}>
                  {isMain ? (
                    <span className="action-main" tabIndex={0}>
                      <Star size={13} weight="fill" /> {ta.isMain}
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" icon={<Star size={13} />} onClick={() => void update({ defaultActionId: action.id })}>
                      {ta.makeMain}
                    </Button>
                  )}
                </Tooltip>
              ) : (
                <span />
              )}
              <Button size="sm" variant="ghost" className="action-delete" icon={<Trash size={13} />} onClick={() => void remove()} disabled={scope === 'global' && global.length <= 1}>
                {t.common.delete}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Keep typing local; save after a pause and on blur, so the settings file is not written on every key. */
function useDraft(value: string, onCommit: (v: string) => void): [string, (v: string) => void, () => void] {
  const [draft, setDraft] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const commit = (): void => {
    clearTimeout(timer.current)
    if (draft !== value) onCommit(draft)
  }
  const change = (v: string): void => {
    setDraft(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onCommit(v), 600)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return [draft, change, commit]
}

function DraftInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }): React.JSX.Element {
  const [draft, change, commit] = useDraft(value, onCommit)
  const t = useT()
  return <TextInput value={draft} aria-label={t.settings.actions.nameAria} onChange={(e) => change(e.target.value)} onBlur={commit} />
}

function DraftArea({ value, onCommit }: { value: string; onCommit: (v: string) => void }): React.JSX.Element {
  const [draft, change, commit] = useDraft(value, onCommit)
  const t = useT()
  return <TextArea value={draft} rows={8} className="instructions" aria-label={t.settings.actions.instructions} onChange={(e) => change(e.target.value)} onBlur={commit} />
}

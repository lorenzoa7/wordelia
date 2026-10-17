import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowCounterClockwise, Plus, Star, Trash } from '@phosphor-icons/react'
import { DEFAULT_ACTIONS } from '@shared/ai/defaults'
import { freeShortcut, normalizeShortcut } from '@shared/ai/shortcuts'
import { newId } from '@shared/book'
import type { AiAction } from '@shared/types'
import { Button, IconButton, TextArea, TextInput, Tooltip } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { useApp } from '@/stores/app'
import { actionInstructions, actionName, useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { ActionIcon } from '@/features/actions/ActionIcon'
import { IconPicker } from './IconPicker'
import { ModelPicker } from './ModelPicker'
import { ShortcutField } from './ShortcutField'

/** An action without its shortcut. */
function withoutShortcut(a: AiAction): AiAction {
  const { shortcut, ...rest } = a
  void shortcut
  return rest
}

export function ActionsTab(): React.JSX.Element | null {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const [selected, setSelected] = useState<string | null>(null)
  const hasBook = useBook((s) => s.root !== null)
  const t = useT()
  const ta = t.settings.actions
  useEffect(() => {
    if (!selected && settings?.actions[0]) setSelected(settings.actions[0].id)
  }, [selected, settings?.actions])
  if (!settings) return null

  const actions = settings.actions
  const action = actions.find((a) => a.id === selected) ?? actions[0]
  const isMain = action?.id === settings.defaultActionId
  const save = (next: AiAction[]): void => void update({ actions: next })
  const patch = (p: Partial<AiAction>): void => save(actions.map((a) => (a.id === action.id ? { ...a, ...p } : a)))

  const add = (): void => {
    const shortcut = freeShortcut(actions, actions.length)
    const a: AiAction = { id: newId('act'), name: ta.newAction, icon: 'Feather', builtIn: false, route: null, contextChars: 2000, instructions: '', ...(shortcut ? { shortcut } : {}) }
    save([...actions, a])
    setSelected(a.id)
  }
  const remove = async (): Promise<void> => {
    if (!(await askConfirm({ title: ta.deleteTitle(actionName(t, action)), message: ta.deleteMessage, confirm: t.common.delete, danger: true }))) return
    const next = actions.filter((a) => a.id !== action.id)
    save(next)
    setSelected(next[0]?.id ?? null)
  }
  const reset = async (): Promise<void> => {
    if (!(await askConfirm({ title: ta.resetTitle, message: ta.resetMessage, confirm: ta.restore }))) return
    const builtIn = DEFAULT_ACTIONS.map((a) => ({ ...a }))
    // The built-in actions get their shortcuts back; an own action loses a shortcut that one of them uses now.
    const taken = new Set(builtIn.map((a) => a.shortcut))
    const own = actions.filter((a) => !a.builtIn).map((a) => (taken.has(normalizeShortcut(a.shortcut)) ? withoutShortcut(a) : a))
    save([...builtIn, ...own])
  }
  const openRules = (): void => useUi.getState().openSettings('rules')

  return (
    <div className="actions-tab">
      <div className="actions-layout">
        <div className="actions-list">
          {actions.map((a) => (
            <button key={a.id} aria-current={a.id === action?.id ? 'true' : undefined} className={clsx('action-item', a.id === action?.id && 'is-active')} onClick={() => setSelected(a.id)}>
              <ActionIcon name={a.icon} />
              <span className="action-item-name">{actionName(t, a)}</span>
              {a.id === settings.defaultActionId && <Star size={11} weight="fill" className="action-star" aria-label={ta.isMain} />}
              {a.shortcut && <span className="action-key">{a.shortcut}</span>}
            </button>
          ))}
          <div className="actions-list-foot">
            <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={add}>
              {ta.new}
            </Button>
            <IconButton label={ta.restoreDefaults} onClick={() => void reset()}>
              <ArrowCounterClockwise size={15} />
            </IconButton>
          </div>
        </div>
        {action && (
          <div className="action-form" key={action.id}>
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
              <ShortcutField action={action} actions={actions} onChange={(shortcut) => save(actions.map((a) => (a.id === action.id ? (shortcut ? { ...a, shortcut } : withoutShortcut(a)) : a)))} />
            </div>
            <div className="action-form-foot">
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
              <Button size="sm" variant="ghost" className="action-delete" icon={<Trash size={13} />} onClick={() => void remove()} disabled={actions.length <= 1}>
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

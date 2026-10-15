import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowCounterClockwise, Plus, Star, Trash } from '@phosphor-icons/react'
import { DEFAULT_ACTIONS } from '@shared/ai/defaults'
import { PROVIDER_LABELS, routeLabel } from '@shared/ai/routes'
import { newId } from '@shared/book'
import type { AiAction, Effort, ProviderId } from '@shared/types'
import { EFFORT_LABELS, effortChoices, nearestEffort } from '@shared/ai/effort'
import { Button, Field, IconButton, Select, TextArea, TextInput, Tooltip } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { RULES_CATEGORY } from '@/features/plan/PlanSidebar'
import { ACTION_ICON_NAMES, ActionIcon } from '@/features/actions/ActionIcon'

export function ActionsTab(): React.JSX.Element | null {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const models = useApp((s) => s.models)
  const [selected, setSelected] = useState<string | null>(null)
  const hasBook = useBook((s) => s.root !== null)
  useEffect(() => {
    if (!selected && settings?.actions[0]) setSelected(settings.actions[0].id)
  }, [selected, settings?.actions])
  if (!settings) return null

  const actions = settings.actions
  const action = actions.find((a) => a.id === selected) ?? actions[0]
  const save = (next: AiAction[]): void => void update({ actions: next })
  const patch = (p: Partial<AiAction>): void => save(actions.map((a) => (a.id === action.id ? { ...a, ...p } : a)))

  const add = (): void => {
    const a: AiAction = { id: newId('act'), name: 'New action', icon: 'Feather', builtIn: false, route: null, contextChars: 2000, instructions: '' }
    save([...actions, a])
    setSelected(a.id)
  }
  const remove = async (): Promise<void> => {
    if (!(await askConfirm({ title: `Delete “${action.name}”?`, message: 'This action will be removed.', confirm: 'Delete', danger: true }))) return
    const next = actions.filter((a) => a.id !== action.id)
    save(next)
    setSelected(next[0]?.id ?? null)
  }
  const reset = async (): Promise<void> => {
    if (!(await askConfirm({ title: 'Restore the default actions?', message: 'Your changes to the built-in actions will be lost. Your own actions stay.', confirm: 'Restore' }))) return
    save([...DEFAULT_ACTIONS.map((a) => ({ ...a })), ...actions.filter((a) => !a.builtIn)])
  }

  const providers = (Object.keys(PROVIDER_LABELS) as ProviderId[]).filter((p) => (models[p] ?? []).length > 0)
  const routeValue = action?.route ? `${action.route.provider}|${action.route.model}` : 'default'
  // The model that runs this action, and the efforts it accepts.
  const base = action?.route ?? settings.routes.action ?? settings.routes.chat
  const baseModel = base ? (models[base.provider] ?? []).find((m) => m.id === base.model) : undefined
  const efforts = base && action ? effortChoices(baseModel, action.effort) : null
  const effortNow = action?.effort ? nearestEffort(action.effort, baseModel) : base?.effort
  const effective = base ? { provider: base.provider, model: base.model, ...(effortNow ? { effort: effortNow } : {}) } : null

  return (
    <div className="actions-tab">
      <p className="settings-note">
        Actions run on selected text from the menu above the selection. Each action follows the{' '}
        {hasBook ? (
          <button
            className="link-btn"
            onClick={() => {
              useUi.getState().closeSettings()
              useBook.getState().selectCategory(RULES_CATEGORY)
            }}
          >
            writing rules of the book
          </button>
        ) : (
          'writing rules of the book'
        )}{' '}
        and reads the text around the selection.
      </p>
      <div className="actions-layout">
        <div className="actions-list">
          {actions.map((a, i) => (
            <button key={a.id} aria-current={a.id === action?.id ? 'true' : undefined} className={clsx('action-item', a.id === action?.id && 'is-active')} onClick={() => setSelected(a.id)}>
              <ActionIcon name={a.icon} />
              <span>{a.name}</span>
              {a.id === settings.defaultActionId ? (
                <Star size={12} weight="fill" className="action-star" />
              ) : (
                <span className="action-key">{i < 9 ? `Alt+${i + 1}` : ''}</span>
              )}
            </button>
          ))}
          <div className="actions-list-foot">
            <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={add}>
              New
            </Button>
            <Tooltip label="Restore the built-in actions">
              <IconButton label="Restore defaults" onClick={() => void reset()}>
                <ArrowCounterClockwise size={15} />
              </IconButton>
            </Tooltip>
          </div>
        </div>
        {action && (
          <div className="action-form" key={action.id}>
            <div className="action-form-row">
              <Field label="Name">
                <DraftInput key={`n-${action.id}`} value={action.name} onCommit={(v) => patch({ name: v })} />
              </Field>
              <Field label="Icon">
                <div className="icon-picker">
                  {ACTION_ICON_NAMES.map((n) => (
                    <button key={n} aria-pressed={action.icon === n} className={clsx('icon-choice', action.icon === n && 'is-active')} onClick={() => patch({ icon: n })} aria-label={n}>
                      <ActionIcon name={n} />
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Instructions" hint="What the AI must do with the selected text. Your writing rules are added automatically.">
              <DraftArea key={`i-${action.id}`} value={action.instructions} onCommit={(v) => patch({ instructions: v })} />
            </Field>
            <div className="action-form-row">
              <Field label="Model">
                <Select
                  value={routeValue}
                  onValueChange={(v) => {
                    if (v === 'default') patch({ route: null })
                    else {
                      const [provider, model] = v.split('|') as [ProviderId, string]
                      patch({ route: { provider, model } })
                    }
                  }}
                  options={[
                    { value: 'default', label: 'Same as Actions' },
                    ...providers.flatMap((p) =>
                      (models[p] ?? []).slice(0, 8).map((m) => ({ value: `${p}|${m.id}`, label: `${PROVIDER_LABELS[p].short} · ${m.label}` }))
                    )
                  ]}
                  ariaLabel="Model"
                />
              </Field>
              <Field label="Effort">
                {efforts ? (
                  <Select
                    value={action.effort ?? 'route'}
                    onValueChange={(v) => patch({ effort: v === 'route' ? undefined : (v as Effort) })}
                    options={[{ value: 'route', label: 'Same as the model' }, ...efforts.map((e) => ({ value: e, label: EFFORT_LABELS[e] }))]}
                    ariaLabel="Effort"
                  />
                ) : (
                  <span className="muted">This model has no effort setting.</span>
                )}
              </Field>
            </div>
            <p className="action-runs-on">
              Runs on <strong>{effective ? routeLabel(effective, models[effective.provider]) : 'no model yet'}</strong>
              {effective && !effective.effort && efforts
                ? effective.provider === 'claude-code' || effective.provider === 'codex'
                  ? ' (the CLI chooses the effort)'
                  : ' (the model chooses the effort)'
                : ''}
              . More effort is slower and uses more of your plan.
            </p>
            <Field label="Context around the selection">
              <Select
                value={String(action.contextChars)}
                onValueChange={(v) => patch({ contextChars: Number(v) })}
                options={[
                  { value: '300', label: 'A little (300 characters)' },
                  { value: '1500', label: 'Some (1,500)' },
                  { value: '3000', label: 'A lot (3,000)' },
                  { value: '8000', label: 'Most of the chapter (8,000)' }
                ].concat(
                  [300, 1500, 3000, 8000].includes(action.contextChars)
                    ? []
                    : [{ value: String(action.contextChars), label: `${action.contextChars.toLocaleString('en')} characters` }]
                )}
                ariaLabel="Context"
              />
            </Field>
            <div className="action-form-foot">
              <Button
                size="sm"
                variant={settings.defaultActionId === action.id ? 'secondary' : 'ghost'}
                icon={<Star size={13} weight={settings.defaultActionId === action.id ? 'fill' : 'regular'} />}
                onClick={() => void update({ defaultActionId: action.id })}
                disabled={settings.defaultActionId === action.id}
              >
                {settings.defaultActionId === action.id ? 'Main action (Ctrl+J)' : 'Make main action'}
              </Button>
              <Button size="sm" variant="danger" icon={<Trash size={13} />} onClick={() => void remove()} disabled={actions.length <= 1}>
                Delete
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
  return <TextInput value={draft} aria-label="Action name" onChange={(e) => change(e.target.value)} onBlur={commit} />
}

function DraftArea({ value, onCommit }: { value: string; onCommit: (v: string) => void }): React.JSX.Element {
  const [draft, change, commit] = useDraft(value, onCommit)
  return <TextArea value={draft} rows={9} className="instructions" aria-label="Instructions" onChange={(e) => change(e.target.value)} onBlur={commit} />
}

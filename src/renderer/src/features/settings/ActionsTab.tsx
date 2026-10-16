import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowCounterClockwise, Plus, Star, Trash } from '@phosphor-icons/react'
import { DEFAULT_ACTIONS } from '@shared/ai/defaults'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import { newId } from '@shared/book'
import type { AiAction, Effort, ProviderId } from '@shared/types'
import { effortChoices, nearestEffort } from '@shared/ai/effort'
import { Button, Field, IconButton, Select, TextArea, TextInput, Tooltip } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { useApp } from '@/stores/app'
import { actionName, routeText, useT } from '@/lib/i18n'
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
  const t = useT()
  const ta = t.settings.actions
  useEffect(() => {
    if (!selected && settings?.actions[0]) setSelected(settings.actions[0].id)
  }, [selected, settings?.actions])
  if (!settings) return null

  const actions = settings.actions
  const action = actions.find((a) => a.id === selected) ?? actions[0]
  const save = (next: AiAction[]): void => void update({ actions: next })
  const patch = (p: Partial<AiAction>): void => save(actions.map((a) => (a.id === action.id ? { ...a, ...p } : a)))

  const add = (): void => {
    const a: AiAction = { id: newId('act'), name: ta.newAction, icon: 'Feather', builtIn: false, route: null, contextChars: 2000, instructions: '' }
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
        {ta.notePrefix}{' '}
        {hasBook ? (
          <button
            className="link-btn"
            onClick={() => {
              useUi.getState().closeSettings()
              useBook.getState().selectCategory(RULES_CATEGORY)
            }}
          >
            {ta.noteRules}
          </button>
        ) : (
          ta.noteRules
        )}{' '}
        {ta.noteSuffix}
      </p>
      <div className="actions-layout">
        <div className="actions-list">
          {actions.map((a, i) => (
            <button key={a.id} aria-current={a.id === action?.id ? 'true' : undefined} className={clsx('action-item', a.id === action?.id && 'is-active')} onClick={() => setSelected(a.id)}>
              <ActionIcon name={a.icon} />
              <span>{actionName(t, a)}</span>
              {a.id === settings.defaultActionId ? (
                <Star size={12} weight="fill" className="action-star" />
              ) : (
                <span className="action-key">{i < 9 ? `Alt+${i + 1}` : ''}</span>
              )}
            </button>
          ))}
          <div className="actions-list-foot">
            <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={add}>
              {ta.new}
            </Button>
            <Tooltip label={ta.restoreBuiltIn}>
              <IconButton label={ta.restoreDefaults} onClick={() => void reset()}>
                <ArrowCounterClockwise size={15} />
              </IconButton>
            </Tooltip>
          </div>
        </div>
        {action && (
          <div className="action-form" key={action.id}>
            <div className="action-form-row">
              <Field label={ta.name}>
                <DraftInput key={`n-${action.id}`} value={actionName(t, action)} onCommit={(v) => patch({ name: v })} />
              </Field>
              <Field label={ta.icon}>
                <div className="icon-picker">
                  {ACTION_ICON_NAMES.map((n) => (
                    <button key={n} aria-pressed={action.icon === n} className={clsx('icon-choice', action.icon === n && 'is-active')} onClick={() => patch({ icon: n })} aria-label={n}>
                      <ActionIcon name={n} />
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label={ta.instructions} hint={ta.instructionsHint}>
              <DraftArea key={`i-${action.id}`} value={action.instructions} onCommit={(v) => patch({ instructions: v })} />
            </Field>
            <div className="action-form-row">
              <Field label={ta.model}>
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
                    { value: 'default', label: ta.sameAsActions },
                    ...providers.flatMap((p) =>
                      (models[p] ?? []).slice(0, 8).map((m) => ({ value: `${p}|${m.id}`, label: `${PROVIDER_LABELS[p].short} · ${m.label}` }))
                    )
                  ]}
                  ariaLabel={ta.model}
                />
              </Field>
              <Field label={ta.effort}>
                {efforts ? (
                  <Select
                    value={action.effort ?? 'route'}
                    onValueChange={(v) => patch({ effort: v === 'route' ? undefined : (v as Effort) })}
                    options={[{ value: 'route', label: ta.sameAsModel }, ...efforts.map((e) => ({ value: e, label: t.common.efforts[e] }))]}
                    ariaLabel={ta.effort}
                  />
                ) : (
                  <span className="muted">{ta.noEffort}</span>
                )}
              </Field>
            </div>
            <p className="action-runs-on">
              {ta.runsOn} <strong>{effective ? routeText(t, effective, models[effective.provider], ta.noModelYet, ta.defaultModel) : ta.noModelYet}</strong>
              {effective && !effective.effort && efforts
                ? effective.provider === 'claude-code' || effective.provider === 'codex'
                  ? ta.cliChooses
                  : ta.modelChooses
                : ''}
              {ta.runsOnTail}
            </p>
            <Field label={ta.context}>
              <Select
                value={String(action.contextChars)}
                onValueChange={(v) => patch({ contextChars: Number(v) })}
                options={[
                  { value: '300', label: ta.contextLittle },
                  { value: '1500', label: ta.contextSome },
                  { value: '3000', label: ta.contextLot },
                  { value: '8000', label: ta.contextMost }
                ].concat(
                  [300, 1500, 3000, 8000].includes(action.contextChars)
                    ? []
                    : [{ value: String(action.contextChars), label: ta.characters(action.contextChars) }]
                )}
                ariaLabel={ta.contextAria}
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
                {settings.defaultActionId === action.id ? ta.isMain : ta.makeMain}
              </Button>
              <Button size="sm" variant="danger" icon={<Trash size={13} />} onClick={() => void remove()} disabled={actions.length <= 1}>
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
  return <TextArea value={draft} rows={9} className="instructions" aria-label={t.settings.actions.instructions} onChange={(e) => change(e.target.value)} onBlur={commit} />
}

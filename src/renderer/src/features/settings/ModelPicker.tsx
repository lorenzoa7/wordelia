import { CaretDown } from '@phosphor-icons/react'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import { effortChoices, nearestEffort } from '@shared/ai/effort'
import type { AiAction, ModelChoice, ModelInfo, ProviderId } from '@shared/types'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/ui'
import { useT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { providerReady } from '@/features/actions/runAction'

/** "Opus 5.5" for the alias "opus" that answered as Claude Opus 5.5; else the label without "Claude". */
function modelName(m: ModelInfo): string {
  return (m.resolvedLabel ?? m.label).replace(/^Claude\s+/, '')
}

/**
 * One control for the model and the effort of an action: "Claude · Sonnet 5.5 · Medium", or
 * "Same as Actions (Claude · Sonnet 5.5)" when the action uses the model of Actions.
 */
export function ModelPicker({ action, onChange }: { action: AiAction; onChange: (patch: Partial<AiAction>) => void }): React.JSX.Element {
  const t = useT()
  const ta = t.settings.actions
  const settings = useApp((s) => s.settings!)
  const models = useApp((s) => s.models)

  const text = (route: ModelChoice | null): string => {
    if (!route) return ta.noModelYet
    const m = models[route.provider]?.find((x) => x.id === route.model)
    const model = m ? modelName(m) : route.model || ta.defaultModel
    return [PROVIDER_LABELS[route.provider].short, model, route.effort ? t.common.efforts[route.effort] : ''].filter(Boolean).join(' · ')
  }

  const providers = (Object.keys(PROVIDER_LABELS) as ProviderId[]).filter((p) => (models[p] ?? []).length > 0)
  // The model setting of the Actions task, and the model that runs this action.
  const taskRoute = settings.routes.action ?? settings.routes.chat
  // The model that runs: the model of Actions also when the provider of the action is not on this computer.
  useApp((s) => s.status) // a new check of a provider shows here at once
  const missing = action.route && providerReady(action.route.provider) === false && taskRoute ? action.route.provider : null
  const base = (missing ? null : action.route) ?? taskRoute
  const baseModel = base ? models[base.provider]?.find((m) => m.id === base.model) : undefined
  const efforts = base ? effortChoices(baseModel, action.effort) : null
  const effort = action.effort ? nearestEffort(action.effort, baseModel) : base?.effort
  const effective = base ? { provider: base.provider, model: base.model, ...(effort ? { effort } : {}) } : null
  const shown = !action.route && effective ? ta.sameAsActionsWith(text(effective)) : text(effective)
  const cli = base?.provider === 'claude-code' || base?.provider === 'codex'
  const defaultEffort = !action.route
    ? `${ta.sameAsActions}${taskRoute?.effort ? ` (${t.common.efforts[taskRoute.effort]})` : ''}`
    : t.settings.ai.defaultEffort(baseModel?.defaultEffort ? t.common.efforts[baseModel.defaultEffort] : undefined, cli)

  return (
    <>
      <Menu
        trigger={
          <button className="select model-pick" aria-label={`${ta.modelAria}: ${shown}`}>
            <span>{shown}</span>
            <CaretDown size={12} className="select-caret" />
          </button>
        }
        className="model-pick-menu"
      >
        <MenuItem checked={!action.route} onSelect={() => onChange({ route: null })} shortcut={taskRoute ? text(taskRoute) : undefined}>
          {ta.sameAsActions}
        </MenuItem>
        {providers.map((p) => (
          <div key={p}>
            <MenuSeparator />
            <MenuLabel>{PROVIDER_LABELS[p].short}</MenuLabel>
            {(models[p] ?? []).slice(0, 8).map((m) => (
              <MenuItem
                key={m.id}
                checked={action.route?.provider === p && action.route.model === m.id}
                shortcut={m.resolvedLabel}
                onSelect={() => onChange({ route: { provider: p, model: m.id } })}
              >
                {m.label}
              </MenuItem>
            ))}
          </div>
        ))}
        {efforts && (
          <>
            <MenuSeparator />
            <MenuLabel>{ta.effort}</MenuLabel>
            <MenuItem checked={!action.effort} onSelect={() => onChange({ effort: undefined })}>
              {defaultEffort}
            </MenuItem>
            {efforts.map((e) => (
              <MenuItem key={e} checked={action.effort === e} onSelect={() => onChange({ effort: e })}>
                {t.common.efforts[e]}
              </MenuItem>
            ))}
          </>
        )}
      </Menu>
      {missing && <span className="field-hint">{ta.modelMissing(PROVIDER_LABELS[missing]?.name ?? missing)}</span>}
    </>
  )
}

import { useState } from 'react'
import clsx from 'clsx'
import { ArrowCircleUp, ArrowsClockwise, CheckCircle, Info, Key, SignIn, Sparkle, Terminal, WarningCircle } from '@phosphor-icons/react'
import { PROVIDER_LABELS, suggestRoutes } from '@shared/ai/routes'
import { isOlderVersion } from '@shared/version'
import { effortChoices, nearestEffort } from '@shared/ai/effort'
import type { Effort, ModelChoice, ProviderId, TaskKind } from '@shared/types'
import { Button, Select, Spinner, Switch, TextInput, Tooltip } from '@/ui'
import { invoke } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { toast } from '@/stores/ui'

const PROVIDERS: ProviderId[] = ['claude-code', 'codex', 'anthropic', 'openai']
const TASKS: TaskKind[] = ['chat', 'action', 'sync', 'background']

/** Text with `backticks` around program commands: those parts show as code. */
function withCode(text: string): React.ReactNode {
  return text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))
}

export function AiTab(): React.JSX.Element | null {
  const settings = useApp((s) => s.settings)
  const t = useT()
  if (!settings) return null
  const a = t.settings.ai
  return (
    <div>
      <h3 className="settings-h">{a.connections}</h3>
      <p className="settings-note">{a.free}</p>
      <div className="provider-list">
        {PROVIDERS.map((p) => (
          <ProviderCard key={p} id={p} />
        ))}
      </div>
      <h3 className="settings-h">{a.modelsForTasks}</h3>
      <p className="settings-note">{a.modelsNote}</p>
      <p className="settings-note">
        <strong>{a.effortTerm}</strong> {a.effortNote}
      </p>
      <RoutesTable />
    </div>
  )
}

function ProviderCard({ id }: { id: ProviderId }): React.JSX.Element {
  const status = useApp((s) => s.status[id])
  const checking = useApp((s) => s.checking[id])
  const settings = useApp((s) => s.settings!)
  const models = useApp((s) => s.models[id])
  const check = useApp((s) => s.checkProvider)
  const update = useApp((s) => s.updateSettings)
  const [key, setKey] = useState('')
  const [showPath, setShowPath] = useState(false)
  const t = useT()
  const a = t.settings.ai
  const isApi = id === 'anthropic' || id === 'openai'
  const enabled = settings.providers[id]?.enabled !== false
  const ok = status?.installed && status.loggedIn !== false

  const saveKey = async (): Promise<void> => {
    await invoke('ai:setKey', id, key.trim() || null)
    setKey('')
    await update({ providers: { ...settings.providers, [id]: { ...settings.providers[id], enabled: true } } })
    const st = await check(id)
    toast(st.loggedIn ? a.providerConnected(PROVIDER_LABELS[id].name) : a.keyFailed(st.detail ?? ''), { kind: st.loggedIn ? 'info' : 'error' })
  }

  const useSuggested = async (): Promise<void> => {
    await update({ routes: suggestRoutes(id, models ?? []) })
    toast(a.allTasksUse(PROVIDER_LABELS[id].name))
  }

  return (
    <div className={clsx('provider-card', ok && enabled && 'is-ok', !enabled && 'is-off')}>
      <div className="provider-top">
        <span className="provider-icon">{isApi ? <Key size={16} /> : <Terminal size={16} />}</span>
        <div className="provider-title">
          <strong>{PROVIDER_LABELS[id].name}</strong>
          <span>{t.common.providerKind[id]}</span>
        </div>
        <span className="provider-state">
          {checking ? (
            <Spinner size={13} />
          ) : !status ? null : ok ? (
            <span className="state-ok">
              <CheckCircle size={14} weight="fill" /> {a.connected}
            </span>
          ) : (
            <span className="state-bad">
              <WarningCircle size={14} weight="fill" /> {!status.installed ? a.notInstalled : a.notConnected}
            </span>
          )}
        </span>
        <Tooltip label={a.checkAgain}>
          <button className="icon-btn" onClick={() => void check(id)} aria-label={a.checkAgain}>
            <ArrowsClockwise size={15} />
          </button>
        </Tooltip>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => void update({ providers: { ...settings.providers, [id]: { ...settings.providers[id], enabled: v } } })}
          label={a.use(PROVIDER_LABELS[id].name)}
        />
      </div>
      <p className="provider-help">
        <Info size={13} /> <span>{withCode(a.help[id])}</span>
      </p>
      {status?.detail && !ok && <p className="provider-detail">{status.detail}</p>}
      {ok && !isApi && <p className="provider-detail">{a.found(status?.version, status?.account)}</p>}
      {ok && isApi && <p className="provider-detail">{a.keySaved}</p>}
      {!isApi && status?.installed && isOlderVersion(status.version, status.latestVersion) && (
        <div className="provider-login">
          {id === 'claude-code' && (
            <Button size="sm" icon={<ArrowCircleUp size={13} />} onClick={() => void invoke('ai:openUpdate', id)}>
              {a.update}
            </Button>
          )}
          <span className="muted">
            {a.newVersion(status.latestVersion ?? '')} {id === 'claude-code' ? a.updateClaude : a.updateCodex}
          </span>
        </div>
      )}
      {isApi && (
        <div className="provider-key">
          <TextInput type="password" aria-label={a.apiKey} spellCheck={false} placeholder={ok ? a.keyPlaceholderSaved : a.keyPlaceholder} value={key} onChange={(e) => setKey(e.target.value)} />
          <Button size="sm" onClick={() => void saveKey()} disabled={!key.trim()}>
            {a.saveKey}
          </Button>
        </div>
      )}
      {!isApi && status?.installed && status.loggedIn === false && (
        <div className="provider-login">
          <Button size="sm" icon={<SignIn size={13} />} onClick={() => void invoke('ai:openLogin', id)}>
            {a.logIn}
          </Button>
          <span className="muted">{a.logInHint}</span>
        </div>
      )}
      {!isApi && (
        <div className="provider-extra">
          {showPath ? (
            <TextInput
              spellCheck={false}
              aria-label={a.programPath}
              placeholder={a.programPathPlaceholder(id === 'codex' ? 'codex' : 'claude')}
              defaultValue={settings.providers[id]?.binPath ?? ''}
              onBlur={(e) => void update({ providers: { ...settings.providers, [id]: { ...settings.providers[id], binPath: e.target.value.trim() || undefined } } }).then(() => check(id))}
            />
          ) : (
            <button className="link-btn" onClick={() => setShowPath(true)}>
              {a.setProgramPath}
            </button>
          )}
        </div>
      )}
      {ok && enabled && (
        <div className="provider-foot">
          <span className="muted">{a.modelsAvailable(models?.length ?? 0)}</span>
          <button className="link-btn" onClick={() => void useSuggested()}>
            <Sparkle size={12} /> {a.useForAll}
          </button>
        </div>
      )}
    </div>
  )
}

function RoutesTable(): React.JSX.Element {
  const settings = useApp((s) => s.settings!)
  const models = useApp((s) => s.models)
  const status = useApp((s) => s.status)
  const update = useApp((s) => s.updateSettings)
  const t = useT()
  const a = t.settings.ai
  const ready = PROVIDERS.filter((p) => settings.providers[p]?.enabled !== false && status[p]?.installed && status[p]?.loggedIn !== false)

  const setRoute = (task: TaskKind, route: ModelChoice | null): void => {
    void update({ routes: { ...settings.routes, [task]: route } })
  }

  if (!ready.length) {
    return <p className="settings-empty">{a.connectFirst}</p>
  }

  return (
    <div className="routes">
      {TASKS.map((task) => {
        const r = settings.routes[task]
        const providerModels = r ? (models[r.provider] ?? []) : []
        const modelOptions = providerModels.map((m) => ({ value: m.id, label: m.resolvedLabel ? `${m.label} — ${m.resolvedLabel}` : m.label }))
        const current = r ? providerModels.find((m) => m.id === r.model) : undefined
        const efforts = r ? effortChoices(current, r.effort) : null
        if (r && r.model && !modelOptions.some((o) => o.value === r.model)) modelOptions.unshift({ value: r.model, label: r.model })
        if (r?.provider === 'codex') modelOptions.unshift({ value: '__default', label: a.cliDefault })
        const name = t.common.tasks[task].name
        return (
          <div key={task} className="route-row">
            <div className="route-label">
              <strong>{name}</strong>
              <span>{t.common.tasks[task].hint}</span>
              {current?.resolvedLabel && <span className="route-now">{a.lastAnswer(current.resolvedLabel)}</span>}
            </div>
            <Select
              value={r?.provider ?? ''}
              placeholder={a.provider}
              onValueChange={(p) => {
                const pid = p as ProviderId
                setRoute(task, suggestRoutes(pid, models[pid] ?? [])[task])
              }}
              options={ready.map((p) => ({ value: p, label: PROVIDER_LABELS[p].short }))}
              ariaLabel={a.providerAria(name)}
              className="route-provider"
            />
            <Select
              value={r ? (r.model || '__default') : ''}
              placeholder={a.model}
              onValueChange={(v) => {
                if (!r) return
                const model = v === '__default' ? '' : v
                const next = providerModels.find((m) => m.id === model)
                const effort = r.effort ? nearestEffort(r.effort, next) : undefined
                setRoute(task, { provider: r.provider, model, ...(effort ? { effort } : {}) })
              }}
              options={modelOptions}
              ariaLabel={a.modelAria(name)}
              className="route-model"
            />
            {r && efforts ? (
              <Select
                value={r.effort ?? 'default'}
                onValueChange={(v) => setRoute(task, { provider: r.provider, model: r.model, ...(v === 'default' ? {} : { effort: v as Effort }) })}
                options={[
                  {
                    value: 'default',
                    label: a.defaultEffort(current?.defaultEffort ? t.common.efforts[current.defaultEffort] : undefined, r.provider === 'claude-code' || r.provider === 'codex')
                  },
                  ...efforts.map((e) => ({ value: e, label: t.common.efforts[e] }))
                ]}
                ariaLabel={a.effortAria(name)}
                className="route-effort"
              />
            ) : (
              <span className="route-effort route-effort-none">{r ? a.noEffort : ''}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

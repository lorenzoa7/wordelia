import { useState } from 'react'
import clsx from 'clsx'
import { ArrowsClockwise, CheckCircle, Info, Key, Sparkle, Terminal, WarningCircle } from '@phosphor-icons/react'
import { PROVIDER_LABELS, TASK_LABELS, suggestRoutes } from '@shared/ai/routes'
import type { Effort, ModelChoice, ProviderId, TaskKind } from '@shared/types'
import { Button, Select, Spinner, Switch, TextInput, Tooltip } from '@/ui'
import { invoke } from '@/lib/api'
import { useApp } from '@/stores/app'
import { toast } from '@/stores/ui'

const PROVIDERS: ProviderId[] = ['claude-code', 'codex', 'anthropic', 'openai']
const TASKS: TaskKind[] = ['chat', 'action', 'sync', 'background']

const HELP: Record<ProviderId, React.ReactNode> = {
  'claude-code': (
    <>
      Uses your Claude Pro or Max plan. Install Claude Code, then run <code>claude auth login</code> in a terminal. Wordelia runs your own{' '}
      <code>claude</code> program; it never sees your password or tokens.
    </>
  ),
  codex: (
    <>
      Uses your ChatGPT plan. Install the Codex CLI, then run <code>codex login</code> in a terminal. Wordelia runs your own <code>codex</code>{' '}
      program.
    </>
  ),
  anthropic: <>Pay per use with an API key from console.anthropic.com. The key is encrypted on this computer.</>,
  openai: <>Pay per use with an API key from platform.openai.com. The key is encrypted on this computer.</>
}

export function AiTab(): React.JSX.Element | null {
  const settings = useApp((s) => s.settings)
  if (!settings) return null
  return (
    <div>
      <h3 className="settings-h">Connections</h3>
      <p className="settings-note">Wordelia is free. Connect the AI you already pay for.</p>
      <div className="provider-list">
        {PROVIDERS.map((p) => (
          <ProviderCard key={p} id={p} />
        ))}
      </div>
      <h3 className="settings-h">Models for each task</h3>
      <p className="settings-note">
        Pick a model for each kind of work. Fast models feel better for actions; the strongest models give the best chat and planning.
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
  const isApi = id === 'anthropic' || id === 'openai'
  const enabled = settings.providers[id]?.enabled !== false
  const ok = status?.installed && status.loggedIn !== false

  const saveKey = async (): Promise<void> => {
    await invoke('ai:setKey', id, key.trim() || null)
    setKey('')
    await update({ providers: { ...settings.providers, [id]: { ...settings.providers[id], enabled: true } } })
    const st = await check(id)
    toast(st.loggedIn ? `${PROVIDER_LABELS[id].name} connected.` : `The key did not work: ${st.detail ?? ''}`, { kind: st.loggedIn ? 'info' : 'error' })
  }

  const useSuggested = async (): Promise<void> => {
    await update({ routes: suggestRoutes(id, models ?? []) })
    toast(`All tasks now use ${PROVIDER_LABELS[id].name}.`)
  }

  return (
    <div className={clsx('provider-card', ok && enabled && 'is-ok', !enabled && 'is-off')}>
      <div className="provider-top">
        <span className="provider-icon">{isApi ? <Key size={16} /> : <Terminal size={16} />}</span>
        <div className="provider-title">
          <strong>{PROVIDER_LABELS[id].name}</strong>
          <span>{PROVIDER_LABELS[id].kind}</span>
        </div>
        <span className="provider-state">
          {checking ? (
            <Spinner size={13} />
          ) : !status ? null : ok ? (
            <span className="state-ok">
              <CheckCircle size={14} weight="fill" /> {status.version && !isApi ? `v${status.version}` : 'Ready'}
            </span>
          ) : (
            <span className="state-bad">
              <WarningCircle size={14} weight="fill" /> {!status.installed ? 'Not installed' : 'Not connected'}
            </span>
          )}
        </span>
        <Tooltip label="Check again">
          <button className="icon-btn" onClick={() => void check(id)} aria-label="Check again">
            <ArrowsClockwise size={15} />
          </button>
        </Tooltip>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => void update({ providers: { ...settings.providers, [id]: { ...settings.providers[id], enabled: v } } })}
          label={`Use ${PROVIDER_LABELS[id].name}`}
        />
      </div>
      <p className="provider-help">
        <Info size={13} /> <span>{HELP[id]}</span>
      </p>
      {status?.detail && !ok && <p className="provider-detail">{status.detail}</p>}
      {status?.account && ok && <p className="provider-detail">Account: {status.account}</p>}
      {isApi && (
        <div className="provider-key">
          <TextInput type="password" placeholder={ok ? 'A key is saved. Paste a new one to replace it.' : 'Paste your API key'} value={key} onChange={(e) => setKey(e.target.value)} />
          <Button size="sm" onClick={() => void saveKey()} disabled={!key.trim()}>
            Save key
          </Button>
        </div>
      )}
      {!isApi && (
        <div className="provider-extra">
          {showPath ? (
            <TextInput
              placeholder={`Full path to the ${id === 'codex' ? 'codex' : 'claude'} program (leave empty to find it automatically)`}
              defaultValue={settings.providers[id]?.binPath ?? ''}
              onBlur={(e) => void update({ providers: { ...settings.providers, [id]: { ...settings.providers[id], binPath: e.target.value.trim() || undefined } } }).then(() => check(id))}
            />
          ) : (
            <button className="link-btn" onClick={() => setShowPath(true)}>
              Set the program path
            </button>
          )}
        </div>
      )}
      {ok && enabled && (
        <div className="provider-foot">
          <span className="muted">{models?.length ?? 0} models available</span>
          <button className="link-btn" onClick={() => void useSuggested()}>
            <Sparkle size={12} /> Use for all tasks
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
  const ready = PROVIDERS.filter((p) => settings.providers[p]?.enabled !== false && status[p]?.installed && status[p]?.loggedIn !== false)

  const setRoute = (task: TaskKind, route: ModelChoice | null): void => {
    void update({ routes: { ...settings.routes, [task]: route } })
  }

  if (!ready.length) {
    return <p className="settings-empty">Connect a provider above to choose models.</p>
  }

  return (
    <div className="routes">
      {TASKS.map((task) => {
        const r = settings.routes[task]
        const providerModels = r ? (models[r.provider] ?? []) : []
        const modelOptions = providerModels.map((m) => ({ value: m.id, label: m.label }))
        if (r && r.model && !modelOptions.some((o) => o.value === r.model)) modelOptions.unshift({ value: r.model, label: r.model })
        if (r?.provider === 'codex') modelOptions.unshift({ value: '__default', label: 'CLI default' })
        return (
          <div key={task} className="route-row">
            <div className="route-label">
              <strong>{TASK_LABELS[task].name}</strong>
              <span>{TASK_LABELS[task].hint}</span>
            </div>
            <Select
              value={r?.provider ?? ''}
              placeholder="Provider"
              onValueChange={(p) => {
                const pid = p as ProviderId
                setRoute(task, suggestRoutes(pid, models[pid] ?? [])[task])
              }}
              options={ready.map((p) => ({ value: p, label: PROVIDER_LABELS[p].short }))}
              ariaLabel={`${TASK_LABELS[task].name} provider`}
              className="route-provider"
            />
            <Select
              value={r ? (r.model || '__default') : ''}
              placeholder="Model"
              onValueChange={(v) => r && setRoute(task, { ...r, model: v === '__default' ? '' : v })}
              options={modelOptions}
              ariaLabel={`${TASK_LABELS[task].name} model`}
              className="route-model"
            />
            {r && r.provider !== 'claude-code' ? (
              <Select
                value={r.effort ?? 'default'}
                onValueChange={(v) => setRoute(task, { ...r, effort: v === 'default' ? undefined : (v as Effort) })}
                options={[
                  { value: 'default', label: 'Default effort' },
                  { value: 'low', label: 'Low effort' },
                  { value: 'medium', label: 'Medium effort' },
                  { value: 'high', label: 'High effort' }
                ]}
                ariaLabel="Effort"
                className="route-effort"
              />
            ) : (
              <span className="route-effort" />
            )}
          </div>
        )
      })}
    </div>
  )
}

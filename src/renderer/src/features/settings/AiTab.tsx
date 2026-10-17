import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowsClockwise, CaretDown, Info, Key, Sparkle, Terminal } from '@phosphor-icons/react'
import { PROVIDER_LABELS, suggestRoutes } from '@shared/ai/routes'
import { isOlderVersion } from '@shared/version'
import { effortChoices, nearestEffort } from '@shared/ai/effort'
import type { Effort, ModelChoice, ProviderId, ProviderStatus, TaskKind } from '@shared/types'
import { Button, Select, Spinner, Switch, TextInput, Tooltip } from '@/ui'
import { invoke } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { toast } from '@/stores/ui'

const PROVIDERS: ProviderId[] = ['claude-code', 'codex', 'anthropic', 'openai']
const TASKS: TaskKind[] = ['chat', 'action', 'sync', 'background']
/** Where to get each CLI (the same pages as the welcome screen) */
const INSTALL_URL: Partial<Record<ProviderId, string>> = {
  'claude-code': 'https://claude.com/claude-code',
  codex: 'https://developers.openai.com/codex'
}

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
          <ProviderRow key={p} id={p} />
        ))}
      </div>
      <h3 className="settings-h">{a.modelsForTasks}</h3>
      <p className="settings-note">{a.routesNote}</p>
      <RoutesTable />
    </div>
  )
}

type RowState = 'checking' | 'off' | 'unknown' | 'notInstalled' | 'loggedOut' | 'noKey' | 'ok'

function rowState(isApi: boolean, enabled: boolean, checking: boolean | undefined, status: ProviderStatus | undefined): RowState {
  if (!enabled) return 'off'
  if (checking) return 'checking'
  if (!status) return 'unknown'
  if (!status.installed) return 'notInstalled'
  if (status.loggedIn === false) return isApi ? 'noKey' : 'loggedOut'
  return 'ok'
}

/** One provider: its name, one status line and one button. The rest is under "Details". */
function ProviderRow({ id }: { id: ProviderId }): React.JSX.Element {
  const status = useApp((s) => s.status[id])
  const checking = useApp((s) => s.checking[id])
  const settings = useApp((s) => s.settings!)
  const models = useApp((s) => s.models[id])
  const check = useApp((s) => s.checkProvider)
  const update = useApp((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  /** The user went to a terminal or a web page: check again when the window gets the focus back. */
  const [waiting, setWaiting] = useState(false)
  const keyInput = useRef<HTMLInputElement>(null)
  const t = useT()
  const a = t.settings.ai
  const name = PROVIDER_LABELS[id].name
  const isApi = id === 'anthropic' || id === 'openai'
  const enabled = settings.providers[id]?.enabled !== false
  const state = rowState(isApi, enabled, checking, status)
  const outdated = !isApi && state === 'ok' && isOlderVersion(status?.version, status?.latestVersion)
  // An API that is off can still have a saved key: then it only needs "Turn on".
  const [hasKey, setHasKey] = useState(false)
  useEffect(() => {
    if (isApi && !enabled) void invoke('ai:hasKey', id).then(setHasKey)
  }, [isApi, enabled, id])

  useEffect(() => {
    if (!waiting) return
    const onFocus = (): void => {
      setWaiting(false)
      void check(id)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [waiting, check, id])

  const setEnabled = async (v: boolean): Promise<void> => {
    await update({ providers: { ...settings.providers, [id]: { ...settings.providers[id], enabled: v } } })
    if (v) await check(id)
  }
  const saveKey = async (): Promise<void> => {
    await invoke('ai:setKey', id, key.trim() || null)
    setKey('')
    await update({ providers: { ...settings.providers, [id]: { ...settings.providers[id], enabled: true } } })
    const st = await check(id)
    toast(st.loggedIn ? a.providerConnected(name) : a.keyFailed(st.detail ?? ''), { kind: st.loggedIn ? 'info' : 'error' })
  }
  const showKey = (): void => {
    setOpen(true)
    setTimeout(() => keyInput.current?.focus(), 50)
  }
  const useSuggested = async (): Promise<void> => {
    await update({ routes: suggestRoutes(id, models ?? []) })
    toast(a.allTasksUse(name))
  }

  // The one button: what to do next.
  const primary: { label: string; run: () => void } | null =
    state === 'off'
      ? isApi && !hasKey
        ? { label: a.addKey, run: showKey }
        : { label: a.turnOn, run: () => void setEnabled(true) }
      : state === 'notInstalled' && INSTALL_URL[id]
        ? {
            label: a.install,
            run: () => {
              void invoke('window:openExternal', INSTALL_URL[id]!)
              setWaiting(true)
            }
          }
        : state === 'loggedOut'
          ? {
              label: a.logIn,
              run: () => {
                void invoke('ai:openLogin', id)
                setWaiting(true)
              }
            }
          : state === 'noKey'
            ? { label: a.addKey, run: showKey }
            : outdated && id === 'claude-code'
              ? {
                  label: a.update,
                  run: () => {
                    void invoke('ai:openUpdate', id)
                    setWaiting(true)
                  }
                }
              : null

  const line =
    state === 'off'
      ? a.off
      : state === 'checking' || state === 'unknown'
        ? a.checking
        : state === 'notInstalled'
          ? a.notInstalled
          : state === 'loggedOut' || state === 'noKey'
            ? status?.reason === 'expired'
              ? a.expired
              : a.notConnected
            : [a.connected, status?.account, outdated ? a.updateAvailable(status?.latestVersion ?? '') : ''].filter(Boolean).join(' · ')

  return (
    <div className={clsx('provider-row', `is-${state}`, open && 'is-open')}>
      <div className="provider-main">
        <span className="provider-icon">{isApi ? <Key size={15} /> : <Terminal size={15} />}</span>
        <div className="provider-text">
          <strong>{name}</strong>
          <span className="provider-line">
            {state === 'checking' ? <Spinner size={10} /> : <span className="provider-dot" aria-hidden />}
            <span className="provider-line-text">{line}</span>
          </span>
        </div>
        {primary && (
          <Button size="sm" variant={state === 'loggedOut' || state === 'noKey' || state === 'notInstalled' ? 'primary' : 'secondary'} onClick={primary.run}>
            {primary.label}
          </Button>
        )}
        <button className="provider-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {a.details}
          <CaretDown size={11} className="provider-more-caret" />
        </button>
      </div>
      {open && (
        <div className="provider-details">
          <p className="provider-help">
            <Info size={13} /> <span>{withCode(a.help[id])}</span>
          </p>
          {status?.detail && state !== 'ok' && <p className="provider-detail">{status.detail}</p>}
          {!isApi && status?.version && (
            <p className="provider-detail">
              {outdated ? a.newVersion(status.latestVersion ?? '') : a.version(status.version)}
              {outdated && id === 'codex' ? ` ${a.updateCodex}` : ''}
            </p>
          )}
          {isApi && (
            <div className="provider-key">
              <TextInput
                ref={keyInput}
                type="password"
                aria-label={a.apiKey}
                spellCheck={false}
                placeholder={state === 'ok' ? a.keyPlaceholderSaved : a.keyPlaceholder}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && key.trim() && void saveKey()}
              />
              <Button size="sm" onClick={() => void saveKey()} disabled={!key.trim()}>
                {a.saveKey}
              </Button>
            </div>
          )}
          {!isApi && (
            <label className="provider-path">
              <span>{a.programPath}</span>
              <TextInput
                spellCheck={false}
                placeholder={a.programPathPlaceholder(id === 'codex' ? 'codex' : 'claude')}
                defaultValue={settings.providers[id]?.binPath ?? ''}
                onBlur={(e) => {
                  const binPath = e.target.value.trim() || undefined
                  if (binPath === settings.providers[id]?.binPath) return
                  void update({ providers: { ...settings.providers, [id]: { ...settings.providers[id], binPath } } }).then(() => check(id))
                }}
              />
            </label>
          )}
          <div className="provider-foot">
            <label className="provider-switch">
              <Switch checked={enabled} onCheckedChange={(v) => void setEnabled(v)} label={a.use(name)} />
              <span>{a.use(name)}</span>
            </label>
            {state === 'ok' && (
              <button className="link-btn" onClick={() => void useSuggested()}>
                <Sparkle size={12} /> {a.useForAll}
              </button>
            )}
            <Button size="sm" variant="ghost" icon={<ArrowsClockwise size={13} />} onClick={() => void check(id)} disabled={!enabled || checking}>
              {a.checkAgain}
            </Button>
          </div>
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
      <div className="route-row route-head">
        <span>{a.task}</span>
        <span>{a.provider}</span>
        <span>{a.model}</span>
        <span className="route-head-effort">
          {a.effort}
          <Tooltip label={a.effortHelp}>
            <span className="route-help" tabIndex={0} aria-label={a.effortHelp}>
              <Info size={12} />
            </span>
          </Tooltip>
        </span>
      </div>
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
              <span title={t.common.tasks[task].hint}>{t.common.tasks[task].hint}</span>
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
              value={r ? r.model || '__default' : ''}
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

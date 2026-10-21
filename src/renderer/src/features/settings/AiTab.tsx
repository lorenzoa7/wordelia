import { useCallback, useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowSquareOut, ArrowsClockwise, CaretDown, Info, Key, Sparkle, Terminal, Warning } from '@phosphor-icons/react'
import { PROVIDER_LABELS, PROVIDER_ORDER, readyProviders, suggestRoutes } from '@shared/ai/routes'
import { BILLING_PAGE, KEY_PAGE, installPage } from '@shared/ai/install'
import { cleanProgramPath } from '@shared/ai/paths'
import { isOlderVersion } from '@shared/version'
import { effortChoices, nearestEffort } from '@shared/ai/effort'
import type { Effort, ModelChoice, ProviderId, ProviderSettings, ProviderStatus, TaskKind } from '@shared/types'
import { Button, Select, Spinner, Switch, TextInput, Tooltip } from '@/ui'
import { invoke } from '@/lib/api'
import { useProviderFocus } from '@/lib/ai'
import { getT, useT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { toast } from '@/stores/ui'

const TASKS: TaskKind[] = ['chat', 'action', 'sync', 'background']
/** After "Log in…", "How to install" or "Update…", the row checks the provider this often, for this long. */
const POLL_EVERY = 3000
const POLL_FOR = 3 * 60 * 1000

/** Text with `backticks` around program commands: those parts show as code. */
function withCode(text: string): React.ReactNode {
  return text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))
}

const isApi = (id: ProviderId): boolean => id === 'anthropic' || id === 'openai'
const openPage = (url: string): void => void invoke('window:openExternal', url)
const platform = (): string => window.wordelia?.platform ?? ''

function readyNow(): ProviderId[] {
  const s = useApp.getState()
  return s.settings ? readyProviders(s.settings, s.status) : []
}

/**
 * A provider started to work: give it the tasks that have no model (or whose provider is off), and
 * say so. When every task has a model already, only say that it is connected.
 */
async function announceConnected(id: ProviderId): Promise<void> {
  const t = getT()
  const a = t.settings.ai
  const name = PROVIDER_LABELS[id].name
  const r = await useApp.getState().autoRoute(id)
  if (r?.provider !== id) return toast(a.providerConnected(name))
  toast(r.changed.length === TASKS.length ? a.connectedAll(name) : a.connectedSome(name, r.changed.map((k) => t.common.tasks[k].name).join(', ')))
}

/** Check the providers in the background. A provider that starts to work gets the tasks without a model. */
async function recheckAll(): Promise<void> {
  const before = readyNow()
  await useApp.getState().checkAllProviders({ quiet: true })
  const fresh = readyNow().find((p) => !before.includes(p))
  if (fresh) await announceConnected(fresh)
}

export function AiTab(): React.JSX.Element | null {
  const settings = useApp((s) => s.settings)
  const t = useT()
  // A status can be old: check when the tab opens, and when the window gets the focus back
  // (for example after a login in the browser or an installation).
  useEffect(() => {
    void recheckAll()
    const onFocus = (): void => void recheckAll()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  if (!settings) return null
  const a = t.settings.ai
  return (
    <div>
      <h3 className="settings-h">{a.connections}</h3>
      <p className="settings-note">{a.free}</p>
      <div className="provider-list">
        {PROVIDER_ORDER.map((p) => (
          <ProviderRow key={p} id={p} />
        ))}
      </div>
      <h3 className="settings-h">{a.modelsForTasks}</h3>
      <p className="settings-note">{a.routesNote}</p>
      <RoutesTable />
    </div>
  )
}

type RowState = 'off' | 'checking' | 'notInstalled' | 'loggedOut' | 'expired' | 'noKey' | 'badKey' | 'noCredit' | 'offline' | 'ok'
/** The states where the writer must do something: the dot is red and the button is the main one. */
const NEEDS_YOU: RowState[] = ['notInstalled', 'loggedOut', 'expired', 'noKey', 'badKey', 'noCredit']
type Waiting = 'login' | 'install' | 'update'

function rowState(api: boolean, enabled: boolean, checking: boolean | undefined, status: ProviderStatus | undefined): RowState {
  if (!enabled) return 'off'
  if (checking || !status) return 'checking'
  if (!status.installed) return 'notInstalled'
  if (status.loggedIn === false) return api ? (status.reason === 'bad-key' ? 'badKey' : 'noKey') : status.reason === 'expired' ? 'expired' : 'loggedOut'
  if (status.reason === 'no-credit') return 'noCredit'
  if (status.reason === 'offline') return 'offline'
  return 'ok'
}

/** One provider: its name, one status line and one button. The rest is under "Details". */
function ProviderRow({ id }: { id: ProviderId }): React.JSX.Element {
  const status = useApp((s) => s.status[id])
  const checking = useApp((s) => s.checking[id])
  const settings = useApp((s) => s.settings!)
  const models = useApp((s) => s.models[id])
  const anyReady = useApp((s) => (s.settings ? readyProviders(s.settings, s.status).length > 0 : false))
  const check = useApp((s) => s.checkProvider)
  const update = useApp((s) => s.updateSettings)
  const focus = useProviderFocus((s) => s.provider)
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  /** The writer went to a terminal or a web page: the row checks again until the status changes. */
  const [waiting, setWaiting] = useState<Waiting | null>(null)
  const row = useRef<HTMLDivElement>(null)
  const keyInput = useRef<HTMLInputElement>(null)
  const detailsId = useId()
  const t = useT()
  const a = t.settings.ai
  const name = PROVIDER_LABELS[id].name
  const api = isApi(id)
  const enabled = settings.providers[id]?.enabled !== false
  const state = rowState(api, enabled, checking, status)
  const used = TASKS.some((k) => settings.routes[k]?.provider === id)
  // A program that is not installed and that no task uses is a choice, not a problem.
  const optional = state === 'notInstalled' && !used && anyReady
  const needsYou = NEEDS_YOU.includes(state) && !optional
  const outdated = !api && state === 'ok' && isOlderVersion(status?.version, status?.latestVersion)
  const install = installPage(id, platform())

  // An API key can be saved also while the API is off: then the API only needs "Turn on".
  const refreshKey = useCallback((): void => {
    if (api) void invoke('ai:hasKey', id).then(setHasKey)
  }, [api, id])
  useEffect(refreshKey, [refreshKey, enabled])

  // An error in the chat or in an action opened the settings at this provider: show its details.
  useEffect(() => {
    if (focus !== id) return
    setOpen(true)
    useProviderFocus.setState({ provider: null })
    requestAnimationFrame(() => row.current?.scrollIntoView({ block: 'nearest' }))
  }, [focus, id])

  useEffect(() => {
    if (!waiting) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const started = Date.now()
    const version = useApp.getState().status[id]?.version
    const tick = async (): Promise<void> => {
      const st = await check(id, { quiet: true })
      if (stopped) return
      const done = waiting === 'install' ? st.installed : waiting === 'login' ? st.installed && st.loggedIn !== false : Boolean(st.version) && st.version !== version
      if (done || Date.now() - started > POLL_FOR) {
        setWaiting(null)
        if (done && waiting !== 'update' && st.loggedIn !== false) void announceConnected(id)
        return
      }
      timer = setTimeout(() => void tick(), POLL_EVERY)
    }
    timer = setTimeout(() => void tick(), POLL_EVERY)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [waiting, id, check])

  const setProvider = (patch: Partial<ProviderSettings>): Promise<void> => {
    const s = useApp.getState().settings!
    return update({ providers: { ...s.providers, [id]: { ...s.providers[id], ...patch } } })
  }
  /** A provider that is off shows nowhere (no status, no models), and its tasks go to another provider. */
  const turnedOff = async (): Promise<string | null> => {
    setWaiting(null)
    useApp.setState((s) => {
      const status = { ...s.status }
      const models = { ...s.models }
      delete status[id]
      delete models[id]
      return { status, models }
    })
    const r = await useApp.getState().autoRoute()
    return r ? (r.provider ? a.movedTo(name, PROVIDER_LABELS[r.provider].name) : a.noAiLeft(name)) : null
  }
  const setEnabled = async (v: boolean): Promise<void> => {
    await setProvider({ enabled: v })
    if (!v) {
      const moved = await turnedOff()
      if (moved) toast(moved)
      return
    }
    const st = await check(id)
    if (st.installed && st.loggedIn !== false && st.reason !== 'offline') await announceConnected(id)
  }
  const saveKey = async (): Promise<void> => {
    const value = key.trim()
    if (!value) return
    // A file that cannot be written also says "not saved", never nothing.
    const saved = await invoke('ai:setKey', id, value).catch(() => ({ ok: false, error: '' }))
    if (!saved.ok) return toast(a.keyNotSaved(saved.error ?? '').trim(), { kind: 'error' })
    setKey('')
    setHasKey(true)
    await setProvider({ enabled: true })
    const st = await check(id)
    if (st.reason === 'bad-key') {
      // A key that does not work does not stay saved.
      await invoke('ai:setKey', id, null)
      setHasKey(false)
      toast(a.keyRejected(name), { kind: 'error' })
    } else if (st.reason === 'offline') {
      toast(a.keyUnchecked(name))
    } else if (st.loggedIn !== false) {
      await announceConnected(id)
    }
  }
  const removeKey = async (): Promise<void> => {
    await invoke('ai:setKey', id, null)
    setHasKey(false)
    await setProvider({ enabled: false })
    toast(`${a.keyRemoved} ${(await turnedOff()) ?? a.nowOff(name)}`)
  }
  const showKey = (): void => {
    setOpen(true)
    setTimeout(() => keyInput.current?.focus(), 50)
  }
  const useSuggested = async (): Promise<void> => {
    await update({ routes: suggestRoutes(id, models ?? []) })
    toast(a.allTasksUse(name))
  }
  const logIn = (): void =>
    void invoke('ai:openLogin', id).then((opened) => {
      if (opened) setWaiting('login')
      else void check(id)
    })

  // The one button: what to do next.
  const primary: { label: string; run: () => void } | null =
    state === 'off'
      ? api && !hasKey
        ? { label: a.addKey, run: showKey }
        : { label: a.turnOn, run: () => void setEnabled(true) }
      : state === 'notInstalled' && install
        ? {
            label: a.install,
            run: () => {
              openPage(install)
              setWaiting('install')
            }
          }
        : state === 'loggedOut' || state === 'expired'
          ? { label: a.logIn, run: logIn }
          : state === 'noKey' || state === 'badKey'
            ? { label: a.addKey, run: showKey }
            : state === 'noCredit' && BILLING_PAGE[id]
              ? { label: a.addCredit, run: () => openPage(BILLING_PAGE[id]!) }
              : state === 'offline'
                ? { label: a.checkAgain, run: () => void check(id) }
                : outdated && id === 'claude-code'
                  ? {
                      label: a.update,
                      run: () =>
                        void invoke('ai:openUpdate', id).then((opened) => {
                          if (opened) setWaiting('update')
                        })
                    }
                  : outdated && install
                    ? {
                        label: a.howToUpdate,
                        run: () => {
                          openPage(install)
                          setWaiting('update')
                        }
                      }
                    : null

  const lines: Record<RowState, string> = {
    off: a.off,
    checking: a.checking,
    notInstalled: optional ? a.optional : a.notInstalled,
    loggedOut: a.notLoggedIn,
    expired: a.expired,
    noKey: a.noKey,
    badKey: a.badKey,
    noCredit: a.noCredit,
    offline: a.offline,
    ok: [a.connected, status?.account].filter(Boolean).join(' · ')
  }
  const line = waiting === 'login' ? a.waitingLogin : waiting === 'install' ? a.waitingInstall : waiting === 'update' ? a.waitingUpdate : lines[state]

  return (
    <div ref={row} className={clsx('provider-row', `is-${state}`, needsYou && 'needs-you', optional && 'is-optional', open && 'is-open')}>
      <div className="provider-main">
        <span className="provider-icon">{api ? <Key size={15} /> : <Terminal size={15} />}</span>
        <div className="provider-text">
          <strong>{name}</strong>
          <span className="provider-line">
            {state === 'checking' ? <Spinner size={10} /> : <span className="provider-dot" aria-hidden />}
            <span className="provider-line-text" title={line}>
              {line}
            </span>
          </span>
          {outdated && status?.latestVersion && <span className="provider-sub">{a.newVersionShort(status.latestVersion)}</span>}
        </div>
        {primary && (
          <Button
            size="sm"
            variant={needsYou ? 'primary' : 'secondary'}
            icon={waiting ? <Spinner size={11} /> : undefined}
            onClick={primary.run}
            aria-label={a.actionAria(primary.label, name)}
          >
            {primary.label}
          </Button>
        )}
        <button className="provider-more" aria-expanded={open} aria-controls={detailsId} aria-label={a.detailsAria(name)} onClick={() => setOpen(!open)}>
          {a.details}
          <CaretDown size={11} className="provider-more-caret" />
        </button>
      </div>
      {open && (
        <div className="provider-details" id={detailsId}>
          <p className="provider-help">
            <Info size={13} /> <span>{withCode(a.help[id])}</span>
          </p>
          {api && (
            <p className="provider-links">
              {KEY_PAGE[id] && (
                <button className="link-btn" onClick={() => openPage(KEY_PAGE[id]!)}>
                  {a.getKey} <ArrowSquareOut size={11} />
                </button>
              )}
              {BILLING_PAGE[id] && (
                <button className="link-btn" onClick={() => openPage(BILLING_PAGE[id]!)}>
                  {a.addCredit} <ArrowSquareOut size={11} />
                </button>
              )}
            </p>
          )}
          {status?.detail && state !== 'ok' && <p className="provider-detail">{status.detail}</p>}
          {!api && status?.path && <p className="provider-detail">{a.program(status.path)}</p>}
          {!api && status?.version && (
            <p className="provider-detail">
              {a.version(status.version)}
              {outdated ? ` ${a.newVersion(status.latestVersion ?? '')}` : ''}
            </p>
          )}
          {api && (
            <div className="provider-key">
              <TextInput
                ref={keyInput}
                type="password"
                aria-label={a.apiKey}
                spellCheck={false}
                placeholder={hasKey ? a.keyPlaceholderSaved : a.keyPlaceholder}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && key.trim() && void saveKey()}
              />
              <Button size="sm" onClick={() => void saveKey()} disabled={!key.trim()}>
                {a.saveKey}
              </Button>
              {hasKey && (
                <Button size="sm" variant="ghost" onClick={() => void removeKey()} aria-label={a.actionAria(a.removeKey, name)}>
                  {a.removeKey}
                </Button>
              )}
            </div>
          )}
          {!api && (
            <label className="provider-path">
              <span>{a.programPath}</span>
              <TextInput
                spellCheck={false}
                placeholder={a.programPathPlaceholder(id === 'codex' ? 'codex' : 'claude')}
                defaultValue={settings.providers[id]?.binPath ?? ''}
                onBlur={(e) => {
                  // "Copy as path" in Windows adds quotes: they go.
                  const binPath = cleanProgramPath(e.target.value)
                  e.target.value = binPath ?? ''
                  if (binPath === settings.providers[id]?.binPath) return
                  void setProvider({ binPath }).then(() => check(id))
                }}
              />
            </label>
          )}
          {!api && status?.pathIgnored && (
            <p className="provider-warn">
              <Warning size={13} /> <span>{a.pathIgnored}</span>
            </p>
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
            <Button size="sm" variant="ghost" icon={<ArrowsClockwise size={13} />} onClick={() => void check(id)} disabled={!enabled || checking} aria-label={a.actionAria(a.checkAgain, name)}>
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
  const ready = readyProviders(settings, status)

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
        // The provider of the route stays in the list while it is not ready (logged out), so the box is never empty.
        const providers = r && !ready.includes(r.provider) ? [...ready, r.provider] : ready
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
              options={providers.map((p) => ({ value: p, label: PROVIDER_LABELS[p].name }))}
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

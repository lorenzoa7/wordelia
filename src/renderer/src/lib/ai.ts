// Run an AI completion through the main process, with streaming callbacks.
// The plain message for each error (friendlyError, describeError) also lives here.

import { create } from 'zustand'
import type { AiErrorKind, CompletionRequest, CompletionResult, ModelChoice, ProviderId, ProviderStatus, StreamEvent } from '@shared/types'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import { invoke, on } from './api'
import { useApp } from '@/stores/app'
import { useUi } from '@/stores/ui'
import { getT } from './i18n'

export type { AiErrorKind }

let counter = 0

// The main process learns the real models of the claude aliases in the background ("opus" → "Opus 5.5").
// Then it asks for a new model list, so the model pickers show the versions.
if (typeof window !== 'undefined' && window.wordelia) {
  on('ai:modelsChanged', ({ provider }) => {
    void invoke('ai:models', provider).then((models) => {
      if (models.length) useApp.setState((s) => ({ models: { ...s.models, [provider]: models } }))
    })
  })
}

export interface RunHandle {
  id: string
  done: Promise<CompletionResult>
  cancel: () => void
}

/**
 * The route to use. A route of a provider that is off (the route of a thread or of an action) gives
 * its place to the route of its task, when that one is on. Else the main process refuses the request.
 */
function usableRoute(req: CompletionRequest): ModelChoice {
  const s = useApp.getState().settings
  const off = (p: ProviderId): boolean => s?.providers[p]?.enabled === false
  if (!s || !off(req.route.provider)) return req.route
  const task = s.routes[req.purpose]
  return task && !off(task.provider) ? task : req.route
}

/** A failed request is the truth about a provider: a CLI can say "logged in" while its token is dead. */
function learnStatus(provider: ProviderId, result: CompletionResult): void {
  const set = (patch: Partial<ProviderStatus>): void =>
    useApp.setState((s) => ({ status: { ...s.status, [provider]: { installed: true, loggedIn: null, ...s.status[provider], provider, ...patch } } }))
  const now = useApp.getState().status[provider]
  switch (result.errorKind) {
    case 'not-logged-in':
      return set({ loggedIn: false, detail: result.error, reason: undefined })
    case 'login-expired':
      return set({ loggedIn: false, detail: result.error, reason: 'expired' })
    case 'bad-key':
      return set({ loggedIn: false, detail: result.error, reason: 'bad-key' })
    case 'no-credit':
      return set({ detail: result.error, reason: 'no-credit' })
    case 'not-installed':
      return set({ installed: false, loggedIn: false, detail: result.error })
  }
  // A reply came: the account has credit and the provider can be reached.
  if (result.ok && (now?.reason === 'no-credit' || now?.reason === 'offline')) set({ reason: undefined })
}

export function runCompletion(request: CompletionRequest, onEvent?: (e: StreamEvent, textSoFar: string) => void): RunHandle {
  const req = { ...request, route: usableRoute(request) }
  const id = `r${Date.now().toString(36)}${(counter++).toString(36)}`
  let text = ''
  const off = on('ai:event', ({ requestId, event }) => {
    if (requestId !== id) return
    if (event.type === 'text') text += event.delta
    onEvent?.(event, text)
  })
  const done = invoke('ai:complete', id, req)
    .then((result) => {
      learnStatus(req.route.provider, result)
      return { ...result, provider: result.provider ?? req.route.provider }
    })
    .finally(off)
  return { id, done, cancel: () => void invoke('ai:cancel', id) }
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/** The provider row that Settings → AI opens and shows next (a fix button of an error sets it). */
export const useProviderFocus = create<{ provider: ProviderId | null }>(() => ({ provider: null }))

/** Open Settings → AI, with the row of the provider open. */
export function openProviderSettings(provider?: ProviderId): void {
  useProviderFocus.setState({ provider: provider ?? null })
  useUi.getState().openSettings('ai')
}

/** The kind of a failed result. A result without a kind is 'other'. */
export function errorKind(r: CompletionResult): AiErrorKind {
  return r.errorKind ?? 'other'
}

/** The kinds that the writer fixes in Settings → AI. */
const FIX_IN_SETTINGS: AiErrorKind[] = ['not-installed', 'not-logged-in', 'login-expired', 'bad-key', 'no-credit', 'off']

/** When a usage limit ends, for people: "15:05", "Fri 09:00", or the words of the provider. */
function resetLabel(resets: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(resets)) return resets
  const d = new Date(resets)
  if (Number.isNaN(d.getTime())) return resets
  const locale = getT().common.locale
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(locale, time)
  const week = Math.abs(d.getTime() - Date.now()) < 6 * 24 * 60 * 60 * 1000
  return d.toLocaleString(locale, week ? { weekday: 'short', ...time } : { day: 'numeric', month: 'short', ...time })
}

export interface ErrorInfo {
  kind: AiErrorKind
  /** A plain message in the interface language. Show this to the writer. */
  message: string
  /** The text of the provider, for a "Details" disclosure. Undefined when it adds nothing. */
  detail?: string
  /** A button that fixes the problem, for example "Open settings" (it opens the row of the provider) */
  fix?: { label: string; run: () => void }
}

/**
 * Everything to show for a failed result: a plain message, the details, and a fix. The chat and
 * the actions use it; `friendlyError` gives the message only.
 */
export function describeError(r: CompletionResult): ErrorInfo {
  const t = getT().app.aiErrors
  const kind = errorKind(r)
  const name = r.provider ? PROVIDER_LABELS[r.provider].name : t.theAi
  const api = r.provider === 'anthropic' || r.provider === 'openai'
  const text = ((): string => {
    switch (kind) {
      case 'not-installed':
        return t.notInstalled(name)
      case 'not-logged-in':
        return api ? t.noKey(name) : t.notLoggedIn(name)
      case 'login-expired':
        return t.loginExpired(name)
      case 'bad-key':
        return t.badKey(name)
      case 'no-credit':
        return t.noCredit(name)
      case 'rate-limit':
        return r.resets ? t.usageLimitUntil(resetLabel(r.resets)) : t.usageLimit
      case 'overloaded':
        return t.overloaded(name)
      case 'network':
        return t.network(name)
      case 'refused':
        return t.refused
      case 'off':
        return t.off(name)
      case 'cancelled':
        return t.cancelled
      default:
        return t.other(name)
    }
  })()
  // "the AI could not answer" starts a sentence.
  const message = text.charAt(0).toUpperCase() + text.slice(1)
  const detail = kind !== 'cancelled' && r.error && r.error !== message ? r.error : undefined
  const fix = FIX_IN_SETTINGS.includes(kind) ? { label: t.openSettings, run: () => openProviderSettings(r.provider) } : undefined
  return { kind, message, ...(detail ? { detail } : {}), ...(fix ? { fix } : {}) }
}

/** The plain message of a failed result, in the interface language. */
export function friendlyError(r: CompletionResult): string {
  return describeError(r).message
}

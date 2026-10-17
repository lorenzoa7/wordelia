// Run an AI completion through the main process, with streaming callbacks.

import type { CompletionRequest, CompletionResult, StreamEvent } from '@shared/types'
import { invoke, on } from './api'
import { useApp } from '@/stores/app'
import { getT } from './i18n'

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

export function runCompletion(req: CompletionRequest, onEvent?: (e: StreamEvent, textSoFar: string) => void): RunHandle {
  const id = `r${Date.now().toString(36)}${(counter++).toString(36)}`
  let text = ''
  const off = on('ai:event', ({ requestId, event }) => {
    if (requestId !== id) return
    if (event.type === 'text') text += event.delta
    onEvent?.(event, text)
  })
  const done = invoke('ai:complete', id, req)
    .then((result) => {
      // A CLI can say "logged in" while its token is dead. A real call is the truth.
      if (result.errorKind === 'not-logged-in') {
        const p = req.route.provider
        useApp.setState((s) => ({ status: { ...s.status, [p]: { ...s.status[p], provider: p, installed: true, loggedIn: false, detail: result.error, ...(/expired|refresh/i.test(result.error ?? '') ? { reason: 'expired' as const } : {}) } } }))
      }
      return result
    })
    .finally(off)
  return { id, done, cancel: () => void invoke('ai:cancel', id) }
}

export function friendlyError(r: CompletionResult): string {
  const t = getT().app.aiErrors
  switch (r.errorKind) {
    case 'not-installed':
      return r.error ?? t.notInstalled
    case 'not-logged-in':
      return t.connectHint(r.error ?? t.notLoggedIn)
    case 'rate-limit':
      return t.rateLimit
    case 'network':
      return t.network
    case 'cancelled':
      return t.cancelled
    default:
      return r.error ?? t.unknown
  }
}

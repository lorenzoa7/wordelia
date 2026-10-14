// Run an AI completion through the main process, with streaming callbacks.

import type { CompletionRequest, CompletionResult, StreamEvent } from '@shared/types'
import { invoke, on } from './api'

let counter = 0

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
  const done = invoke('ai:complete', id, req).finally(off)
  return { id, done, cancel: () => void invoke('ai:cancel', id) }
}

export function friendlyError(r: CompletionResult): string {
  switch (r.errorKind) {
    case 'not-installed':
      return r.error ?? 'The AI provider is not installed.'
    case 'not-logged-in':
      return `${r.error ?? 'Not logged in.'} Open Settings → AI to connect.`
    case 'rate-limit':
      return 'The AI provider says the usage limit is reached. Try again later.'
    case 'network':
      return 'No connection to the AI provider.'
    case 'cancelled':
      return 'Stopped.'
    default:
      return r.error ?? 'Something went wrong.'
  }
}

// The app update state, kept in step with the main process.

import { create } from 'zustand'
import type { UpdateState } from '@shared/types'
import { invoke, on } from './api'

export const useUpdate = create<UpdateState>(() => ({ state: 'idle' }))

let started = false

/** Start listening. Call once, when the app starts. */
export function watchUpdates(onReady?: (version: string) => void): void {
  if (started) return
  started = true
  void invoke('app:updateState').then((s) => useUpdate.setState(s, true))
  on('app:update', (s) => {
    const was = useUpdate.getState()
    useUpdate.setState(s, true)
    if (s.state === 'ready' && !(was.state === 'ready' && was.version === s.version)) onReady?.(s.version)
  })
}

export function checkForUpdate(): Promise<UpdateState> {
  return invoke('app:checkUpdate')
}

export function installUpdate(): void {
  void invoke('app:installUpdate')
}

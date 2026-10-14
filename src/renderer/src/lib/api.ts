// Typed access to the main process.

import type { EventChannel, InvokeArgs, InvokeChannel, InvokeResult, IpcEventMap } from '@shared/ipc'

export function invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>> {
  return window.wordelia.invoke(channel, ...args)
}

export function on<C extends EventChannel>(channel: C, listener: (payload: IpcEventMap[C]) => void): () => void {
  return window.wordelia.on(channel, listener)
}

export const isE2E = (): boolean => window.wordelia?.isE2E ?? false

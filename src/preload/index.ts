import { contextBridge, ipcRenderer } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type WordeliaBridge } from '../shared/ipc'

const invokeSet = new Set<string>(INVOKE_CHANNELS)
const eventSet = new Set<string>(EVENT_CHANNELS)

const bridge: WordeliaBridge = {
  platform: process.platform,
  isE2E: process.env['WORDELIA_E2E'] === '1',
  invoke(channel, ...args) {
    if (!invokeSet.has(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel, listener) {
    if (!eventSet.has(channel)) throw new Error(`Unknown event: ${channel}`)
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown): void =>
      listener(payload as Parameters<typeof listener>[0])
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('wordelia', bridge)

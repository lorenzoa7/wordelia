import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('wordelia', {
  platform: process.platform
})

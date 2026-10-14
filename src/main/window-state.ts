// Remember the window size, position and maximized state.

import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite } from './fsutil'

interface WindowState {
  bounds: Rectangle
  maximized: boolean
}

const file = (): string => join(app.getPath('userData'), 'window.json')

export function loadWindowState(): WindowState | null {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as WindowState
    // Only use bounds that are still on a screen.
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return s.bounds.x < a.x + a.width && s.bounds.x + s.bounds.width > a.x && s.bounds.y < a.y + a.height && s.bounds.y + s.bounds.height > a.y
    })
    return visible ? s : null
  } catch {
    return null
  }
}

export function trackWindowState(win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized()) return
      const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() }
      void atomicWrite(file(), JSON.stringify(state))
    }, 400)
  }
  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
}

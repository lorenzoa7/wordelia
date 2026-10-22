import { describe, expect, it } from 'vitest'
import { panelLayout } from './panels'

describe('the widths of the side panels', () => {
  it('gives the desk the width between the two panels', () => {
    expect(panelLayout(1440, { sidebarOpen: true, chatOpen: true }).main).toBe(784)
    expect(panelLayout(1440, { sidebarOpen: false, chatOpen: true }).main).toBe(1040)
    expect(panelLayout(1440, { sidebarOpen: false, chatOpen: false }).main).toBe(1440)
  })

  it('makes the chat narrower first in a narrow window, then the sidebar', () => {
    // 1000 px: the chat goes down to its minimum (320), and the sidebar to its minimum (200).
    const both = panelLayout(1000, { sidebarOpen: true, sidebarWidth: 256, chatOpen: true, chatWidth: 400 })
    expect(both).toMatchObject({ chat: 320, sidebar: 200, main: 480 })
    // Without the sidebar, the chat has its width again.
    expect(panelLayout(1000, { sidebarOpen: false, chatOpen: true, chatWidth: 400 })).toMatchObject({ chat: 400, main: 600 })
  })
})

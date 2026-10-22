// The widths of the side panels of the book view: the chapter list (or the planning list) on the left and
// the chat on the right. The desk of the Write view has the width between them.

interface Bounds {
  min: number
  max: number
}

export const SIDEBAR = { min: 200, max: 420, default: 256 }
export const CHAT = { min: 320, max: 680, default: 400 }
/** The page keeps at least this width. In a narrow window the chat gives up width first, then the sidebar. */
export const MAIN_MIN = 560

export const clampTo = (r: Bounds, v: number): number => Math.min(r.max, Math.max(r.min, v))

/** The width of an open side panel on screen: its width, in its bounds, and not wider than `fit` (SidePanel). */
export function panelWidth(r: Bounds, width: number, fit: number): number {
  const cap = Math.max(r.min, Math.min(r.max, fit))
  return Math.min(cap, Math.max(r.min, width))
}

export interface PanelState {
  sidebarOpen: boolean
  sidebarWidth?: number
  chatOpen: boolean
  chatWidth?: number
}

export interface PanelLayout {
  /** The widest that the sidebar can be now */
  sidebarFit: number
  /** The widest that the chat can be now */
  chatFit: number
  /** The widths on screen (0 for a closed panel) */
  sidebar: number
  chat: number
  /** The width between the two panels */
  main: number
}

/** The widths of the panels and of the space between them in a window `vw` pixels wide. */
export function panelLayout(vw: number, ui: PanelState): PanelLayout {
  const sidebarWidth = ui.sidebarWidth ?? SIDEBAR.default
  const sideNow = ui.sidebarOpen ? clampTo(SIDEBAR, sidebarWidth) : 0
  const chatFit = vw - MAIN_MIN - sideNow
  const chat = ui.chatOpen ? Math.max(CHAT.min, Math.min(clampTo(CHAT, ui.chatWidth ?? CHAT.default), chatFit)) : 0
  const sidebarFit = vw - MAIN_MIN - chat
  const sidebar = ui.sidebarOpen ? panelWidth(SIDEBAR, sidebarWidth, sidebarFit) : 0
  return { sidebarFit, chatFit, sidebar, chat, main: vw - sidebar - chat }
}

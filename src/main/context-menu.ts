// Right-click menu: spelling suggestions and clipboard commands.

import { Menu, MenuItem, type BrowserWindow } from 'electron'
import { mainT } from './i18n'

export function installContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', async (_e, params) => {
    const t = (await mainT()).main.contextMenu
    if (win.isDestroyed()) return
    const menu = new Menu()
    const wc = win.webContents
    if (params.misspelledWord) {
      for (const s of params.dictionarySuggestions.slice(0, 6)) {
        menu.append(new MenuItem({ label: s, click: () => wc.replaceMisspelling(s) }))
      }
      if (!params.dictionarySuggestions.length) menu.append(new MenuItem({ label: t.noSuggestions, enabled: false }))
      menu.append(
        new MenuItem({
          label: t.addToDictionary(params.misspelledWord),
          click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        })
      )
      menu.append(new MenuItem({ type: 'separator' }))
    }
    // The role labels of Electron are in English only, so each item gets its label.
    if (params.isEditable) {
      menu.append(new MenuItem({ role: 'cut', label: t.cut, enabled: params.editFlags.canCut }))
      menu.append(new MenuItem({ role: 'copy', label: t.copy, enabled: params.editFlags.canCopy }))
      menu.append(new MenuItem({ role: 'paste', label: t.paste, enabled: params.editFlags.canPaste }))
      menu.append(new MenuItem({ role: 'selectAll', label: t.selectAll }))
    } else if (params.selectionText.trim()) {
      menu.append(new MenuItem({ role: 'copy', label: t.copy }))
    }
    if (menu.items.length) menu.popup({ window: win })
  })
}

/** Use the spell checker languages that best match the book language. */
export function setSpellLanguage(win: BrowserWindow, tag: string): void {
  const session = win.webContents.session
  const available = session.availableSpellCheckerLanguages
  if (!available.length) return // The Windows spell checker picks languages by itself.
  const lower = tag.toLowerCase()
  const exact = available.find((l) => l.toLowerCase() === lower)
  const base = available.find((l) => l.toLowerCase().split('-')[0] === lower.split('-')[0])
  const pick = exact ?? base
  if (pick) session.setSpellCheckerLanguages([pick])
}

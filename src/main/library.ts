// The library: the books that the app knows. Stored in the app data folder.

import { app } from 'electron'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { LibraryItem } from '@shared/types'
import { atomicWrite, readJson } from './fsutil'

const file = (): string => join(app.getPath('userData'), 'library.json')

async function load(): Promise<LibraryItem[]> {
  const items = await readJson<LibraryItem[]>(file(), [])
  return Array.isArray(items) ? items : []
}

async function save(items: LibraryItem[]): Promise<void> {
  await atomicWrite(file(), JSON.stringify(items, null, 2))
}

export async function listLibrary(): Promise<LibraryItem[]> {
  const items = await load()
  const checked = await Promise.all(
    items.map(async (it) => {
      try {
        await stat(join(it.root, 'wordelia.json'))
        return { ...it, missing: false }
      } catch {
        return { ...it, missing: true }
      }
    })
  )
  return checked.sort((a, b) => b.openedAt.localeCompare(a.openedAt))
}

export async function touchLibrary(item: LibraryItem): Promise<void> {
  const items = (await load()).filter((i) => i.root.toLowerCase() !== item.root.toLowerCase())
  items.unshift({ ...item, missing: undefined })
  await save(items.slice(0, 50))
}

export async function removeFromLibrary(root: string): Promise<void> {
  const items = (await load()).filter((i) => i.root.toLowerCase() !== root.toLowerCase())
  await save(items)
}

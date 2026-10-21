// The open book: manifest, chapters, planning entries, threads. Every change is saved to disk.

import { create } from 'zustand'
import {
  ACTIONS_FILE,
  MANIFEST_FILE,
  MANUSCRIPT_DIR,
  PLANNING_DIR,
  SYNC_STATE_FILE,
  THREADS_DIR,
  WRITING_RULES_FILE,
  chapterFromFile,
  chapterToFile,
  entryFromFile,
  entryToFile,
  fileNameFromTitle,
  hashText,
  newId,
  normalizeManifest,
  uniqueName
} from '@shared/book'
import type { AiAction, BookManifest, BookSnapshot, CategoryDef, Chapter, Entry, SyncState, Thread } from '@shared/types'
import { bookActionsFile, parseBookActions } from '@shared/ai/scopes'
import { boardView, findStoryLine, headingName, isStoryLine, parseBoard, renameChapterInBody } from '@shared/storyline'
import { invoke, on } from '@/lib/api'
import { saver } from './saver'
import { untitledChapter } from '@shared/export/model'
import { runFlushers } from '@/lib/flush'
import { getT } from '@/lib/i18n'
import { openingPlace } from '@/features/write/place'

export type BookView = 'write' | 'plan'

interface BookState {
  root: string | null
  manifest: BookManifest | null
  chapters: Chapter[]
  entries: Entry[]
  threads: Thread[]
  writingRules: string
  syncState: SyncState
  /** The actions of this book (`ai/actions.json`). The app settings keep the actions for all books. */
  actions: AiAction[]
  view: BookView
  activeChapterId: string | null
  activeEntryId: string | null
  activeCategory: string | null
  /** Bumped when a file changes outside the app, so open editors reload */
  externalRev: Record<string, number>
  /** The reload of a chapter that Ctrl+Z can undo (a restored version): its value of `externalRev` */
  undoableRev: Record<string, number>
  /** A request to scroll the pages to a chapter (the sidebar, the history, the chat). `n` makes each request new. */
  chapterJump: { id: string; n: number; focus?: boolean } | null

  open(snap: BookSnapshot): void
  close(): Promise<void>
  setView(view: BookView): void
  /** Open a chapter: it becomes active and the pages scroll to it */
  selectChapter(id: string): void
  /** The chapter on screen changed while scrolling: make it active without a jump */
  setActiveChapter(id: string): void
  selectEntry(id: string | null): void
  selectCategory(folder: string | null): void

  updateManifest(patch: Partial<BookManifest>): void
  setChapterBody(id: string, body: string): void
  renameChapter(id: string, title: string): Promise<void>
  addChapter(afterId?: string | null, title?: string, body?: string): Promise<Chapter>
  /** Delete a chapter. Returns a function that puts it back in its place, with its text (Undo). */
  deleteChapter(id: string): Promise<(() => Promise<void>) | null>
  moveChapter(id: string, toIndex: number): void
  reorderChapters(ids: string[]): void
  /** Put back an older text (undo); open editors reload */
  restoreChapter(id: string, body: string): void
  restoreEntry(id: string, body: string, summary: string): void

  createEntry(category: string, name: string, body?: string, extra?: Partial<Entry>): Promise<Entry>
  updateEntry(id: string, patch: Partial<Pick<Entry, 'body' | 'aliases' | 'summary' | 'image'>>): void
  renameEntry(id: string, name: string): Promise<void>
  deleteEntry(id: string): Promise<void>
  addCategory(name: string): CategoryDef
  /** A new name for a category. Its folder stays: the files do not move. */
  renameCategory(id: string, name: string): void
  /** Delete a category: its notes go to the trash; the story line moves to another category. */
  deleteCategory(id: string): Promise<void>
  /** Move a planning entry to another category folder */
  moveEntry(id: string, category: string): Promise<void>

  saveThread(thread: Thread, immediate?: boolean): void
  deleteThread(id: string): Promise<void>
  setWritingRules(text: string): void
  setSyncState(state: SyncState): void
  setActions(actions: AiAction[]): void

  /** Write any text file in the book (used by accepted AI proposals) */
  writeRaw(rel: string, content: string): Promise<void>
}

const now = (): string => new Date().toISOString()

function chapterRel(c: Pick<Chapter, 'file'>): string {
  return `${MANUSCRIPT_DIR}/${c.file}`
}

function entryRel(e: Pick<Entry, 'file'>): string {
  return `${PLANNING_DIR}/${e.file}`
}

let offExternal: (() => void) | null = null

export const useBook = create<BookState>((set, get) => {
  const persistManifest = (m: BookManifest, immediate = false): void => {
    const root = get().root
    if (root) saver.write(root, MANIFEST_FILE, JSON.stringify(m, null, 2) + '\n', immediate)
  }

  const handleExternal = (rel: string, content: string | null): void => {
    const st = get()
    const root = st.root
    if (!root) return
    // Typing that is still in an editor wins over the change from outside: save it first.
    runFlushers()
    if (saver.isPending(root, rel)) return
    if (rel === MANIFEST_FILE && content) {
      try {
        const m = normalizeManifest(JSON.parse(content))
        set({ manifest: m })
      } catch {
        /* a partial write from a sync client: ignore */
      }
      return
    }
    if (rel === WRITING_RULES_FILE && content != null) {
      set({ writingRules: content })
      return
    }
    if (rel === ACTIONS_FILE) {
      try {
        set({ actions: content == null ? [] : parseBookActions(JSON.parse(content)) })
      } catch {
        /* a partial write from a sync client: ignore */
      }
      return
    }
    if (rel.startsWith(`${MANUSCRIPT_DIR}/`) && rel.endsWith('.md')) {
      const file = rel.slice(MANUSCRIPT_DIR.length + 1)
      const existing = st.chapters.find((c) => c.file === file)
      if (content == null) return
      if (!existing) {
        // A new chapter file (put back from the trash, or from a sync client) joins the book at the
        // end, as it does when the book opens. A file in a folder, or with the id of a chapter, does not.
        if (file.includes('/')) return
        const added = chapterFromFile(file, content, `ch_${hashText(file)}`)
        if (st.chapters.some((c) => c.id === added.id)) return
        const chapters = [...st.chapters, added]
        set({ chapters })
        get().updateManifest({ chapters: chapters.map((c) => ({ id: c.id, file: c.file })) })
        return
      }
      const parsed = chapterFromFile(file, content, existing.id)
      if (parsed.body === existing.body && parsed.title === existing.title) return
      set({
        chapters: st.chapters.map((c) => (c.id === existing.id ? { ...parsed, id: existing.id } : c)),
        externalRev: { ...st.externalRev, [existing.id]: (st.externalRev[existing.id] ?? 0) + 1 }
      })
      return
    }
    if (rel.startsWith(`${PLANNING_DIR}/`) && rel.endsWith('.md') && !rel.includes('/_')) {
      const file = rel.slice(PLANNING_DIR.length + 1)
      const existing = st.entries.find((e) => e.file === file)
      if (content == null) {
        if (existing) set({ entries: st.entries.filter((e) => e.id !== existing.id) })
        return
      }
      const parsed = entryFromFile(file, content, existing?.id ?? newId('en'))
      if (existing && parsed.body === existing.body && parsed.summary === existing.summary) return
      set({
        entries: existing ? st.entries.map((e) => (e.id === existing.id ? parsed : e)) : [...st.entries, parsed],
        externalRev: existing ? { ...st.externalRev, [existing.id]: (st.externalRev[existing.id] ?? 0) + 1 } : st.externalRev
      })
    }
  }

  return {
    root: null,
    manifest: null,
    chapters: [],
    entries: [],
    threads: [],
    writingRules: '',
    syncState: { chapters: {}, syncedAt: null },
    actions: [],
    view: 'write',
    activeChapterId: null,
    activeEntryId: null,
    activeCategory: null,
    externalRev: {},
    undoableRev: {},
    chapterJump: null,

    open(snap) {
      offExternal?.()
      void invoke('window:setSpellLanguage', snap.manifest.language)
      offExternal = on('book:externalChange', (e) => {
        if (e.root === get().root) handleExternal(e.rel, e.content)
      })
      set({
        root: snap.root,
        manifest: snap.manifest,
        chapters: snap.chapters,
        entries: snap.entries,
        threads: snap.threads,
        writingRules: snap.writingRules,
        syncState: snap.syncState,
        actions: snap.actions ?? [],
        // The view and the chapter where the author was (features/write/place.ts); no old jump.
        ...openingPlace(snap.root, snap.chapters.map((c) => c.id)),
        activeEntryId: null,
        activeCategory: null,
        externalRev: {},
        undoableRev: {},
        chapterJump: null
      })
    },

    async close() {
      runFlushers()
      await saver.flush()
      const root = get().root
      if (root) await invoke('book:close', root)
      offExternal?.()
      offExternal = null
      set({ root: null, manifest: null, chapters: [], entries: [], threads: [], actions: [], activeChapterId: null, activeEntryId: null })
    },

    setView(view) {
      set({ view })
    },
    selectChapter(id) {
      set({ activeChapterId: id, view: 'write', chapterJump: { id, n: (get().chapterJump?.n ?? 0) + 1 } })
    },
    setActiveChapter(id) {
      if (get().activeChapterId !== id) set({ activeChapterId: id })
    },
    selectEntry(id) {
      const e = get().entries.find((x) => x.id === id)
      // The story line has its own page: the Line view (features/graph/nav.ts, LINE_PAGE).
      if (e && isStoryLine(e)) return set({ activeEntryId: null, view: 'plan', activeCategory: ':line' })
      set({ activeEntryId: id, view: 'plan', activeCategory: e?.category ?? get().activeCategory })
    },
    selectCategory(folder) {
      set({ activeCategory: folder, activeEntryId: null, view: 'plan' })
    },

    updateManifest(patch) {
      const m = get().manifest
      if (!m) return
      const next = { ...m, ...patch, updatedAt: now() }
      set({ manifest: next })
      persistManifest(next)
      if (patch.language && patch.language !== m.language) void invoke('window:setSpellLanguage', patch.language)
    },

    setChapterBody(id, body) {
      const { chapters, root } = get()
      const ch = chapters.find((c) => c.id === id)
      if (!ch || !root || ch.body === body) return
      const next = { ...ch, body }
      set({ chapters: chapters.map((c) => (c.id === id ? next : c)) })
      saver.write(root, chapterRel(next), chapterToFile(next))
    },

    async renameChapter(id, title) {
      runFlushers()
      const { chapters, root } = get()
      const ch = chapters.find((c) => c.id === id)
      if (!ch || !root) return
      const clean = title.trim() || getT().common.untitled
      const others = chapters.filter((c) => c.id !== id).map((c) => c.file)
      const file = uniqueName(fileNameFromTitle(clean), others)
      const oldRel = chapterRel(ch)
      // Point the store at the new file first, so every later write goes there.
      set({ chapters: get().chapters.map((c) => (c.id === id ? { ...c, title: clean, file } : c)) })
      const next = get().chapters.find((c) => c.id === id)!
      if (file.toLowerCase() === ch.file.toLowerCase()) {
        // Same file, or only the case changes: rename in place.
        if (file !== ch.file) {
          saver.cancel(root, oldRel)
          await invoke('book:renameFile', root, oldRel, chapterRel(next))
        }
        saver.write(root, chapterRel(next), chapterToFile(next), true)
      } else {
        // Write the new file, then remove the old one.
        saver.cancel(root, oldRel)
        saver.write(root, chapterRel(next), chapterToFile(next), true)
        await saver.flush()
        await invoke('book:deleteFile', root, oldRel)
      }
      get().updateManifest({ chapters: get().chapters.map((c) => ({ id: c.id, file: c.file })) })
      // The column of the chapter in the story line follows the new title.
      const story = findStoryLine(get().entries)
      if (story && clean !== ch.title) {
        const body = renameChapterInBody(story.body, id, chapters, get().chapters)
        if (body !== story.body) get().updateEntry(story.id, { body })
        // A story line proposal that the author decided in part keeps its two lines: they follow too.
        const now = get().chapters
        for (const th of get().threads) {
          if (!th.messages.some((m) => m.lineAfter !== undefined)) continue
          const messages = th.messages.map((m) =>
            m.lineAfter === undefined
              ? m
              : {
                  ...m,
                  lineAfter: renameChapterInBody(m.lineAfter, id, chapters, now),
                  ...(m.lineBefore !== undefined ? { lineBefore: renameChapterInBody(m.lineBefore, id, chapters, now) } : {})
                }
          )
          get().saveThread({ ...th, messages })
        }
      }
    },

    async addChapter(afterId, title, body = '') {
      const { chapters, root } = get()
      if (!root) throw new Error('No book is open')
      const idx = afterId ? chapters.findIndex((c) => c.id === afterId) + 1 : chapters.length
      // A new last chapter takes the title of the first planned chapter of the story line: its column
      // becomes the column of the chapter, with its cards.
      const story = idx === chapters.length && !title ? findStoryLine(get().entries) : null
      const heading = story ? boardView(parseBoard(story.body), 'chapter', chapters).find((c) => c.kind === 'planned')?.title : undefined
      const planned = heading ? headingName(heading) : undefined
      // Else a title without a number: a number in the title would be wrong after the chapter moves.
      const t = title ?? (planned || untitledChapter(get().manifest?.language ?? 'en'))
      const file = uniqueName(fileNameFromTitle(t), chapters.map((c) => c.file))
      const ch: Chapter = { id: newId('ch'), file, title: t, body, meta: {} }
      const next = [...chapters.slice(0, idx), ch, ...chapters.slice(idx)]
      set({ chapters: next, activeChapterId: ch.id, view: 'write', chapterJump: { id: ch.id, n: (get().chapterJump?.n ?? 0) + 1, focus: true } })
      saver.write(root, chapterRel(ch), chapterToFile(ch), true)
      get().updateManifest({ chapters: next.map((c) => ({ id: c.id, file: c.file })) })
      return ch
    },

    async deleteChapter(id) {
      runFlushers()
      await saver.flush()
      const { chapters, root, activeChapterId } = get()
      const ch = chapters.find((c) => c.id === id)
      if (!ch || !root) return null
      // Leave the chapter first, so no editor writes it again.
      const next = chapters.filter((c) => c.id !== id)
      const idx = chapters.findIndex((c) => c.id === id)
      set({
        chapters: next,
        activeChapterId: activeChapterId === id ? (next[Math.max(0, idx - 1)]?.id ?? null) : activeChapterId
      })
      saver.cancel(root, chapterRel(ch))
      // Move to a hidden trash folder instead of deleting: text is precious.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const trash = `.wordelia/trash/${stamp} ${ch.file}`
      await invoke('book:renameFile', root, chapterRel(ch), trash)
      get().updateManifest({ chapters: get().chapters.map((c) => ({ id: c.id, file: c.file })) })
      return async () => {
        const st = get()
        if (st.root !== root || st.chapters.some((c) => c.id === ch.id)) return
        // Its old place, among the chapters that are still there; another file with its name keeps it.
        const file = uniqueName(ch.file, st.chapters.map((c) => c.file))
        const back = { ...ch, file }
        const at = Math.min(idx, st.chapters.length)
        const list = [...st.chapters.slice(0, at), back, ...st.chapters.slice(at)]
        set({ chapters: list, activeChapterId: back.id, view: 'write', chapterJump: { id: back.id, n: (st.chapterJump?.n ?? 0) + 1 } })
        // The file of the trash comes back; the text in memory is the same.
        await invoke('book:renameFile', root, trash, chapterRel(back)).catch(() => saver.write(root, chapterRel(back), chapterToFile(back), true))
        if (file !== ch.file) saver.write(root, chapterRel(back), chapterToFile(back), true)
        get().updateManifest({ chapters: list.map((c) => ({ id: c.id, file: c.file })) })
      }
    },

    moveChapter(id, toIndex) {
      const chapters = [...get().chapters]
      const from = chapters.findIndex((c) => c.id === id)
      if (from < 0) return
      const [ch] = chapters.splice(from, 1)
      chapters.splice(Math.max(0, Math.min(toIndex, chapters.length)), 0, ch)
      set({ chapters })
      get().updateManifest({ chapters: chapters.map((c) => ({ id: c.id, file: c.file })) })
    },

    restoreChapter(id, body) {
      get().setChapterBody(id, body)
      // An open editor loads the text as one step that Ctrl+Z can undo.
      const rev = (get().externalRev[id] ?? 0) + 1
      set({ externalRev: { ...get().externalRev, [id]: rev }, undoableRev: { ...get().undoableRev, [id]: rev } })
    },

    restoreEntry(id, body, summary) {
      get().updateEntry(id, { body, summary })
      set({ externalRev: { ...get().externalRev, [id]: (get().externalRev[id] ?? 0) + 1 } })
    },

    reorderChapters(ids) {
      const byId = new Map(get().chapters.map((c) => [c.id, c]))
      const chapters = ids.map((id) => byId.get(id)).filter((c): c is Chapter => Boolean(c))
      if (chapters.length !== byId.size) return
      set({ chapters })
      get().updateManifest({ chapters: chapters.map((c) => ({ id: c.id, file: c.file })) })
    },

    async createEntry(category, name, body = '', extra = {}) {
      const { entries, root } = get()
      if (!root) throw new Error('No book is open')
      const inCat = entries.filter((e) => e.category === category).map((e) => e.file.slice(category.length + 1))
      const fileName = uniqueName(fileNameFromTitle(name), inCat)
      const e: Entry = {
        id: newId('en'),
        category,
        file: `${category}/${fileName}`,
        name: fileName.replace(/\.md$/, ''),
        aliases: [],
        summary: '',
        image: null,
        body,
        meta: {},
        ...extra
      }
      set({ entries: [...entries, e] })
      saver.write(root, entryRel(e), entryToFile(e), true)
      return e
    },

    updateEntry(id, patch) {
      const { entries, root } = get()
      const e = entries.find((x) => x.id === id)
      if (!e || !root) return
      const next = { ...e, ...patch }
      set({ entries: entries.map((x) => (x.id === id ? next : x)) })
      saver.write(root, entryRel(next), entryToFile(next))
    },

    async renameEntry(id, name) {
      runFlushers()
      const { entries, root } = get()
      const e = entries.find((x) => x.id === id)
      if (!e || !root) return
      const others = entries.filter((x) => x.category === e.category && x.id !== id).map((x) => x.file.slice(e.category.length + 1))
      const fileName = uniqueName(fileNameFromTitle(name.trim() || getT().common.untitled), others)
      const file = `${e.category}/${fileName}`
      if (file === e.file) return
      const oldRel = entryRel(e)
      set({ entries: get().entries.map((x) => (x.id === id ? { ...x, file, name: fileName.replace(/\.md$/, '') } : x)) })
      const next = get().entries.find((x) => x.id === id)!
      saver.cancel(root, oldRel)
      if (file.toLowerCase() === e.file.toLowerCase()) {
        await invoke('book:renameFile', root, oldRel, entryRel(next))
        saver.write(root, entryRel(next), entryToFile(next), true)
      } else {
        saver.write(root, entryRel(next), entryToFile(next), true)
        await saver.flush()
        await invoke('book:deleteFile', root, oldRel)
      }
    },

    async deleteEntry(id) {
      runFlushers()
      await saver.flush()
      const { entries, root, activeEntryId } = get()
      const e = entries.find((x) => x.id === id)
      if (!e || !root) return
      // Close the entry first, so no editor writes it again.
      set({ entries: entries.filter((x) => x.id !== id), activeEntryId: activeEntryId === id ? null : activeEntryId })
      saver.cancel(root, entryRel(e))
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      await invoke('book:renameFile', root, entryRel(e), `.wordelia/trash/${stamp} ${e.name}.md`)
    },

    addCategory(name) {
      const m = get().manifest
      if (!m) throw new Error('No book is open')
      const folder = uniqueName(fileNameFromTitle(name, ''), m.planning.categories.map((c) => c.folder))
      const cat: CategoryDef = { id: newId('cat'), name: name.trim() || folder, folder, icon: 'Folder' }
      get().updateManifest({ planning: { categories: [...m.planning.categories, cat] } })
      return cat
    },

    renameCategory(id, name) {
      const m = get().manifest
      const clean = name.trim()
      if (!m || !clean) return
      get().updateManifest({ planning: { ...m.planning, categories: m.planning.categories.map((c) => (c.id === id ? { ...c, name: clean } : c)) } })
    },

    async deleteCategory(id) {
      const m = get().manifest
      const cat = m?.planning.categories.find((c) => c.id === id)
      const rest = m?.planning.categories.filter((c) => c.id !== id) ?? []
      if (!m || !cat || !rest.length) return
      // The story line does not show in the categories: it lives on in another one.
      const story = findStoryLine(get().entries)
      if (story && story.category === cat.folder) {
        const to = rest.find((c) => c.id === 'plot') ?? rest.find((c) => c.id === 'notes') ?? rest[0]
        await get().moveEntry(story.id, to.folder)
      }
      // Notes in folders under the category go too: else they would stay on disk, out of sight.
      const inside = (x: Entry): boolean => x.category === cat.folder || x.category.startsWith(`${cat.folder}/`)
      for (const e of get().entries.filter(inside)) await get().deleteEntry(e.id)
      const now = get().manifest!
      get().updateManifest({ planning: { ...now.planning, categories: now.planning.categories.filter((c) => c.id !== id) } })
      if (get().activeCategory === cat.folder) get().selectCategory(null)
    },

    async moveEntry(id, category) {
      runFlushers()
      await saver.flush()
      const { entries, root } = get()
      const e = entries.find((x) => x.id === id)
      if (!e || !root || e.category === category) return
      const inCat = entries.filter((x) => x.category === category).map((x) => x.file.slice(category.length + 1))
      const fileName = uniqueName(`${e.name}.md`, inCat)
      const next = { ...e, category, file: `${category}/${fileName}`, name: fileName.replace(/\.md$/, '') }
      const oldRel = entryRel(e)
      set({ entries: get().entries.map((x) => (x.id === id ? next : x)) })
      saver.cancel(root, oldRel)
      saver.write(root, entryRel(next), entryToFile(next), true)
      await saver.flush()
      await invoke('book:deleteFile', root, oldRel)
    },

    saveThread(thread, immediate = false) {
      const { threads, root } = get()
      if (!root) return
      const exists = threads.some((t) => t.id === thread.id)
      const next = exists ? threads.map((t) => (t.id === thread.id ? thread : t)) : [thread, ...threads]
      set({ threads: next })
      saver.write(root, `${THREADS_DIR}/${thread.id}.json`, JSON.stringify(thread, null, 2), immediate)
    },

    async deleteThread(id) {
      const { threads, root } = get()
      if (!root) return
      saver.cancel(root, `${THREADS_DIR}/${id}.json`)
      await invoke('book:deleteFile', root, `${THREADS_DIR}/${id}.json`)
      set({ threads: threads.filter((t) => t.id !== id) })
    },

    setWritingRules(text) {
      const root = get().root
      set({ writingRules: text })
      if (root) saver.write(root, WRITING_RULES_FILE, text)
    },

    setSyncState(state) {
      const root = get().root
      set({ syncState: state })
      if (root) saver.write(root, SYNC_STATE_FILE, JSON.stringify(state, null, 2), true)
    },

    setActions(actions) {
      const root = get().root
      if (!root) return
      set({ actions })
      saver.write(root, ACTIONS_FILE, bookActionsFile(actions))
    },

    async writeRaw(rel, content) {
      const root = get().root
      if (!root) return
      if (!(rel.startsWith(`${PLANNING_DIR}/`) && rel.endsWith('.md'))) {
        saver.write(root, rel, content, true)
        return
      }
      // Keep the in-memory book in step with the file. The file gets a stable id.
      {
        const file = rel.slice(PLANNING_DIR.length + 1)
        const existing = get().entries.find((e) => e.file === file)
        const parsed = entryFromFile(file, content, existing?.id ?? newId('en'))
        saver.write(root, rel, entryToFile(parsed), true)
        set({
          entries: existing ? get().entries.map((e) => (e.id === existing.id ? parsed : e)) : [...get().entries, parsed],
          externalRev: existing ? { ...get().externalRev, [existing.id]: (get().externalRev[existing.id] ?? 0) + 1 } : get().externalRev
        })
        // A new category folder becomes a category.
        const cat = file.split('/')[0]
        const m = get().manifest
        if (m && file.includes('/') && !m.planning.categories.some((c) => c.folder === cat)) {
          get().updateManifest({
            planning: { categories: [...m.planning.categories, { id: newId('cat'), name: cat, folder: cat, icon: 'Folder' }] }
          })
        }
      }
    }
  }
})

export function activeChapter(): Chapter | undefined {
  const s = useBook.getState()
  return s.chapters.find((c) => c.id === s.activeChapterId)
}

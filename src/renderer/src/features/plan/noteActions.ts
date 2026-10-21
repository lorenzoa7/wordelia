// What the writer does to notes and categories in the Plan view: rename a note (its links and
// mentions follow), add an alias, delete and move a note, remove a portrait, add, rename and delete
// a category. Each one tells the result in a toast; the ones that change much have Undo.

import { markdownToPlain } from '@shared/book'
import { MESSAGES } from '@shared/i18n'
import { findStoryLine, isStoryLine } from '@shared/storyline'
import { nameKey, nameOwner, renameLinks, renameMentionsInBoard, textUsesName, topFolder } from '@shared/planning/notes'
import type { CategoryDef, Entry } from '@shared/types'
import { categoryName, getT } from '@/lib/i18n'
import { runFlushers } from '@/lib/flush'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'

/** The notes without the story line: their names are the names that links and mentions use. */
function notes(): Entry[] {
  return useBook.getState().entries.filter((e) => !isStoryLine(e))
}

function categoryLabel(folder: string): string {
  const t = getT()
  const def = useBook.getState().manifest?.planning.categories.find((c) => c.folder === topFolder(folder))
  return def ? categoryName(t, def) : folder || t.plan.sidebar.outside
}

/** The default name of a new note, in any interface language: it does not stay as an alias. */
function isDefaultName(name: string): boolean {
  const key = nameKey(name).replace(/ \d+$/, '')
  return Object.values(MESSAGES).some((m) => nameKey(m.plan.newEntryName) === key || nameKey(m.common.untitled) === key) || key === 'new entry'
}

/* ------------------------------------------------------------------ */
/* Names                                                                */
/* ------------------------------------------------------------------ */

/**
 * Give a note a new name. The [[links]] in the notes and the @mentions on the story line take the
 * new name. When the chapters or the notes still use the old name as plain text, it stays as an
 * alias, so the mentions in the manuscript still count. The chapters do not change: they are the
 * text of the writer. False when the name did not change (empty, or the name of another note).
 */
export async function renameNote(id: string, name: string): Promise<boolean> {
  const t = getT()
  const book = useBook.getState()
  const e = book.entries.find((x) => x.id === id)
  const clean = name.replace(/\s+/g, ' ').trim()
  if (!e || !clean || clean === e.name) return false
  // Two notes with one name: a link could not know which note it opens.
  if (nameOwner(notes(), clean, id)) {
    toast(t.plan.names.nameTaken(clean), { kind: 'error' })
    return false
  }
  const before = book.entries
  const oldName = e.name
  if (!(await book.renameEntry(id, clean))) return false
  const sameName = nameKey(oldName) === nameKey(clean)

  // The links in the notes (and in their summaries).
  const changed: Array<{ id: string; body: string; summary: string; nextBody: string; nextSummary: string }> = []
  let links = 0
  for (const x of useBook.getState().entries) {
    if (isStoryLine(x)) continue
    const body = renameLinks(x.body, oldName, clean)
    const summary = renameLinks(x.summary, oldName, clean)
    if (!body.count && !summary.count) continue
    links += body.count + summary.count
    changed.push({ id: x.id, body: x.body, summary: x.summary, nextBody: body.text, nextSummary: summary.text })
  }
  for (const c of changed) useBook.getState().restoreEntry(c.id, c.nextBody, c.nextSummary)

  // The mentions on the cards of the story line.
  const story = findStoryLine(useBook.getState().entries)
  let storyBefore: string | null = null
  let storyAfter: string | null = null
  if (story) {
    const r = renameMentionsInBoard(story.body, id, oldName, clean, before, useBook.getState().chapters)
    if (r) {
      storyBefore = story.body
      storyAfter = r.body
      links += r.count
      useBook.getState().updateEntry(story.id, { body: r.body })
    }
  }

  // The old name as an alias, when the text of the book still uses it.
  const now = useBook.getState()
  const renamed = now.entries.find((x) => x.id === id)!
  const stillUsed =
    !sameName &&
    !isDefaultName(oldName) &&
    !renamed.aliases.some((a) => nameKey(a) === nameKey(oldName)) &&
    !nameOwner(notes(), oldName, id) &&
    (now.chapters.some((c) => textUsesName(markdownToPlain(c.body), oldName)) ||
      now.entries.some((x) => x.id !== id && !isStoryLine(x) && textUsesName(markdownToPlain(`${x.summary}\n\n${x.body}`), oldName)))
  if (stillUsed) now.updateEntry(id, { aliases: [...renamed.aliases, oldName] })

  if (!links && !stillUsed) return true
  const undo = async (): Promise<void> => {
    runFlushers()
    const s = useBook.getState()
    const cur = s.entries.find((x) => x.id === id)
    // Undo only while nothing changed after the rename: else it could remove new words.
    const safe =
      cur?.name === clean &&
      changed.every((c) => {
        const x = s.entries.find((y) => y.id === c.id)
        return x?.body === c.nextBody && x.summary === c.nextSummary
      }) &&
      (storyAfter === null || findStoryLine(s.entries)?.body === storyAfter)
    if (!safe || !cur) {
      toast(t.chat.undoUnsafe, { kind: 'error' })
      return
    }
    for (const c of changed) s.restoreEntry(c.id, c.body, c.summary)
    if (story && storyBefore !== null) s.updateEntry(story.id, { body: storyBefore })
    if (stillUsed) s.updateEntry(id, { aliases: cur.aliases.filter((a) => a !== oldName) })
    await s.renameEntry(id, oldName)
  }
  toast(t.plan.names.renamed(links, stillUsed ? oldName : null), { ms: 10000, action: { label: t.common.undo, run: () => void undo() } })
  return true
}

/** Add an alias to a note. False (with a toast) when the note or another note already has this name. */
export function addAlias(id: string, alias: string): boolean {
  const t = getT()
  const e = useBook.getState().entries.find((x) => x.id === id)
  const clean = alias.replace(/\s+/g, ' ').trim()
  if (!e || !clean) return false
  if ([e.name, ...e.aliases].some((n) => nameKey(n) === nameKey(clean))) {
    toast(t.plan.names.aliasOwn(clean), { kind: 'error' })
    return false
  }
  const owner = nameOwner(notes(), clean, id)
  if (owner) {
    toast(t.plan.names.aliasTaken(clean, owner.name), { kind: 'error' })
    return false
  }
  useBook.getState().updateEntry(id, { aliases: [...e.aliases, clean] })
  return true
}

/* ------------------------------------------------------------------ */
/* Notes                                                                */
/* ------------------------------------------------------------------ */

/** Move a note to the trash of the book. The toast can bring it back. */
export async function deleteNote(id: string): Promise<void> {
  const t = getT()
  const trashed = await useBook.getState().deleteEntry(id)
  if (!trashed) return
  toast(t.plan.entry.deleted(trashed.entry.name), {
    ms: 10000,
    action: {
      label: t.common.undo,
      run: () =>
        void useBook
          .getState()
          .restoreEntries([trashed])
          .then(() => {
            // Still on the Plan page that the delete left: the note shows again.
            const s = useBook.getState()
            if (s.view === 'plan' && !s.activeEntryId) s.selectEntry(trashed.entry.id)
          })
    }
  })
}

/** Move a note to another category. The toast can move it back. */
export async function moveNote(id: string, folder: string): Promise<void> {
  const t = getT()
  const e = useBook.getState().entries.find((x) => x.id === id)
  if (!e || e.category === folder) return
  const from = e.category
  await useBook.getState().moveEntry(id, folder)
  const moved = useBook.getState().entries.find((x) => x.id === id)
  if (!moved) return
  toast(t.plan.entry.moved(moved.name, categoryLabel(folder)), {
    ms: 9000,
    action: { label: t.common.undo, run: () => void useBook.getState().moveEntry(id, from) }
  })
}

/** Remove the portrait of a note. The toast can put it back. */
export function removePortrait(id: string): void {
  const t = getT()
  const e = useBook.getState().entries.find((x) => x.id === id)
  if (!e?.image) return
  const image = e.image
  useBook.getState().updateEntry(id, { image: null })
  toast(t.plan.entry.imageRemoved, {
    ms: 9000,
    action: {
      label: t.common.undo,
      run: () => {
        // A new portrait meanwhile stays.
        if (useBook.getState().entries.find((x) => x.id === id)?.image === null) useBook.getState().updateEntry(id, { image })
      }
    }
  })
}

/**
 * "Create it" on a [[link]] to a note that does not exist: a new note with the name of the link.
 * From a note, it goes in the category of that note; from a chapter, in Notes. The note opens:
 * its category control can move it at once.
 */
export async function createFromLink(name: string): Promise<void> {
  const t = getT()
  const book = useBook.getState()
  const cats = book.manifest?.planning.categories ?? []
  const from = book.view === 'plan' ? book.entries.find((e) => e.id === book.activeEntryId) : undefined
  const near = from && !isStoryLine(from) ? cats.find((c) => c.folder === topFolder(from.category)) : undefined
  const folder = (near ?? cats.find((c) => c.id === 'notes') ?? cats[0])?.folder ?? 'Notes'
  const created = await book.createEntry(folder, name)
  useBook.getState().selectEntry(created.id)
  toast(t.plan.links.created(created.name, categoryLabel(folder)))
}

/* ------------------------------------------------------------------ */
/* Categories                                                           */
/* ------------------------------------------------------------------ */

function categoryTaken(name: string, exceptId?: string): boolean {
  const t = getT()
  const cats = useBook.getState().manifest?.planning.categories ?? []
  return cats.some((c) => c.id !== exceptId && (nameKey(categoryName(t, c)) === nameKey(name) || nameKey(c.folder) === nameKey(name)))
}

/** A new category. It opens. Null (with a toast) when a category already has this name. */
export function addCategoryNamed(name: string): CategoryDef | null {
  const t = getT()
  if (categoryTaken(name)) {
    toast(t.plan.names.categoryTaken(name.trim()), { kind: 'error' })
    return null
  }
  const cat = useBook.getState().addCategory(name)
  useBook.getState().selectCategory(cat.folder)
  return cat
}

/** A new name for a category. False (with a toast) when another category has this name. */
export function renameCategoryNamed(id: string, name: string): boolean {
  const t = getT()
  if (categoryTaken(name, id)) {
    toast(t.plan.names.categoryTaken(name.trim()), { kind: 'error' })
    return false
  }
  useBook.getState().renameCategory(id, name)
  return true
}

/** Delete a category and its notes. The toast can bring them back. */
export async function deleteCategoryWithUndo(id: string): Promise<void> {
  const t = getT()
  const deleted = await useBook.getState().deleteCategory(id)
  if (!deleted) return
  toast(t.plan.sidebar.categoryDeleted(categoryName(t, deleted.category), deleted.entries.length), {
    ms: 10000,
    action: { label: t.common.undo, run: () => void useBook.getState().restoreCategory(deleted) }
  })
}

// Run an action (for example Polish) on the selection of the open chapter.

import { serializeMarkdown } from '@shared/markdown/serialize'
import { buildActionSystem, buildActionUser, extractRewrite } from '@shared/prompts/action'
import { contextAround } from '@shared/prompts/context'
import type { AiAction, DocNode } from '@shared/types'
import { friendlyError, runCompletion, type RunHandle } from '@/lib/ai'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { getActiveEditor } from '@/features/editor/registry'
import { proposedPlain, reviewKey, textWithMap } from '@/features/editor/review'
import { create } from 'zustand'

interface ActionRunState {
  running: boolean
  words: number
  actionId: string | null
  handle: RunHandle | null
}

export const useActionRun = create<ActionRunState>(() => ({ running: false, words: 0, actionId: null, handle: null }))

let seq = 0

export function cancelAction(): void {
  const h = useActionRun.getState().handle
  h?.cancel()
  getActiveEditor()?.editor.commands.rejectReview()
  useActionRun.setState({ running: false, handle: null })
}

/** Run an action on [from, to], or on the selection, or on the paragraph of the cursor. */
export async function runAction(action: AiAction, range?: { from: number; to: number }): Promise<void> {
  const active = getActiveEditor()
  if (!active) return
  const { editor } = active
  if (reviewKey.getState(editor.state)) cancelAction()

  const settings = useApp.getState().settings
  const route = action.route ?? settings?.routes.action ?? settings?.routes.chat ?? null
  if (!route) {
    toast('Connect an AI first.', { action: { label: 'Open settings', run: () => useUi.getState().openSettings('ai') } })
    return
  }

  let { from, to } = range ?? editor.state.selection
  if (from === to) {
    const $from = editor.state.selection.$from
    if (!$from.parent.isTextblock || $from.parent.content.size === 0) return
    from = $from.start()
    to = $from.end()
  }
  const doc = editor.state.doc
  ;({ from, to } = normalizeRange(doc, from, to))
  if (from >= to) return

  // The selection as Markdown keeps *italic* and other marks.
  const slice = doc.slice(from, to, true)
  const selectionDoc = editor.schema.topNodeType.create(null, slice.content)
  const selection = serializeMarkdown(selectionDoc.toJSON() as DocNode).trim()
  if (!selection) return

  const full = textWithMap(doc, 0, doc.content.size)
  const startIdx = full.map.findIndex((p) => p >= from)
  const endIdx = full.map.findIndex((p) => p >= to)
  const ctx = contextAround(full.text, startIdx < 0 ? full.text.length : startIdx, endIdx < 0 ? full.text.length : endIdx, action.contextChars)

  const book = useBook.getState()
  const chapter = book.chapters.find((c) => c.id === active.chapterId)
  if (!book.manifest) return
  const input = {
    book: { manifest: book.manifest, writingRules: book.writingRules, entries: book.entries },
    action,
    before: ctx.before,
    selection,
    after: ctx.after,
    chapterTitle: chapter?.title ?? ''
  }

  const id = `review-${++seq}`
  // Collapse the selection: the review marks show the range, and the selection menu closes.
  editor.chain().setTextSelection(to).startReview({ id, from, to, label: action.name }).run()
  useActionRun.setState({ running: true, words: 0, actionId: action.id })

  const handle = runCompletion(
    {
      route,
      purpose: 'action',
      system: buildActionSystem(input),
      messages: [{ role: 'user', content: buildActionUser(input) }]
    },
    (e, text) => {
      if (e.type === 'text') useActionRun.setState({ words: (extractRewrite(text).text.match(/\S+/g) ?? []).length })
    }
  )
  useActionRun.setState({ handle })
  const result = await handle.done
  useActionRun.setState({ running: false, handle: null })

  const current = reviewKey.getState(editor.state)
  if (!current || current.id !== id) return // cancelled or replaced
  if (!result.ok) {
    if (result.errorKind !== 'cancelled') toast(friendlyError(result), { kind: 'error' })
    editor.commands.rejectReview()
    return
  }
  const rewrite = extractRewrite(result.text).text
  if (!rewrite || proposedPlain(rewrite) === current.original.trim()) {
    toast('The AI found nothing to change.')
    editor.commands.rejectReview()
    return
  }
  editor.commands.updateReview(id, rewrite, 'ready')
}

/**
 * A selection that ends at the very start of a paragraph (or starts at the very end of one)
 * includes an empty piece of that paragraph. Leave that piece out, so a one-paragraph rewrite
 * does not join two paragraphs.
 */
export function normalizeRange(doc: import('@tiptap/pm/model').Node, from: number, to: number): { from: number; to: number } {
  let a = from
  let b = to
  const $b = doc.resolve(b)
  if (b > a && $b.parent.isTextblock && $b.parentOffset === 0) {
    // Move back to the end of the previous textblock.
    let pos = $b.before() // position before this block
    while (pos > a) {
      const $p = doc.resolve(pos)
      const before = $p.nodeBefore
      if (!before) break
      if (before.isTextblock) {
        b = pos - 1
        break
      }
      pos -= before.nodeSize
    }
  }
  const $a = doc.resolve(a)
  if (b > a && $a.parent.isTextblock && $a.parentOffset === $a.parent.content.size) {
    let pos = $a.after()
    while (pos < b) {
      const after = doc.resolve(pos).nodeAfter
      if (!after) break
      if (after.isTextblock) {
        a = pos + 1
        break
      }
      pos += after.nodeSize
    }
  }
  return { from: a, to: Math.max(a, b) }
}

export async function retryAction(): Promise<void> {
  const active = getActiveEditor()
  if (!active) return
  const r = reviewKey.getState(active.editor.state)
  const actionId = useActionRun.getState().actionId
  const action = useApp.getState().settings?.actions.find((a) => a.id === actionId)
  if (!r || !action) return
  const range = { from: r.from, to: r.to }
  active.editor.commands.rejectReview()
  await runAction(action, range)
}

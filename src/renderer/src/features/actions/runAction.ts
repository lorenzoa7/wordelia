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
import { normalizeRange } from './range'
import { SNAPSHOT_EN, snapshot } from '@/features/history/snapshots'
import { actionInstructions, getT } from '@/lib/i18n'
import { typesetForBook } from '@/lib/typeset'
import { nearestEffort } from '@shared/ai/effort'
import { findAction } from './allActions'

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
  const base = action.route ?? settings?.routes.action ?? settings?.routes.chat ?? null
  // The action can set its own effort over the effort of its model setting.
  const baseModel = base ? useApp.getState().models[base.provider]?.find((m) => m.id === base.model) : undefined
  const effort = action.effort ? nearestEffort(action.effort, baseModel) : base?.effort
  const route = base ? { provider: base.provider, model: base.model, ...(effort ? { effort } : {}) } : null
  const t = getT()
  if (!route) {
    toast(t.write.action.connectFirst, { action: { label: t.write.action.openSettings, run: () => useUi.getState().openSettings('ai') } })
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
    // Built-in instructions that the user did not change go in the interface language, as the settings show them.
    action: { ...action, instructions: actionInstructions(t, action) },
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
  const rewrite = typesetForBook(extractRewrite(result.text).text)
  if (!rewrite || proposedPlain(rewrite) === current.original.trim()) {
    if (window.wordelia.isE2E) console.warn('[action reply]', JSON.stringify(result.text.slice(0, 3000)))
    toast(rewrite ? t.write.action.nothingToChange : t.write.action.noRewrite)
    editor.commands.rejectReview()
    return
  }
  // Keep the text before the AI change in the version history. The label stays in English; the history translates it.
  snapshot(active.chapterId, SNAPSHOT_EN.before(action.name))
  editor.commands.updateReview(id, rewrite, 'ready')
}

export async function retryAction(): Promise<void> {
  const active = getActiveEditor()
  if (!active) return
  const r = reviewKey.getState(active.editor.state)
  const actionId = useActionRun.getState().actionId
  const action = findAction(actionId)
  if (!r || !action) return
  const range = { from: r.from, to: r.to }
  active.editor.commands.rejectReview()
  await runAction(action, range)
}

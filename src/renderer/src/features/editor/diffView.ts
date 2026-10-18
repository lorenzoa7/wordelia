// How an AI change shows in the text: word by word, the old text above the new text, or only the
// new text. The default is in Settings → General; the review bar switches it at once.

import { useApp } from '@/stores/app'
import { chapterEditors } from './registry'
import type { DiffView } from './review'

export type { DiffView } from './review'
export { currentDiffView } from './review'

export const DIFF_VIEWS: DiffView[] = ['words', 'stacked', 'new']

export function useDiffView(): DiffView {
  return useApp((s) => s.settings?.editor.diffView ?? 'words')
}

/** Save the view and draw the open reviews and proposals again. */
export function setDiffView(view: DiffView): void {
  const s = useApp.getState().settings
  if (!s || (s.editor.diffView ?? 'words') === view) return
  void useApp.getState().updateSettings({ editor: { ...s.editor, diffView: view } })
  // The decorations of a review read the view when they are drawn: a transaction draws them again.
  // The proposals of the chat follow the setting by themselves (inlineProposals.ts).
  for (const e of chapterEditors()) e.editor.view.dispatch(e.editor.state.tr.setMeta('diffView', view))
}

// The text box of the chat: a small TipTap editor with mentions in the text.
// Type "@" and some letters: a list of chapters, entries and threads opens. The chosen item becomes a pill
// in the text, and the sentence goes on after it. Backspace removes a pill as one unit.
// Enter sends, Shift+Enter starts a new line, a paste is plain text. The composer and the edit box of a
// sent message use it.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type ReactNodeViewProps } from '@tiptap/react'
import { Node, type Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import { UndoRedo } from '@tiptap/extensions'
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import clsx from 'clsx'
import type { Mention } from '@shared/types'
import { useBook } from '@/stores/book'
import { folderCategoryName, useT } from '@/lib/i18n'
import { mentionLabel } from './send'
import { MentionIcon, MentionPill } from './MentionPill'
import type { DraftDoc } from './draft'
import { imageFiles } from './images'
import { matchCandidates, mentionQueryIn, type Candidate } from './mentions'

/* ------------------------------------------------------------------ */
/* The mention node                                                     */
/* ------------------------------------------------------------------ */

function MentionView({ node, selected }: ReactNodeViewProps): React.JSX.Element {
  const m = node.attrs as Mention
  return (
    <NodeViewWrapper as="span" className="mention-node">
      <MentionPill mention={{ kind: m.kind, id: m.id, label: m.label }} selected={selected} />
    </NodeViewWrapper>
  )
}

/** Remove the mention just before (Backspace) or after (Delete) the cursor, as one unit. */
function deleteMention(editor: Editor, dir: 'before' | 'after'): boolean {
  const { state } = editor
  if (!state.selection.empty) return false
  const $pos = state.selection.$from
  const node = dir === 'before' ? $pos.nodeBefore : $pos.nodeAfter
  if (node?.type.name !== 'mention') return false
  const from = dir === 'before' ? $pos.pos - node.nodeSize : $pos.pos
  editor.view.dispatch(state.tr.delete(from, from + node.nodeSize).scrollIntoView())
  return true
}

const MentionNode = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  // Before the default keys, so Backspace removes the whole pill at once.
  priority: 1000,
  addAttributes() {
    return {
      kind: { default: 'entry', parseHTML: (el) => el.getAttribute('data-kind'), renderHTML: (a) => ({ 'data-kind': a.kind }) },
      id: { default: '', parseHTML: (el) => el.getAttribute('data-id'), renderHTML: (a) => ({ 'data-id': a.id }) },
      label: { default: '', parseHTML: (el) => el.getAttribute('data-label'), renderHTML: (a) => ({ 'data-label': a.label }) }
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-mention]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, 'data-mention': '' }, `@${node.attrs.label}`]
  },
  renderText({ node }) {
    return `@${node.attrs.label}`
  },
  addNodeView() {
    return ReactNodeViewRenderer(MentionView, { as: 'span', className: 'mention-node-wrap' })
  },
  addKeyboardShortcuts() {
    return {
      Backspace: () => deleteMention(this.editor, 'before'),
      Delete: () => deleteMention(this.editor, 'after')
    }
  }
})

/* ------------------------------------------------------------------ */
/* The list of mentions                                                 */
/* ------------------------------------------------------------------ */

function useCandidates(query: string | null, excludeThreadId?: string | null): Candidate[] {
  const t = useT()
  const chapters = useBook((s) => s.chapters)
  const entries = useBook((s) => s.entries)
  const threads = useBook((s) => s.threads)
  const categories = useBook((s) => s.manifest?.planning.categories)
  return useMemo(() => {
    if (query === null) return []
    const all: Candidate[] = [
      ...chapters.map((c, i) => ({ kind: 'chapter' as const, id: c.id, label: c.title, sub: t.chat.chapterNumber(i + 1) })),
      ...entries.map((e) => ({ kind: 'entry' as const, id: e.id, label: e.name, aliases: e.aliases, sub: folderCategoryName(t, e.category, categories ?? []) })),
      // A thread without messages is not a thread yet. The thread of the composer is not a choice.
      ...threads
        .filter((th) => th.messages.length > 0 && th.id !== excludeThreadId)
        .map((th) => ({ kind: 'thread' as const, id: th.id, label: mentionLabel(t, { kind: 'thread', label: th.title }), sub: t.chat.thread }))
    ]
    return matchCandidates(all, query)
  }, [query, chapters, entries, threads, categories, t, excludeThreadId])
}

interface Query {
  text: string
  from: number
  to: number
}

/** "@" and up to 30 characters just before the cursor, after a space or at the start of a line. Spaces can be in the query. */
function mentionQuery(state: EditorState): Query | null {
  const { selection } = state
  if (!selection.empty) return null
  const $from = selection.$from
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 40), $from.parentOffset, undefined, (n: PMNode) =>
    n.type.name === 'hardBreak' ? '\n' : '￼'
  )
  const m = mentionQueryIn(before)
  if (!m) return null
  return { text: m.text, from: $from.pos - m.length - 1, to: $from.pos }
}

/* ------------------------------------------------------------------ */
/* The input                                                            */
/* ------------------------------------------------------------------ */

export interface ChatInputProps {
  /** The content when the input shows. Later changes come from `editor.commands.setContent`. */
  initial: DraftDoc | null
  className: string
  ariaLabel: string
  placeholder: string
  /** Put the cursor at the end when the input shows */
  autoFocus?: boolean
  onChange: (doc: DraftDoc) => void
  /** Enter without Shift */
  onEnter: () => void
  /** Esc, when the list of mentions is closed */
  onEscape?: () => void
  onReady?: (editor: Editor | null) => void
  /** Images in a paste (the composer adds them to the message). Without it, a paste of images does nothing. */
  onPasteImages?: (files: File[]) => void
  /** The thread of this input: the list of mentions does not offer it */
  threadId?: string | null
}

export function ChatInput({ initial, className, ariaLabel, placeholder, autoFocus, onChange, onEnter, onEscape, onReady, onPasteImages, threadId }: ChatInputProps): React.JSX.Element {
  const t = useT()
  const listId = useId()
  const [query, setQuery] = useState<Query | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [empty, setEmpty] = useState(true)
  const candidates = useCandidates(query?.text ?? null, threadId)
  const open = query !== null && !dismissed && candidates.length > 0

  // The editor reads these when a key goes down, so they must be current.
  const live = useRef({ open, candidates, highlight, query, onEnter, onEscape, onChange, onPasteImages })
  live.current = { open, candidates, highlight, query, onEnter, onEscape, onChange, onPasteImages }
  const pickRef = useRef<(c: Candidate | undefined) => void>(() => {})

  const editor = useEditor(
    {
      extensions: [Document, Paragraph, Text, HardBreak, UndoRedo, MentionNode],
      content: (initial ?? undefined) as object | undefined,
      enableInputRules: false,
      enablePasteRules: false,
      editorProps: {
        attributes: {
          class: className,
          role: 'combobox',
          'aria-label': ariaLabel,
          'aria-multiline': 'true',
          'aria-autocomplete': 'list',
          'aria-controls': listId,
          spellcheck: 'true'
        },
        handleKeyDown: (_view, event) => {
          const s = live.current
          if (s.open) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              const n = s.candidates.length
              setHighlight((h) => (event.key === 'ArrowDown' ? (h + 1) % n : (h - 1 + n) % n))
              return true
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              pickRef.current(s.candidates[s.highlight] ?? s.candidates[0])
              return true
            }
            if (event.key === 'Escape') {
              setDismissed(true)
              return true
            }
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault()
            s.onEnter()
            return true
          }
          if (event.key === 'Escape' && s.onEscape) {
            s.onEscape()
            return true
          }
          return false
        },
        // A paste is plain text. Line breaks stay.
        handlePaste: (view, event) => {
          // Images (a screenshot, a copied picture) go to the message.
          const images = imageFiles(event.clipboardData?.files)
          if (images.length && live.current.onPasteImages) {
            live.current.onPasteImages(images)
            return true
          }
          const text = event.clipboardData?.getData('text/plain')
          if (text === undefined) return false
          // Images and other things without text: nothing to paste.
          if (!text) return true
          const { schema } = view.state
          const nodes: PMNode[] = []
          text
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .forEach((line, i) => {
              if (i > 0) nodes.push(schema.nodes.hardBreak.create())
              if (line) nodes.push(schema.text(line))
            })
          view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0)).scrollIntoView())
          return true
        }
      },
      onCreate: ({ editor: e }) => {
        // The cursor waits at the end: a focus from code (not a click) puts it there.
        e.commands.setTextSelection(e.state.doc.content.size - 1)
        if (autoFocus) e.commands.focus('end')
        setEmpty(e.isEmpty)
      },
      onUpdate: ({ editor: e }) => {
        setDismissed(false)
        live.current.onChange(e.getJSON() as DraftDoc)
      },
      onTransaction: ({ editor: e }) => {
        // Also after `setContent` from code, which sends no update.
        setEmpty(e.isEmpty)
        const q = mentionQuery(e.state)
        const old = live.current.query
        if (q?.text === old?.text && q?.from === old?.from && q?.to === old?.to) return
        if (q?.text !== old?.text || q?.from !== old?.from) setHighlight(0)
        setQuery(q)
      },
      onBlur: () => setDismissed(true),
      onFocus: () => setDismissed(false)
    },
    []
  )

  useEffect(() => {
    onReady?.(editor)
    return () => onReady?.(null)
  }, [editor])

  // The placeholder for screen readers.
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    if (placeholder) dom.setAttribute('aria-placeholder', placeholder)
    else dom.removeAttribute('aria-placeholder')
  }, [editor, placeholder])

  // The state of the list, for screen readers.
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    dom.setAttribute('aria-expanded', String(open))
    if (open) dom.setAttribute('aria-activedescendant', `${listId}-${highlight}`)
    else dom.removeAttribute('aria-activedescendant')
  }, [editor, open, highlight, listId])

  const pick = (c: Candidate | undefined): void => {
    const q = live.current.query
    if (!editor || !c || !q) return
    // A space after the pill, so the sentence goes on. Not a second space when one is there.
    const next = editor.state.doc.textBetween(q.to, Math.min(q.to + 1, editor.state.doc.content.size - 1))
    const mention = { type: 'mention', attrs: { kind: c.kind, id: c.id, label: c.label } }
    editor
      .chain()
      .focus()
      .insertContentAt({ from: q.from, to: q.to }, next === ' ' ? [mention] : [mention, { type: 'text', text: ' ' }])
      .run()
    if (next === ' ') editor.commands.setTextSelection(editor.state.selection.from + 1)
  }
  pickRef.current = pick

  return (
    <>
      {open && (
        <div className="mention-pop" role="listbox" id={listId} aria-label={t.chat.mentionList}>
          {candidates.map((c, i) => (
            <button
              key={`${c.kind}-${c.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              tabIndex={-1}
              className={clsx('mention-option', i === highlight && 'is-active')}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(c)
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <MentionIcon kind={c.kind} id={c.id} size={14} />
              <span className="mention-label">
                {c.label}
                {c.alias && <span className="mention-alias"> · {c.alias}</span>}
              </span>
              <span className="mention-sub">{c.sub}</span>
            </button>
          ))}
        </div>
      )}
      {/* The placeholder and the editor share one grid cell: a long placeholder makes the box taller, as text does. */}
      <div className="chat-input-box">
        <EditorContent editor={editor} className="chat-input" />
        {empty && placeholder && (
          <div className="chat-input-placeholder" aria-hidden>
            {placeholder}
          </div>
        )}
      </div>
    </>
  )
}

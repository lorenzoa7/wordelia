import { useRef, useState } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import { DropdownMenu } from 'radix-ui'
import type { Editor } from '@tiptap/react'
import { ArrowBendUpLeft, CaretDown } from '@phosphor-icons/react'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { Kbd, MenuItem, MenuLabel, MenuSeparator, Tooltip } from '@/ui'
import { ActionIcon } from '@/features/actions/ActionIcon'
import { runAction } from '@/features/actions/runAction'
import { addQuote } from '@/features/chat/chatStore'
import { actionName, useT } from '@/lib/i18n'
import { reviewKey, textWithMap } from './review'

/** The small menu above a text selection: Reply, the default action, and more actions. */
export function SelectionMenu({ editor }: { editor: Editor }): React.JSX.Element {
  const actions = useApp((s) => s.settings?.actions ?? [])
  const defaultId = useApp((s) => s.settings?.defaultActionId)
  const primary = actions.find((a) => a.id === defaultId) ?? actions[0]
  const t = useT()
  // The menu of more actions takes the focus from the text. The bubble must stay on screen
  // meanwhile, because the menu is placed under its button.
  const [moreOpen, setMoreOpen] = useState(false)
  const keepOpen = useRef(false)
  const setMore = (open: boolean): void => {
    keepOpen.current = open
    setMoreOpen(open)
  }

  const reply = (): void => {
    const { from, to } = editor.state.selection
    const text = textWithMap(editor.state.doc, from, to).text.trim()
    if (!text) return
    const book = useBook.getState()
    const ch = book.chapters.find((c) => c.id === book.activeChapterId)
    addQuote({ text, source: { kind: 'chapter', id: ch?.id ?? '', label: ch?.title ?? t.editor.selection.chapter } })
    editor.commands.setTextSelection(to)
  }

  return (
    <BubbleMenu
      editor={editor}
      className="selection-menu"
      options={{ placement: 'top', offset: 10 }}
      shouldShow={({ editor: e, state, from, to }) => {
        if (from === to || !e.isEditable || (!e.isFocused && !keepOpen.current)) return false
        if (reviewKey.getState(state)) return false
        return textWithMap(state.doc, from, to).text.trim().length > 0
      }}
    >
      <Tooltip label={t.editor.selection.askChat} side="top">
        <button className="sel-btn" onMouseDown={(e) => e.preventDefault()} onClick={reply}>
          <ArrowBendUpLeft size={14} />
          <span>{t.editor.selection.reply}</span>
        </button>
      </Tooltip>
      {primary && (
        <Tooltip label={<>{t.editor.selection.withAi(actionName(t, primary))} {primary.shortcut && <Kbd>{primary.shortcut}</Kbd>}</>} side="top">
          <button className="sel-btn sel-primary" onMouseDown={(e) => e.preventDefault()} onClick={() => void runAction(primary)}>
            <ActionIcon name={primary.icon} size={14} weight="fill" />
            <span>{actionName(t, primary)}</span>
          </button>
        </Tooltip>
      )}
      {actions.length > 1 && (
        <DropdownMenu.Root open={moreOpen} onOpenChange={setMore}>
          <DropdownMenu.Trigger asChild>
            <button
              className="sel-btn sel-more"
              aria-label={t.editor.selection.moreActions}
              onPointerDown={(e) => {
                keepOpen.current = true
                // The menu stops the mouse events of this press. Tell the bubble that the press is
                // inside it, so it does not hide when the text loses the focus.
                e.currentTarget.dispatchEvent(new MouseEvent('mousedown'))
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <CaretDown size={12} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="bottom"
              align="end"
              sideOffset={6}
              className="menu"
              // Give the focus back to the text, so the selection stays.
              onCloseAutoFocus={(e) => {
                e.preventDefault()
                if (!editor.isDestroyed) editor.commands.focus()
              }}
            >
              <MenuLabel>{t.editor.selection.actions}</MenuLabel>
              {actions.map((a) => (
                <MenuItem key={a.id} icon={<ActionIcon name={a.icon} />} onSelect={() => void runAction(a)} shortcut={a.shortcut}>
                  {actionName(t, a)}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onSelect={() => useUiOpenActions()}>{t.editor.selection.editActions}</MenuItem>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </BubbleMenu>
  )
}

function useUiOpenActions(): void {
  void import('@/stores/ui').then(({ useUi }) => useUi.getState().openSettings('actions'))
}

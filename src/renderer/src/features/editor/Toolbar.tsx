import { useEditorState, type Editor } from '@tiptap/react'
import {
  ArrowArcLeft,
  ArrowArcRight,
  Asterisk,
  CaretDown,
  CrosshairSimple,
  MagnifyingGlass,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextIndent,
  TextItalic,
  TextUnderline
} from '@phosphor-icons/react'
import { BOOK_FONTS, FONT_SIZES, fontStack } from '@/lib/fonts'
import { IconButton, Menu, MenuItem, MenuLabel, MenuSeparator } from '@/ui'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { useT } from '@/lib/i18n'
import { ZoomControl } from './ZoomControl'

const ALIGN_ICONS = {
  left: <TextAlignLeft size={17} />,
  center: <TextAlignCenter size={17} />,
  right: <TextAlignRight size={17} />,
  justify: <TextAlignJustify size={17} />
}

export function Toolbar({ editor }: { editor: Editor }): React.JSX.Element {
  const book = useBook((s) => s.manifest?.typography)
  const ui = useApp((s) => s.settings?.ui)
  const setUi = useApp((s) => s.setUi)
  const setFindOpen = useUi((s) => s.setFindOpen)
  const openSettings = useUi((s) => s.openSettings)
  const t = useT()
  const tb = t.editor.toolbar

  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const attrs = e.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string }
      const para = e.getAttributes('paragraph') as { textAlign?: string; noIndent?: boolean }
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        font: attrs.fontFamily ?? null,
        size: attrs.fontSize ? Number.parseFloat(attrs.fontSize) : null,
        align: (para.textAlign ?? null) as keyof typeof ALIGN_ICONS | null,
        noIndent: Boolean(para.noIndent),
        canUndo: e.can().undo(),
        canRedo: e.can().redo()
      }
    }
  })

  const bookFont = book?.fontFamily ?? 'Literata'
  const bookSize = book?.fontSize ?? 12
  const align = st.align ?? book?.align ?? 'left'
  const run = (): ReturnType<Editor['chain']> => editor.chain().focus()

  return (
    <div className="toolbar-wrap">
      <div className="toolbar" role="toolbar" aria-label={tb.formatting}>
        <IconButton label={t.common.undo} shortcut="Ctrl+Z" disabled={!st.canUndo} onClick={() => run().undo().run()}>
          <ArrowArcLeft size={17} />
        </IconButton>
        <IconButton label={tb.redo} shortcut="Ctrl+Y" disabled={!st.canRedo} onClick={() => run().redo().run()}>
          <ArrowArcRight size={17} />
        </IconButton>
        <span className="toolbar-sep" />

        <Menu
          trigger={
            <button className="toolbar-select toolbar-font" aria-label={t.editor.fontIs(st.font ?? bookFont)}>
              <span style={{ fontFamily: fontStack(st.font ?? bookFont) }}>{st.font ?? bookFont}</span>
              <CaretDown size={10} />
            </button>
          }
        >
          <MenuLabel>{tb.selectedText}</MenuLabel>
          <MenuItem checked={!st.font} onSelect={() => run().unsetFontFamily().run()}>
            {tb.bookFont(bookFont)}
          </MenuItem>
          <MenuSeparator />
          {BOOK_FONTS.map((f) => (
            <MenuItem
              key={f.family}
              checked={st.font === f.family}
              onSelect={() => run().setFontFamily(f.family).run()}
              style={{ fontFamily: fontStack(f.family), fontSize: 15 }}
            >
              {f.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => openSettings('book')}>{tb.changeBookFont}</MenuItem>
        </Menu>

        <Menu
          trigger={
            <button className="toolbar-select toolbar-size" aria-label={t.editor.fontSizeIs(st.size ?? bookSize)}>
              <span style={{ fontFamily: fontStack(st.font ?? bookFont) }}>{st.size ?? bookSize}</span>
              <CaretDown size={10} />
            </button>
          }
        >
          <MenuItem checked={!st.size} onSelect={() => run().unsetFontSize().run()}>
            {tb.bookSize(bookSize)}
          </MenuItem>
          <MenuSeparator />
          {FONT_SIZES.map((s) => (
            <MenuItem key={s} checked={st.size === s} onSelect={() => run().setFontSize(`${s}pt`).run()}>
              {s}
            </MenuItem>
          ))}
        </Menu>
        <span className="toolbar-sep" />

        <IconButton label={tb.bold} shortcut="Ctrl+B" active={st.bold} onClick={() => run().toggleBold().run()}>
          <TextB size={17} weight={st.bold ? 'bold' : 'regular'} />
        </IconButton>
        <IconButton label={tb.italic} shortcut="Ctrl+I" active={st.italic} onClick={() => run().toggleItalic().run()}>
          <TextItalic size={17} />
        </IconButton>
        <IconButton label={tb.underline} shortcut="Ctrl+U" active={st.underline} onClick={() => run().toggleUnderline().run()}>
          <TextUnderline size={17} />
        </IconButton>
        <span className="toolbar-sep" />

        <Menu
          trigger={
            <button className="icon-btn toolbar-align" aria-label={tb.alignment} title={tb.alignment}>
              {ALIGN_ICONS[align as keyof typeof ALIGN_ICONS] ?? ALIGN_ICONS.left}
              <CaretDown size={9} />
            </button>
          }
        >
          {(['left', 'center', 'right', 'justify'] as const).map((a) => (
            <MenuItem key={a} icon={ALIGN_ICONS[a]} checked={st.align === a} onSelect={() => run().setTextAlign(a).run()}>
              {tb.align[a]}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem icon={<TextAlignJustify size={17} />} checked={!st.align} onSelect={() => run().unsetTextAlign().run()}>
            {tb.bookDefault}
          </MenuItem>
        </Menu>
        <IconButton label={tb.noIndent} active={st.noIndent} onClick={() => run().toggleNoIndent().run()}>
          <TextIndent size={17} />
        </IconButton>
        <IconButton label={tb.sceneBreak} shortcut="Ctrl+Shift+Enter" onClick={() => run().insertSceneBreak().run()}>
          <Asterisk size={17} />
        </IconButton>
        <span className="toolbar-sep" />
        <IconButton label={tb.findReplace} shortcut="Ctrl+F" onClick={() => setFindOpen(true)}>
          <MagnifyingGlass size={17} />
        </IconButton>
        <IconButton label={tb.focusMode} active={ui?.focusMode} onClick={() => setUi({ focusMode: !ui?.focusMode })}>
          <CrosshairSimple size={17} />
        </IconButton>
        <span className="toolbar-sep" />
        <ZoomControl />
      </div>
    </div>
  )
}

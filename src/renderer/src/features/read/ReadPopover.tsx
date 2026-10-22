// The form of an editor's read, and the two buttons that open it: the glasses of the toolbar (the chapter of
// the cursor, and its selection) and "New read" of the revision list (the open chapter, no selection).

import { useId, useRef, useState } from 'react'
import { Popover, RadioGroup } from 'radix-ui'
import { CaretDown, Eyeglasses } from '@phosphor-icons/react'
import { LENSES, type LensChoice } from '@shared/comments'
import type { ReadRequest } from '@shared/types'
import { getActiveEditor, selectedText, whenChapterEditor } from '@/features/editor/registry'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { Button, IconButton, Switch } from '@/ui'
import { bookTarget, isLastChapter, readTarget, startRead, useReadRunning, type ReadTarget } from './start'
import { closeRevisionList } from './ui'
import './read.css'

const CHOICES: LensChoice[] = ['all', ...LENSES]

interface FormProps {
  target: ReadTarget
  lens: LensChoice
  onLens: (lens: LensChoice) => void
  onRun: (req: ReadRequest) => void
}

/**
 * The form of a read: the chapter, what to read (the chapter, or the selection when there is one), the lens,
 * "Chapter in progress", and "Read". It needs no editor: the target comes from its button.
 */
function ReadForm({ target, lens, onLens, onRun }: FormProps): React.JSX.Element {
  const t = useT()
  const pop = t.read.popover
  const [scope, setScope] = useState<'chapter' | 'selection'>(target.selection ? 'selection' : 'chapter')
  const [inProgress, setInProgress] = useState(() => isLastChapter(target.chapterId))
  const running = useReadRunning(target.chapterId)
  const lensLabel = useId()

  const run = (): void => {
    if (running) return
    onRun({ chapterId: target.chapterId, lens, inProgress, ...(scope === 'selection' && target.selection ? { selection: { text: target.selection } } : {}) })
  }

  return (
    <>
      <div className="read-pop-chapter" title={target.title}>
        {t.chat.chapterNumber(target.number)} · {target.title}
      </div>
      {target.selection && (
        <div className="read-pop-group read-pop-scope">
          <span className="caps">{pop.whatToRead}</span>
          <RadioGroup.Root className="read-seg" value={scope} onValueChange={(v) => setScope(v as 'chapter' | 'selection')} aria-label={pop.whatToRead}>
            <RadioGroup.Item className="read-seg-btn" value="chapter">
              {pop.thisChapter}
            </RadioGroup.Item>
            <RadioGroup.Item className="read-seg-btn" value="selection">
              {pop.theSelection}
            </RadioGroup.Item>
          </RadioGroup.Root>
        </div>
      )}
      <div className="read-pop-group">
        <span className="caps" id={lensLabel}>
          {pop.lens}
        </span>
        <RadioGroup.Root className="read-chips" value={lens} onValueChange={(v) => onLens(v as LensChoice)} aria-labelledby={lensLabel}>
          {CHOICES.map((l) => (
            <RadioGroup.Item key={l} className="read-chip" value={l}>
              {t.read.lens[l]}
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      </div>
      <div className="read-pop-switch">
        <div className="read-pop-switch-text">
          <span className="read-pop-switch-title">{pop.inProgress}</span>
          <span className="read-pop-switch-hint">{pop.inProgressHint}</span>
        </div>
        <Switch checked={inProgress} onCheckedChange={setInProgress} label={pop.inProgress} />
      </div>
      <Button variant="primary" className="read-pop-run" onClick={run} disabled={running} title={running ? t.read.running : undefined}>
        {t.read.run}
      </Button>
      <p className="read-pop-note">{pop.note}</p>
    </>
  )
}

interface FormPopoverProps {
  /** The button that opens the form */
  trigger: React.ReactElement
  /** What the form reads, taken when it opens. Null: the form does not open. */
  takeTarget: () => ReadTarget | null
  /** "Read": the popover closes, and this starts the read. */
  onRun: (req: ReadRequest) => void
  /** Give the focus to the text after "Read" (and after Esc, with `escToText`). */
  focusText: (target: ReadTarget) => void
  /** Esc gives the focus to the text. Else Esc gives it back to the button. */
  escToText: boolean
}

/**
 * The form in a popover under its button. After "Read" the focus goes to the text. A click somewhere else
 * closes the popover and leaves the focus where the click put it.
 */
function ReadFormPopover({ trigger, takeTarget, onRun, focusText, escToText }: FormPopoverProps): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<ReadTarget | null>(null)
  const [lens, setLens] = useState<LensChoice>('all')
  /** The popover closed by "Read" or by Esc: the focus goes to the text. */
  const toText = useRef(false)

  const change = (next: boolean): void => {
    if (next) {
      const now = takeTarget()
      if (!now) return
      setTarget(now)
      toText.current = false
    }
    setOpen(next)
  }

  const run = (req: ReadRequest): void => {
    toText.current = true
    setOpen(false)
    onRun(req)
  }

  return (
    <Popover.Root open={open} onOpenChange={change}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="read-pop"
          side="bottom"
          align="end"
          sideOffset={8}
          onEscapeKeyDown={() => (toText.current = escToText)}
          onCloseAutoFocus={(e) => {
            // The text gets the focus, with its selection: on the button, the focus would show its tooltip.
            // After a click somewhere else, Radix keeps the focus where the click put it.
            if (!toText.current || !target) return
            toText.current = false
            e.preventDefault()
            focusText(target)
          }}
        >
          <div className="read-pop-head">
            <Eyeglasses size={16} aria-hidden />
            <span className="caps">{t.read.title}</span>
          </div>
          {target && <ReadForm target={target} lens={lens} onLens={setLens} onRun={run} />}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** The chapter that has the cursor, and the text that is selected in it. */
function editorTarget(): ReadTarget | null {
  const active = getActiveEditor()
  // The click on the button takes the focus from the text; the selection stays in the editor.
  return active ? readTarget(active.chapterId, selectedText()) : null
}

/** The glasses button of the toolbar: a read of the chapter of the cursor, or of its selection. */
export function ReadPopover(): React.JSX.Element {
  const t = useT()
  return (
    <ReadFormPopover
      trigger={
        <IconButton label={t.read.title}>
          <Eyeglasses size={17} />
        </IconButton>
      }
      takeTarget={editorTarget}
      onRun={(req) => void startRead(req)}
      focusText={() => getActiveEditor()?.editor.commands.focus(null, { scrollIntoView: false })}
      escToText
    />
  )
}

/**
 * "New read" of the revision list: a read of the open chapter (the first chapter when none is open). The list
 * covers the text, so the form offers no selection. "Read" closes the list: the read shows in the chat and in
 * the margin of the chapter.
 */
export function NewReadButton(): React.JSX.Element {
  const t = useT()
  return (
    <ReadFormPopover
      trigger={
        <Button className="revision-new" icon={<Eyeglasses size={15} />}>
          {t.read.list.newRead}
          <CaretDown size={11} aria-hidden className="revision-new-caret" />
        </Button>
      }
      takeTarget={bookTarget}
      onRun={(req) => {
        closeRevisionList()
        const book = useBook.getState()
        if (book.activeChapterId !== req.chapterId) book.selectChapter(req.chapterId)
        void startRead(req)
      }}
      focusText={(target) => whenChapterEditor(target.chapterId, (e) => !e.editor.isDestroyed && e.editor.commands.focus(null, { scrollIntoView: false }))}
      escToText={false}
    />
  )
}

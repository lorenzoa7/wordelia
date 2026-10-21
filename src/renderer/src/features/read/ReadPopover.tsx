import { useId, useState } from 'react'
import { Popover, RadioGroup } from 'radix-ui'
import { Eyeglasses } from '@phosphor-icons/react'
import { LENSES, type LensChoice } from '@shared/comments'
import { getActiveEditor, selectedText } from '@/features/editor/registry'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { Button, IconButton, Switch } from '@/ui'
import { chapterName, isLastChapter, startRead, useReadRunning } from './start'
import './read.css'

const CHOICES: LensChoice[] = ['all', ...LENSES]

/** What the popover reads: the chapter that has the cursor, and the text that is selected in it. */
interface Target {
  chapterId: string
  number: number
  title: string
  /** The selected text, or '' */
  selection: string
}

/**
 * The glasses button of the toolbar. It opens the small form of an editor's read: what to read (the
 * chapter, or the selection when there is one), the lens, "Chapter in progress", and "Read".
 */
export function ReadPopover(): React.JSX.Element {
  const t = useT()
  const pop = t.read.popover
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Target | null>(null)
  const [lens, setLens] = useState<LensChoice>('all')
  const [scope, setScope] = useState<'chapter' | 'selection'>('chapter')
  const [inProgress, setInProgress] = useState(false)
  const running = useReadRunning(target?.chapterId)
  const lensLabel = useId()

  // The target is the chapter and the selection of the moment when the popover opens: the click on the
  // button takes the focus from the text, and the selection stays in the editor.
  const change = (next: boolean): void => {
    if (next) {
      const active = getActiveEditor()
      if (!active) return
      const chapters = useBook.getState().chapters
      const index = chapters.findIndex((c) => c.id === active.chapterId)
      if (index < 0) return
      const selection = selectedText().trim()
      setTarget({ chapterId: active.chapterId, number: index + 1, title: chapterName(chapters[index].title), selection })
      setScope(selection ? 'selection' : 'chapter')
      setInProgress(isLastChapter(active.chapterId))
    }
    setOpen(next)
  }

  const run = (): void => {
    if (!target || running) return
    setOpen(false)
    void startRead({ chapterId: target.chapterId, lens, inProgress, ...(scope === 'selection' && target.selection ? { selection: { text: target.selection } } : {}) })
  }

  return (
    <Popover.Root open={open} onOpenChange={change}>
      <Popover.Trigger asChild>
        <IconButton label={t.read.title}>
          <Eyeglasses size={17} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="read-pop"
          side="bottom"
          align="end"
          sideOffset={8}
          // The focus goes back to the text, with its selection. On the button it would show the tooltip.
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            getActiveEditor()?.editor.commands.focus(null, { scrollIntoView: false })
          }}
        >
          <div className="read-pop-head">
            <Eyeglasses size={16} aria-hidden />
            <span className="caps">{t.read.title}</span>
          </div>
          {target && (
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
                <RadioGroup.Root className="read-chips" value={lens} onValueChange={(v) => setLens(v as LensChoice)} aria-labelledby={lensLabel}>
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
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

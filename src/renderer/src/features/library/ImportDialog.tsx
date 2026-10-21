import { useEffect, useMemo, useState } from 'react'
import { BookOpen } from '@phosphor-icons/react'
import { countMarkdownWords } from '@shared/book'
import { chapterWord } from '@shared/export/model'
import { countSceneBreaks, type BlankLines } from '@shared/import'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import type { ImportedBook } from '@shared/ipc'
import { Button, Dialog, Field, Select, Spinner, Switch, TextInput } from '@/ui'
import { invoke } from '@/lib/api'
import { getT, useT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { guessLanguage, languageOptions } from './NewBookDialog'
import { analyzeImportedHtml, htmlToMarkdown } from './convert'
import { startPlanningSync } from '@/features/plan/sync'

interface Prepared {
  book: ImportedBook
  /** The blank lines of the DOCX: how many gaps between paragraphs, and what Wordelia thinks they are */
  blank: { gaps: number; suggested: BlankLines }
}

interface ChapterPreview {
  /** '' when the file gives no title: the chapter gets "Chapter One" in the book language */
  title: string
  markdown: string
  words: number
  breaks: number
}

/** Guess the book language from common words. */
function detectLanguage(text: string): string | null {
  const sample = ` ${text.slice(0, 20000).toLowerCase()} `
  const score = (words: string[]): number => words.reduce((n, w) => n + (sample.split(` ${w} `).length - 1), 0)
  const scores: Array<[string, number]> = [
    ['pt-BR', score(['não', 'que', 'com', 'uma', 'ele', 'você', 'para', 'mas', 'então'])],
    ['en-US', score(['the', 'and', 'that', 'with', 'was', 'his', 'her', 'you', 'but'])],
    ['es', score(['que', 'con', 'una', 'pero', 'los', 'las', 'usted', 'él', 'para'])],
    ['fr', score(['que', 'les', 'une', 'avec', 'pas', 'mais', 'vous', 'est', 'dans'])]
  ]
  scores.sort((a, b) => b[1] - a[1])
  return scores[0][1] > 10 ? scores[0][0] : null
}

/** The chapters as Markdown, with the blank lines of a DOCX read as `blankLines`. */
function previewChapters(book: ImportedBook, blankLines: BlankLines): ChapterPreview[] {
  return book.chapters.map((c) => {
    const markdown = c.html != null ? htmlToMarkdown(c.html, blankLines) : (c.markdown ?? '')
    return { title: c.title, markdown, words: countMarkdownWords(markdown), breaks: countSceneBreaks(markdown) }
  })
}

export function ImportDialog({ path, onClose }: { path: string | null; onClose: () => void }): React.JSX.Element {
  const t = useT()
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [language, setLanguage] = useState(guessLanguage())
  const [blankLines, setBlankLines] = useState<BlankLines>('spacing')
  const aiRoute = useApp((s) => s.settings?.routes.sync ?? s.settings?.routes.chat ?? null)
  const [buildPlanning, setBuildPlanning] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPrepared(null)
    if (!path) return
    void invoke('import:read', path)
      .then((book) => {
        const htmls = book.chapters.flatMap((c) => (c.html != null ? [c.html] : []))
        const blank = htmls.length ? analyzeImportedHtml(htmls) : { gaps: 0, suggested: 'spacing' as const }
        setPrepared({ book, blank: { gaps: blank.gaps, suggested: blank.suggested } })
        setBlankLines(blank.suggested)
        setTitle(book.title)
        setAuthor(book.author)
        const lang = detectLanguage(previewChapters(book, blank.suggested).map((c) => c.markdown).join('\n'))
        if (lang) setLanguage(lang)
      })
      .catch((err: unknown) => {
        toast(getT().library.couldNotRead(err instanceof Error ? err.message : String(err)), { kind: 'error' })
        onClose()
      })
  }, [path, onClose])

  const chapters = useMemo(() => (prepared ? previewChapters(prepared.book, blankLines) : []), [prepared, blankLines])
  // A chapter without a title in the file is "Capítulo Um", "Chapter One"… in the language of the book.
  const titleOf = (c: ChapterPreview, i: number): string => c.title || chapterWord(language, i + 1)
  const total = chapters.reduce((n, c) => n + c.words, 0)
  const breaks = chapters.reduce((n, c) => n + c.breaks, 0)
  const empty = prepared !== null && total === 0
  const planning = buildPlanning && aiRoute !== null

  const run = async (): Promise<void> => {
    if (!prepared || empty) return
    setBusy(true)
    try {
      const parentDir = await invoke('app:defaultBooksDir')
      const snap = await invoke('book:create', { parentDir, title: title.trim() || t.library.importedBook, author: author.trim(), language, empty: true })
      const store = useBook.getState()
      store.open(snap)
      for (const [i, c] of chapters.entries()) await useBook.getState().addChapter(null, titleOf(c, i), c.markdown)
      useBook.getState().selectChapter(useBook.getState().chapters[0]?.id ?? '')
      onClose()
      toast(getT().library.imported(chapters.length))
      if (planning) void startPlanningSync({ bootstrap: true })
    } catch (err) {
      toast(getT().library.importFailed(err instanceof Error ? err.message : String(err)), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={path !== null}
      onOpenChange={(v) => !v && onClose()}
      title={t.library.importTitle}
      description={path ? path.split(/[\\/]/).pop() : undefined}
      width={600}
      className="import-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={!prepared || busy || empty}>
            {busy ? t.library.importing : t.common.import}
          </Button>
        </>
      }
    >
      {!prepared ? (
        <div className="import-loading">
          <Spinner /> {t.library.reading}
        </div>
      ) : (
        <>
          <div className="import-summary">
            <BookOpen size={18} />
            <span>
              {t.library.importSummary(chapters.length, total)}
              {(breaks > 0 || prepared.blank.gaps > 0) && ` · ${t.library.sceneBreaks(breaks)}`}
            </span>
          </div>
          {empty ? (
            <p className="import-empty">{t.library.nothingToImport}</p>
          ) : (
            <ol className="import-chapters">
              {chapters.map((c, i) => (
                <li key={i}>
                  <span className="import-ch-num">{i + 1}</span>
                  <span className={c.title ? 'import-ch-title' : 'import-ch-title is-fallback'}>{titleOf(c, i)}</span>
                  <span className="import-ch-words">{t.library.count(c.words)}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="import-fields">
            <Field label={t.library.title}>
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label={t.library.author}>
              <TextInput value={author} onChange={(e) => setAuthor(e.target.value)} />
            </Field>
            <Field label={t.library.language}>
              <Select value={language} onValueChange={setLanguage} options={languageOptions(t)} ariaLabel={t.library.languageAria} />
            </Field>
            {prepared.blank.gaps > 0 && (
              <Field label={t.library.blankLines}>
                <Select
                  value={blankLines}
                  onValueChange={(v) => setBlankLines(v as BlankLines)}
                  options={[
                    { value: 'spacing', label: t.library.blankLinesSpacing },
                    { value: 'breaks', label: t.library.blankLinesBreaks }
                  ]}
                  className="import-blank-lines"
                />
              </Field>
            )}
          </div>
          <Field label={t.library.buildPlanning} inline>
            <Switch checked={planning} onCheckedChange={setBuildPlanning} label={t.library.buildPlanning} disabled={!aiRoute} />
          </Field>
          <p className="import-note">
            {aiRoute ? `${t.library.buildPlanningWith(PROVIDER_LABELS[aiRoute.provider].name)} ${t.library.buildPlanningNote}` : t.library.buildPlanningNoAi}
          </p>
          {prepared.book.warnings.length > 0 && <p className="import-note muted">{t.library.warnings(prepared.book.warnings.length)}</p>}
        </>
      )}
    </Dialog>
  )
}

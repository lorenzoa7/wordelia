import { useEffect, useState } from 'react'
import { BookOpen, FileText } from '@phosphor-icons/react'
import { countMarkdownWords, formatCount } from '@shared/book'
import type { ImportedBook } from '@shared/ipc'
import { Button, Dialog, Field, Select, Spinner, Switch, TextInput } from '@/ui'
import { invoke } from '@/lib/api'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { LANGUAGES, guessLanguage } from './NewBookDialog'
import { htmlToMarkdown } from './convert'
import { startPlanningSync } from '@/features/plan/sync'

interface Prepared {
  book: ImportedBook
  chapters: Array<{ title: string; markdown: string; words: number }>
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

export function ImportDialog({ path, onClose }: { path: string | null; onClose: () => void }): React.JSX.Element {
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [language, setLanguage] = useState(guessLanguage())
  const [buildPlanning, setBuildPlanning] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPrepared(null)
    if (!path) return
    void invoke('import:read', path)
      .then((book) => {
        const chapters = book.chapters.map((c) => {
          const markdown = c.html != null ? htmlToMarkdown(c.html) : (c.markdown ?? '')
          return { title: c.title, markdown, words: countMarkdownWords(markdown) }
        })
        setPrepared({ book, chapters })
        setTitle(book.title)
        setAuthor(book.author)
        const lang = detectLanguage(chapters.map((c) => c.markdown).join('\n'))
        if (lang) setLanguage(lang)
      })
      .catch((err: unknown) => {
        toast(`Could not read the file: ${err instanceof Error ? err.message : String(err)}`, { kind: 'error' })
        onClose()
      })
  }, [path, onClose])

  const run = async (): Promise<void> => {
    if (!prepared) return
    setBusy(true)
    try {
      const parentDir = await invoke('app:defaultBooksDir')
      const snap = await invoke('book:create', { parentDir, title: title.trim() || 'Imported book', author: author.trim(), language, empty: true })
      const store = useBook.getState()
      store.open(snap)
      for (const c of prepared.chapters) await useBook.getState().addChapter(null, c.title, c.markdown)
      useBook.getState().selectChapter(useBook.getState().chapters[0]?.id ?? '')
      onClose()
      toast(`Imported ${prepared.chapters.length} ${prepared.chapters.length === 1 ? 'chapter' : 'chapters'}.`)
      if (buildPlanning) void startPlanningSync({ bootstrap: true })
    } catch (err) {
      toast(`Import failed: ${err instanceof Error ? err.message : String(err)}`, { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const total = prepared?.chapters.reduce((n, c) => n + c.words, 0) ?? 0

  return (
    <Dialog
      open={path !== null}
      onOpenChange={(v) => !v && onClose()}
      title="Import a book"
      description={path ? path.split(/[\\/]/).pop() : undefined}
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={!prepared || busy}>
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </>
      }
    >
      {!prepared ? (
        <div className="import-loading">
          <Spinner /> Reading the file…
        </div>
      ) : (
        <>
          <div className="import-summary">
            <BookOpen size={18} />
            <span>
              {prepared.chapters.length} {prepared.chapters.length === 1 ? 'chapter' : 'chapters'} · {formatCount(total)} words
            </span>
          </div>
          <ol className="import-chapters">
            {prepared.chapters.map((c, i) => (
              <li key={i}>
                <FileText size={14} />
                <span className="import-ch-title">{c.title}</span>
                <span className="import-ch-words">{formatCount(c.words)}</span>
              </li>
            ))}
          </ol>
          <div className="import-fields">
            <Field label="Title">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Author">
              <TextInput value={author} onChange={(e) => setAuthor(e.target.value)} />
            </Field>
          </div>
          <Field label="Language of the book">
            <Select value={language} onValueChange={setLanguage} options={LANGUAGES} ariaLabel="Language" />
          </Field>
          <Field label="Build the planning with AI" inline>
            <Switch checked={buildPlanning} onCheckedChange={setBuildPlanning} label="Build the planning with AI" />
          </Field>
          <p className="import-note">
            The AI reads the chapters and proposes characters, places and plot notes. You review each proposal before it is saved.
          </p>
          {prepared.book.warnings.length > 0 && (
            <p className="import-note muted">{prepared.book.warnings.length} formatting notes from the converter were ignored.</p>
          )}
        </>
      )}
    </Dialog>
  )
}

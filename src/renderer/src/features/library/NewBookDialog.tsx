import { useEffect, useState } from 'react'
import { Button, Dialog, Field, Select, TextInput } from '@/ui'
import { invoke } from '@/lib/api'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'

export const LANGUAGES = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'pt-PT', label: 'Português (Portugal)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' }
]

export function guessLanguage(): string {
  const nav = navigator.language || 'en-US'
  return LANGUAGES.find((l) => l.value === nav)?.value ?? LANGUAGES.find((l) => nav.startsWith(l.value.slice(0, 2)))?.value ?? 'en-US'
}

export function NewBookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [language, setLanguage] = useState(guessLanguage())
  const [parentDir, setParentDir] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && !parentDir) void invoke('app:defaultBooksDir').then(setParentDir)
  }, [open, parentDir])

  const create = async (): Promise<void> => {
    if (!title.trim() || !parentDir) return
    setBusy(true)
    try {
      const snap = await invoke('book:create', { parentDir, title: title.trim(), author: author.trim(), language })
      useBook.getState().open(snap)
      onOpenChange(false)
      setTitle('')
    } catch (err) {
      toast(`Could not create the book: ${err instanceof Error ? err.message : String(err)}`, { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="A new book"
      description="Wordelia keeps each book in its own folder of plain files."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={!title.trim() || busy}>
            Create book
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <Field label="Title">
          <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Lost Paradise" />
        </Field>
        <Field label="Author">
          <TextInput value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
        </Field>
        <Field label="Language of the book" hint="The AI writes book text in this language. Spell check uses it too.">
          <Select value={language} onValueChange={setLanguage} options={LANGUAGES} ariaLabel="Language" />
        </Field>
        <Field label="Location">
          <div className="location-row">
            <span className="location-path" title={parentDir}>
              {parentDir || '…'}
            </span>
            <Button
              size="sm"
              type="button"
              onClick={() =>
                void invoke('book:pickFolder', { title: 'Where to keep the book', create: true }).then((d) => d && setParentDir(d))
              }
            >
              Change…
            </Button>
          </div>
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

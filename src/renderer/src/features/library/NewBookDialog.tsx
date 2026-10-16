import { useEffect, useState } from 'react'
import { messagesFor, type Messages } from '@shared/i18n'
import { Button, Dialog, Field, Select, TextInput } from '@/ui'
import { invoke } from '@/lib/api'
import { getT, useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'

const BOOK_LANGUAGE_CODES = ['pt-BR', 'pt-PT', 'en-US', 'en-GB', 'es', 'fr', 'de', 'it']

/** The book languages with their names in the interface language. */
export function languageOptions(t: Messages): Array<{ value: string; label: string }> {
  return BOOK_LANGUAGE_CODES.map((value) => ({ value, label: t.library.languages[value] ?? value }))
}

/** The book languages with their English names. Prefer `languageOptions(t)`. */
export const LANGUAGES = languageOptions(messagesFor('en'))

export function guessLanguage(): string {
  const nav = navigator.language || 'en-US'
  return LANGUAGES.find((l) => l.value === nav)?.value ?? LANGUAGES.find((l) => nav.startsWith(l.value.slice(0, 2)))?.value ?? 'en-US'
}

export function NewBookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }): React.JSX.Element {
  const t = useT()
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
      toast(getT().library.couldNotCreate(err instanceof Error ? err.message : String(err)), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.library.newTitle}
      description={t.library.newDescription}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={!title.trim() || busy}>
            {busy ? t.library.creating : t.library.createBook}
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
        <Field label={t.library.title}>
          <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.library.titlePlaceholder} />
        </Field>
        <Field label={t.library.author}>
          <TextInput value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={t.library.authorPlaceholder} />
        </Field>
        <Field label={t.library.language} hint={t.library.languageHint}>
          <Select value={language} onValueChange={setLanguage} options={languageOptions(t)} ariaLabel={t.library.languageAria} />
        </Field>
        <Field label={t.library.location}>
          <div className="location-row">
            <span className="location-path" title={parentDir}>
              {parentDir || '…'}
            </span>
            <Button
              size="sm"
              type="button"
              onClick={() =>
                void invoke('book:pickFolder', { title: t.library.locationTitle, create: true }).then((d) => d && setParentDir(d))
              }
            >
              {t.library.change}
            </Button>
          </div>
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

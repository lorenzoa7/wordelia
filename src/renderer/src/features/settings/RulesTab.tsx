import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { NoteEditor } from '@/features/plan/NoteEditor'

/** The writing rules of the open book, in the same editor as the planning notes. Saved with the book. */
export function RulesTab(): React.JSX.Element {
  const t = useT()
  const rules = useBook((s) => s.writingRules)
  const setRules = useBook((s) => s.setWritingRules)
  return (
    <div className="rules-tab">
      <p className="settings-note">{t.settings.rules.intro}</p>
      <div className="rules-editor">
        <NoteEditor docKey="settings-writing-rules" value={rules} onChange={setRules} placeholder={t.settings.rules.placeholder} />
      </div>
    </div>
  )
}

import type { SceneBreakStyle, Typography } from '@shared/types'
import { Field, Select, Switch, TextInput } from '@/ui'
import { useBook } from '@/stores/book'
import { BOOK_FONTS, fontStack } from '@/lib/fonts'
import { LANGUAGES } from '@/features/library/NewBookDialog'

const SCENE_BREAKS: Array<{ value: SceneBreakStyle; label: string }> = [
  { value: 'asterisks', label: '*  *  *' },
  { value: 'asterism', label: '⁂' },
  { value: 'fleuron', label: '❦' },
  { value: 'hash', label: '#' },
  { value: 'blank', label: 'Blank line' }
]

export function BookTab(): React.JSX.Element | null {
  const m = useBook((s) => s.manifest)
  const update = useBook((s) => s.updateManifest)
  if (!m) return null
  const t = m.typography
  const setT = (patch: Partial<Typography>): void => update({ typography: { ...t, ...patch } })

  return (
    <div>
      <h3 className="settings-h">Book</h3>
      <div className="settings-grid">
        <Field label="Title">
          <TextInput value={m.title} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        <Field label="Author">
          <TextInput value={m.author} onChange={(e) => update({ author: e.target.value })} />
        </Field>
        <Field label="Subtitle">
          <TextInput value={m.subtitle} onChange={(e) => update({ subtitle: e.target.value })} />
        </Field>
        <Field label="Genre">
          <TextInput value={m.genre} placeholder="Dark fantasy, mystery…" onChange={(e) => update({ genre: e.target.value })} />
        </Field>
      </div>
      <Field label="Language" hint="The AI writes book text in this language.">
        <Select value={m.language} onValueChange={(v) => update({ language: v })} options={LANGUAGES} ariaLabel="Language" />
      </Field>

      <h3 className="settings-h">Text on the page</h3>
      <div className="typo-preview" style={{ fontFamily: fontStack(t.fontFamily), lineHeight: t.lineHeight, textAlign: t.align }}>
        <p style={{ textIndent: t.indentFirstParagraph ? `${t.firstLineIndent}em` : 0 }}>
          {t.dialogueDash} Did you feel that? {t.dialogueDash} asked the old man, and the candles bent toward the door.
        </p>
        <p style={{ textIndent: `${t.firstLineIndent}em` }}>Miguel did not answer. Outside, the wind kept its own counsel.</p>
      </div>
      <div className="settings-grid">
        <Field label="Font">
          <Select
            value={t.fontFamily}
            onValueChange={(v) => setT({ fontFamily: v })}
            options={BOOK_FONTS.map((f) => ({ value: f.family, label: f.label, style: { fontFamily: fontStack(f.family) } }))}
            ariaLabel="Font"
          />
        </Field>
        <Field label="Size (pt)">
          <Select
            value={String(t.fontSize)}
            onValueChange={(v) => setT({ fontSize: Number(v) })}
            options={[10, 11, 12, 13, 14, 16].map((n) => ({ value: String(n), label: String(n) }))}
            ariaLabel="Size"
          />
        </Field>
        <Field label="Line spacing">
          <Select
            value={String(t.lineHeight)}
            onValueChange={(v) => setT({ lineHeight: Number(v) })}
            options={[1.15, 1.3, 1.45, 1.6, 1.8, 2].map((n) => ({ value: String(n), label: String(n) }))}
            ariaLabel="Line spacing"
          />
        </Field>
        <Field label="First-line indent (em)">
          <Select
            value={String(t.firstLineIndent)}
            onValueChange={(v) => setT({ firstLineIndent: Number(v) })}
            options={[0, 1, 1.5, 2, 2.5].map((n) => ({ value: String(n), label: String(n) }))}
            ariaLabel="Indent"
          />
        </Field>
        <Field label="Alignment">
          <Select
            value={t.align}
            onValueChange={(v) => setT({ align: v as Typography['align'] })}
            options={[
              { value: 'justify', label: 'Justified' },
              { value: 'left', label: 'Left' }
            ]}
            ariaLabel="Alignment"
          />
        </Field>
        <Field label="Space between paragraphs">
          <Select
            value={String(t.paragraphSpacing)}
            onValueChange={(v) => setT({ paragraphSpacing: Number(v) })}
            options={[0, 0.4, 0.8, 1].map((n) => ({ value: String(n), label: n === 0 ? 'None (book style)' : `${n} em` }))}
            ariaLabel="Paragraph spacing"
          />
        </Field>
      </div>
      <Field label="Indent the first paragraph of a chapter or scene" inline>
        <Switch checked={t.indentFirstParagraph} onCheckedChange={(v) => setT({ indentFirstParagraph: v })} />
      </Field>

      <h3 className="settings-h">Typing</h3>
      <Field label="Dialogue dash (type --)" inline>
        <Select
          value={t.dialogueDash}
          onValueChange={(v) => setT({ dialogueDash: v as Typography['dialogueDash'] })}
          options={[
            { value: '—', label: '— em dash (U+2014)' },
            { value: '―', label: '― horizontal bar (U+2015)' }
          ]}
          ariaLabel="Dialogue dash"
        />
      </Field>
      <Field label="Smart quotes" inline>
        <Switch checked={t.smartQuotes} onCheckedChange={(v) => setT({ smartQuotes: v })} />
      </Field>
      <Field label="Three dots become an ellipsis (…)" inline>
        <Switch checked={t.smartEllipsis} onCheckedChange={(v) => setT({ smartEllipsis: v })} />
      </Field>
      <Field label="Scene break in exports" inline>
        <Select value={t.sceneBreak} onValueChange={(v) => setT({ sceneBreak: v as SceneBreakStyle })} options={SCENE_BREAKS} ariaLabel="Scene break" />
      </Field>
    </div>
  )
}

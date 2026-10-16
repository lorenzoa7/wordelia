import type { SceneBreakStyle, Typography } from '@shared/types'
import { Field, Select, Switch, TextInput } from '@/ui'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { BOOK_FONTS, fontStack } from '@/lib/fonts'
import { LANGUAGES } from '@/features/library/NewBookDialog'

const SCENE_BREAKS: Array<{ value: SceneBreakStyle; label: string | null }> = [
  { value: 'asterisks', label: '*  *  *' },
  { value: 'asterism', label: '⁂' },
  { value: 'fleuron', label: '❦' },
  { value: 'hash', label: '#' },
  // A text label, in the interface language
  { value: 'blank', label: null }
]

export function BookTab(): React.JSX.Element | null {
  const m = useBook((s) => s.manifest)
  const update = useBook((s) => s.updateManifest)
  const tr = useT().settings.book
  if (!m) return null
  const t = m.typography
  const setT = (patch: Partial<Typography>): void => update({ typography: { ...t, ...patch } })

  return (
    <div>
      <h3 className="settings-h">{tr.book}</h3>
      <div className="settings-grid">
        <Field label={tr.title}>
          <TextInput value={m.title} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        <Field label={tr.author}>
          <TextInput value={m.author} onChange={(e) => update({ author: e.target.value })} />
        </Field>
        <Field label={tr.subtitle}>
          <TextInput value={m.subtitle} onChange={(e) => update({ subtitle: e.target.value })} />
        </Field>
        <Field label={tr.genre}>
          <TextInput value={m.genre} placeholder={tr.genrePlaceholder} onChange={(e) => update({ genre: e.target.value })} />
        </Field>
      </div>
      <Field label={tr.language} hint={tr.languageHint}>
        <Select
          value={m.language}
          onValueChange={(v) => update({ language: v })}
          options={LANGUAGES.map((l) => ({ value: l.value, label: tr.languages[l.value] ?? l.label }))}
          ariaLabel={tr.language}
        />
      </Field>

      <h3 className="settings-h">{tr.textOnPage}</h3>
      <div className="typo-preview" style={{ fontFamily: fontStack(t.fontFamily), lineHeight: t.lineHeight, textAlign: t.align }}>
        <p style={{ textIndent: t.indentFirstParagraph ? `${t.firstLineIndent}em` : 0 }}>{t.dialogueStyle === 'quotes' ? tr.previewQuoted : tr.previewDialogue(t.dialogueDash)}</p>
        <p style={{ textIndent: `${t.firstLineIndent}em` }}>{tr.previewNarration}</p>
      </div>
      <div className="settings-grid">
        <Field label={tr.font}>
          <Select
            value={t.fontFamily}
            onValueChange={(v) => setT({ fontFamily: v })}
            options={BOOK_FONTS.map((f) => ({ value: f.family, label: f.label, style: { fontFamily: fontStack(f.family) } }))}
            ariaLabel={tr.font}
          />
        </Field>
        <Field label={tr.size}>
          <Select
            value={String(t.fontSize)}
            onValueChange={(v) => setT({ fontSize: Number(v) })}
            options={[10, 11, 12, 13, 14, 16].map((n) => ({ value: String(n), label: String(n) }))}
            ariaLabel={tr.sizeAria}
          />
        </Field>
        <Field label={tr.lineSpacing}>
          <Select
            value={String(t.lineHeight)}
            onValueChange={(v) => setT({ lineHeight: Number(v) })}
            options={[1.15, 1.3, 1.45, 1.6, 1.8, 2].map((n) => ({ value: String(n), label: String(n) }))}
            ariaLabel={tr.lineSpacing}
          />
        </Field>
        <Field label={tr.indent}>
          <Select
            value={String(t.firstLineIndent)}
            onValueChange={(v) => setT({ firstLineIndent: Number(v) })}
            options={[0, 1, 1.5, 2, 2.5].map((n) => ({ value: String(n), label: String(n) }))}
            ariaLabel={tr.indentAria}
          />
        </Field>
        <Field label={tr.alignment}>
          <Select
            value={t.align}
            onValueChange={(v) => setT({ align: v as Typography['align'] })}
            options={[
              { value: 'justify', label: tr.justified },
              { value: 'left', label: tr.left }
            ]}
            ariaLabel={tr.alignment}
          />
        </Field>
        <Field label={tr.paragraphSpace}>
          <Select
            value={String(t.paragraphSpacing)}
            onValueChange={(v) => setT({ paragraphSpacing: Number(v) })}
            options={[0, 0.4, 0.8, 1].map((n) => ({ value: String(n), label: n === 0 ? tr.noSpace : `${n} em` }))}
            ariaLabel={tr.paragraphSpaceAria}
          />
        </Field>
      </div>
      <Field label={tr.indentFirst} inline>
        <Switch checked={t.indentFirstParagraph} onCheckedChange={(v) => setT({ indentFirstParagraph: v })} />
      </Field>

      <h3 className="settings-h">{tr.typing}</h3>
      <Field label={tr.dialogueStyle} hint={tr.dialogueStyleHint}>
        <Select
          value={t.dialogueStyle}
          onValueChange={(v) => setT({ dialogueStyle: v as Typography['dialogueStyle'] })}
          options={[
            { value: 'dash', label: tr.dialogueStyleDash },
            { value: 'quotes', label: tr.dialogueStyleQuotes }
          ]}
          ariaLabel={tr.dialogueStyle}
        />
      </Field>
      <Field label={tr.dialogueDash} inline>
        <Select
          value={t.dialogueDash}
          onValueChange={(v) => setT({ dialogueDash: v as Typography['dialogueDash'] })}
          options={[
            { value: '—', label: tr.emDash },
            { value: '―', label: tr.horizontalBar }
          ]}
          ariaLabel={tr.dialogueDashAria}
        />
      </Field>
      <Field label={tr.smartQuotes} inline>
        <Switch checked={t.smartQuotes} onCheckedChange={(v) => setT({ smartQuotes: v })} />
      </Field>
      <Field label={tr.smartEllipsis} inline>
        <Switch checked={t.smartEllipsis} onCheckedChange={(v) => setT({ smartEllipsis: v })} />
      </Field>
      <Field label={tr.sceneBreak} inline>
        <Select
          value={t.sceneBreak}
          onValueChange={(v) => setT({ sceneBreak: v as SceneBreakStyle })}
          options={SCENE_BREAKS.map((b) => ({ value: b.value, label: b.label ?? tr.blankLine }))}
          ariaLabel={tr.sceneBreakAria}
        />
      </Field>
    </div>
  )
}

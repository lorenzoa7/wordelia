import { useId } from 'react'
import clsx from 'clsx'
import { RadioGroup } from 'radix-ui'
import type { ExportSettings, PageSize, SceneBreakStyle, Typography } from '@shared/types'
import { PAGE_SIZES } from '@shared/export/model'
import { quotesFor } from '@shared/text/quotes'
import { Field, NumberInput, Select, Switch, TextInput } from '@/ui'
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
  const msg = useT()
  const tr = msg.settings.book
  // The page size names of the export dialog
  const tx = msg.exportDialog
  if (!m) return null
  const t = m.typography
  const setT = (patch: Partial<Typography>): void => update({ typography: { ...t, ...patch } })
  const font = { fontFamily: fontStack(t.fontFamily) }
  const q = quotesFor(m.language)

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
      <div className="settings-grid page-setup">
        <Field label={tr.pageSize} hint={tr.pageSizeHint}>
          <Select
            value={m.export.pageSize}
            onValueChange={(v) => update({ export: { ...m.export, pageSize: v as PageSize } })}
            options={(Object.keys(PAGE_SIZES) as PageSize[]).map((k) => ({ value: k, label: tx.pageSizes[k] }))}
            ariaLabel={tr.pageSize}
            className="page-size"
          />
        </Field>
        <MarginsField settings={m.export} onChange={(margins) => update({ export: { ...m.export, margins } })} />
      </div>
      <div className="typo-preview" style={{ ...font, lineHeight: t.lineHeight, textAlign: t.align }}>
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
      <p className="settings-note">{tr.typingNote}</p>
      <div className="typing-label" id="dialogue-style-label">
        {tr.dialogueStyle}
      </div>
      {/* Radio groups: one Tab stop, and the arrow keys choose. */}
      <RadioGroup.Root
        className="dialogue-styles"
        value={t.dialogueStyle}
        onValueChange={(v) => setT({ dialogueStyle: v as Typography['dialogueStyle'] })}
        aria-labelledby="dialogue-style-label"
      >
        {(['dash', 'quotes'] as const).map((style) => (
          <RadioGroup.Item key={style} value={style} className={clsx('dialogue-style', t.dialogueStyle === style && 'is-active')}>
            <span className="dialogue-style-name">{style === 'dash' ? tr.dialogueStyleDash : tr.dialogueStyleQuotes}</span>
            <span className="dialogue-style-example" style={font}>
              {style === 'dash' ? tr.dashExample(t.dialogueDash) : tr.quotesExample(q.doubleOpen, q.doubleClose)}
            </span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>

      <div className="typing-rows">
        <TypingRow label={tr.dialogueDash} before="--" after={t.dialogueDash} font={font}>
          <Select
            value={t.dialogueDash}
            onValueChange={(v) => setT({ dialogueDash: v as Typography['dialogueDash'] })}
            options={[
              { value: '—', label: <DashChoice dash="—" name={tr.emDash} font={font} /> },
              { value: '―', label: <DashChoice dash="―" name={tr.horizontalBar} font={font} /> }
            ]}
            ariaLabel={tr.dialogueDash}
          />
        </TypingRow>
        <TypingRow label={tr.smartQuotes} before={`"${tr.quotesWord}"`} after={`${q.doubleOpen}${tr.quotesWord}${q.doubleClose}`} font={font} off={!t.smartQuotes}>
          <Switch checked={t.smartQuotes} onCheckedChange={(v) => setT({ smartQuotes: v })} label={tr.smartQuotes} />
        </TypingRow>
        <TypingRow label={tr.smartEllipsis} before="..." after="…" font={font} off={!t.smartEllipsis}>
          <Switch checked={t.smartEllipsis} onCheckedChange={(v) => setT({ smartEllipsis: v })} label={tr.smartEllipsis} />
        </TypingRow>
        <div className="typing-row">
          <span className="typing-name" id="scene-break-label">
            {tr.sceneBreak}
          </span>
          <RadioGroup.Root
            className="scene-breaks"
            value={t.sceneBreak}
            onValueChange={(v) => setT({ sceneBreak: v as SceneBreakStyle })}
            aria-labelledby="scene-break-label"
          >
            {SCENE_BREAKS.map((b) => (
              <RadioGroup.Item
                key={b.value}
                value={b.value}
                className={clsx('scene-break', t.sceneBreak === b.value && 'is-active', !b.label && 'is-text')}
                style={b.label ? font : undefined}
              >
                {b.label ?? tr.blankLine}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </div>
      </div>
    </div>
  )
}

/** Millimeters in a centimeter */
const CM = 10
/** The text area keeps at least this much of the page in each direction, in millimeters. */
const MIN_TEXT = 40
/** The widest margin, in millimeters */
const MAX_MARGIN = 100

/**
 * The page margins, like Google Docs: Top, Bottom, Left and Right in centimeters. The book keeps
 * millimeters; Left is the inner margin and Right the outer margin. A margin cannot take more
 * of the page than leaves MIN_TEXT for the text.
 */
function MarginsField({ settings, onChange }: { settings: ExportSettings; onChange: (margins: ExportSettings['margins']) => void }): React.JSX.Element {
  const tr = useT().settings.book
  const id = useId()
  const mg = settings.margins
  const size = PAGE_SIZES[settings.pageSize] ?? PAGE_SIZES.A5
  const sides = [
    { key: 'top', label: tr.marginTop, other: mg.bottom, page: size.h },
    { key: 'bottom', label: tr.marginBottom, other: mg.top, page: size.h },
    { key: 'inner', label: tr.marginLeft, other: mg.outer, page: size.w },
    { key: 'outer', label: tr.marginRight, other: mg.inner, page: size.w }
  ] as const
  return (
    <div className="field margins" role="group" aria-labelledby={`${id}label`}>
      <span className="field-label" id={`${id}label`}>
        {tr.margins}
      </span>
      <div className="margins-row">
        {sides.map((s) => {
          const maxMm = Math.max(0, Math.min(MAX_MARGIN, s.page - MIN_TEXT - s.other))
          return (
            <div key={s.key} className="margin-box">
              <NumberInput
                id={`${id}${s.key}`}
                value={Math.round(mg[s.key]) / CM}
                onCommit={(cm) => onChange({ ...mg, [s.key]: Math.round(cm * CM * 10) / 10 })}
                min={0}
                max={Math.floor(maxMm) / CM}
                step={0.1}
                decimals={1}
                ariaLabel={tr.marginAria(s.label)}
              />
              <label className="margin-caption" htmlFor={`${id}${s.key}`}>
                {s.label}
              </label>
            </div>
          )
        })}
      </div>
      <span className="field-hint">{tr.marginsHint}</span>
    </div>
  )
}

/** A dialogue dash in the list: the dash large, in the book font (the two dashes look alike in the UI font), and its name. */
function DashChoice({ dash, name, font }: { dash: string; name: string; font: React.CSSProperties }): React.JSX.Element {
  return (
    <span className="dash-choice">
      <span className="dash-choice-glyph" style={font} aria-hidden>
        {dash}
      </span>
      {name}
    </span>
  )
}

/** One typing option: its name, an example of what it does, and its control. */
function TypingRow({
  label,
  before,
  after,
  font,
  off,
  children
}: {
  label: string
  before: string
  after: string
  font: React.CSSProperties
  off?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={clsx('typing-row', off && 'is-off')}>
      <span className="typing-name">{label}</span>
      <span className="typing-example" aria-hidden>
        <code>{before}</code>
        <span className="typing-arrow">→</span>
        <span className="typing-after" style={font}>
          {after}
        </span>
      </span>
      <span className="typing-control">{children}</span>
    </div>
  )
}

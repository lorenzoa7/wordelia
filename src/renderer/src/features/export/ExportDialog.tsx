import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { BookOpen, FileDoc, FilePdf, FileText, Files, MarkdownLogo } from '@phosphor-icons/react'
import { SCENE_BREAK_GLYPH, countMarkdownWords, markdownToPlain } from '@shared/book'
import { PAGE_SIZES, buildExportBook, headingParts, presetSettings } from '@shared/export/model'
import { buildPrintHtml } from '@shared/export/html'
import type { ExportSettings, PageSize } from '@shared/types'
import { Button, Dialog, Field, Select, Switch } from '@/ui'
import { invoke } from '@/lib/api'
import { BOOK_FONTS, fontStack } from '@/lib/fonts'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { flushEditor } from '@/features/editor/registry'
import { fontFaces } from './fontCss'
import './export.css'

type Format = 'pdf' | 'docx' | 'md' | 'txt'

const FORMATS: Array<{ id: Format; label: string; hint: string; icon: React.ReactNode }> = [
  { id: 'pdf', label: 'PDF', hint: 'Print-ready pages', icon: <FilePdf size={20} /> },
  { id: 'docx', label: 'Word', hint: 'Also for Google Docs', icon: <FileDoc size={20} /> },
  { id: 'md', label: 'Markdown', hint: 'One file', icon: <MarkdownLogo size={20} /> },
  { id: 'txt', label: 'Plain text', hint: 'No formatting', icon: <FileText size={20} /> }
]

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }): React.JSX.Element {
  const manifest = useBook((s) => s.manifest)
  const [format, setFormat] = useState<Format>('pdf')
  const [settings, setSettings] = useState<ExportSettings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && manifest) {
      flushEditor()
      setSettings(manifest.export)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = settings
  const set = (patch: Partial<ExportSettings>): void => setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
  const setTypo = (patch: Partial<ExportSettings['typography']>): void => setSettings((prev) => (prev ? { ...prev, typography: { ...prev.typography, ...patch } } : prev))

  const run = async (): Promise<void> => {
    if (!manifest || !s) return
    setBusy(true)
    try {
      const book = useBook.getState()
      const words = book.chapters.reduce((n, c) => n + countMarkdownWords(c.body), 0)
      const model = buildExportBook(manifest, book.chapters, words, s)
      const name = manifest.title || 'Book'
      let path: string | null = null
      if (format === 'pdf') {
        const fonts = BOOK_FONTS.find((f) => f.family === s.typography.fontFamily)?.bundled ? fontFaces(s.typography.fontFamily) : []
        path = await invoke('export:pdf', { html: buildPrintHtml(model, '/* FONT_FACES */'), defaultName: name, fonts })
      } else if (format === 'docx') {
        path = await invoke('export:docx', { book: model, defaultName: name })
      } else {
        const content = format === 'md' ? toMarkdown(model.title, model.author, book.chapters) : toText(model, book.chapters)
        path = await invoke('export:text', { content, defaultName: name, extension: format })
      }
      // Keep the export settings with the book.
      book.updateManifest({ export: s })
      if (path) {
        onOpenChange(false)
        toast(`Exported to ${path.split(/[\\/]/).pop()}`, { action: { label: 'Show', run: () => void invoke('window:showItem', path!) } })
      }
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const paged = format === 'pdf' || format === 'docx'

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export"
      description="Make a file to send to readers, editors or publishers."
      width={820}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy || !s}>
            {busy ? 'Exporting…' : `Export ${FORMATS.find((f) => f.id === format)?.label}`}
          </Button>
        </>
      }
    >
      {s && manifest && (
        <div className="export">
          <div className="export-left">
            <div className="format-grid">
              {FORMATS.map((f) => (
                <button key={f.id} aria-pressed={format === f.id} className={clsx('format-card', format === f.id && 'is-active')} onClick={() => setFormat(f.id)}>
                  {f.icon}
                  <span className="format-label">{f.label}</span>
                  <span className="format-hint">{f.hint}</span>
                </button>
              ))}
            </div>
            {paged && (
              <>
                <div className="preset-row">
                  <button
                    className={clsx('preset', s.preset === 'book' && 'is-active')}
                    aria-pressed={s.preset === 'book'}
                    onClick={() => setSettings(presetSettings('book', s, manifest.typography.fontFamily))}
                  >
                    <BookOpen size={16} />
                    <span>
                      <b>Book</b>
                      <small>Pages like a printed novel</small>
                    </span>
                  </button>
                  <button aria-pressed={s.preset === 'manuscript'} className={clsx('preset', s.preset === 'manuscript' && 'is-active')} onClick={() => setSettings(presetSettings('manuscript', s, manifest.typography.fontFamily))}>
                    <Files size={16} />
                    <span>
                      <b>Manuscript</b>
                      <small>Standard format for agents and publishers</small>
                    </span>
                  </button>
                </div>
                <div className="export-grid">
                  <Field label="Page size">
                    <Select
                      value={s.pageSize}
                      onValueChange={(v) => set({ pageSize: v as PageSize })}
                      options={(Object.keys(PAGE_SIZES) as PageSize[]).map((k) => ({ value: k, label: PAGE_SIZES[k].label }))}
                      ariaLabel="Page size"
                    />
                  </Field>
                  <Field label="Font">
                    <Select
                      value={s.typography.fontFamily}
                      onValueChange={(v) => setTypo({ fontFamily: v })}
                      options={BOOK_FONTS.map((f) => ({ value: f.family, label: f.label, style: { fontFamily: fontStack(f.family) } }))}
                      ariaLabel="Font"
                    />
                  </Field>
                  <Field label="Size">
                    <Select
                      value={String(s.typography.fontSize)}
                      onValueChange={(v) => setTypo({ fontSize: Number(v) })}
                      options={[9, 10, 10.5, 11, 11.5, 12, 13, 14].map((n) => ({ value: String(n), label: `${n} pt` }))}
                      ariaLabel="Size"
                    />
                  </Field>
                  <Field label="Line spacing">
                    <Select
                      value={String(s.typography.lineHeight)}
                      onValueChange={(v) => setTypo({ lineHeight: Number(v) })}
                      options={[1.15, 1.3, 1.45, 1.5, 1.6, 2].map((n) => ({ value: String(n), label: n === 2 ? 'Double' : String(n) }))}
                      ariaLabel="Line spacing"
                    />
                  </Field>
                  <Field label="Chapter heading">
                    <Select
                      value={s.chapterHeading}
                      onValueChange={(v) => set({ chapterHeading: v as ExportSettings['chapterHeading'] })}
                      options={[
                        { value: 'number-title', label: 'Number and title' },
                        { value: 'word-number-title', label: '“Chapter One” and title' },
                        { value: 'title', label: 'Title only' },
                        { value: 'number', label: 'Number only' }
                      ]}
                      ariaLabel="Chapter heading"
                    />
                  </Field>
                  <Field label="Scene break">
                    <Select
                      value={s.sceneBreak}
                      onValueChange={(v) => set({ sceneBreak: v as ExportSettings['sceneBreak'] })}
                      options={Object.entries(SCENE_BREAK_GLYPH).map(([k, g]) => ({ value: k, label: g || 'Blank line' }))}
                      ariaLabel="Scene break"
                    />
                  </Field>
                </div>
                <div className="export-switches">
                  <Field label="Title page" inline>
                    <Switch checked={s.titlePage} onCheckedChange={(v) => set({ titlePage: v })} />
                  </Field>
                  <Field label="Page numbers" inline>
                    <Switch checked={s.pageNumbers} onCheckedChange={(v) => set({ pageNumbers: v })} />
                  </Field>
                  <Field label="Running header" inline>
                    <Switch checked={s.runningHeader} onCheckedChange={(v) => set({ runningHeader: v })} />
                  </Field>
                  <Field label="Each chapter on a new page" inline>
                    <Switch checked={s.chapterStartsOnNewPage} onCheckedChange={(v) => set({ chapterStartsOnNewPage: v })} />
                  </Field>
                </div>
                {format === 'docx' && (
                  <p className="export-note">For Google Docs: upload the .docx file to Google Drive and open it with Google Docs. The fonts are Google Fonts, so they look the same.</p>
                )}
              </>
            )}
            {!paged && <p className="export-note">One file with all chapters, in order. {format === 'md' ? 'Formatting stays as Markdown.' : 'Formatting is removed.'}</p>}
          </div>
          {paged && <PagePreview settings={s} />}
        </div>
      )}
    </Dialog>
  )
}

/** A small live preview of one page, to scale. */
function PagePreview({ settings: s }: { settings: ExportSettings }): React.JSX.Element {
  const manifest = useBook((st) => st.manifest)!
  const chapters = useBook((st) => st.chapters)
  const size = PAGE_SIZES[s.pageSize]
  const scale = 250 / size.w
  const first = chapters[0]
  const paragraphs = useMemo(
    () =>
      markdownToPlain(first?.body ?? '')
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 12),
    [first?.body]
  )
  const ex = buildExportBook(manifest, first ? [first] : [], 0, s)
  const parts = ex.chapters[0] ? headingParts(ex, ex.chapters[0]) : { label: null, title: null }
  const pt = (n: number): string => `${n * 0.3528 * scale}px`
  return (
    <div className="preview-wrap">
      <div
        className="preview-page"
        style={{
          width: size.w * scale,
          height: size.h * scale,
          padding: `${s.margins.top * scale}px ${s.margins.outer * scale}px ${s.margins.bottom * scale}px ${s.margins.inner * scale}px`,
          fontFamily: fontStack(s.typography.fontFamily),
          fontSize: pt(s.typography.fontSize),
          lineHeight: s.typography.lineHeight,
          textAlign: s.typography.align
        }}
      >
        <div style={{ paddingTop: s.chapterDropFromTop * scale * 0.6, textAlign: 'center', marginBottom: '2em' }}>
          {parts.label && <div style={{ fontSize: s.preset === 'manuscript' ? '1em' : '2.4em', lineHeight: 1.1 }}>{parts.label}</div>}
          {parts.title && <div style={{ fontStyle: s.preset === 'manuscript' ? 'normal' : 'italic', fontSize: s.preset === 'manuscript' ? '1em' : '1.2em', marginTop: '0.4em' }}>{parts.title}</div>}
        </div>
        <div className="preview-text">
          {paragraphs.map((p, i) => (
            <p key={i} style={{ textIndent: i === 0 ? 0 : `${s.typography.firstLineIndent}em` }}>
              {p}
            </p>
          ))}
        </div>
        {s.pageNumbers && s.preset !== 'manuscript' && <div className="preview-folio" style={{ bottom: (s.margins.bottom * scale) / 2.4, fontSize: pt(s.typography.fontSize - 2) }}>1</div>}
      </div>
      <span className="preview-caption">{PAGE_SIZES[s.pageSize].label}</span>
    </div>
  )
}

function toMarkdown(title: string, author: string, chapters: Array<{ title: string; body: string }>): string {
  const head = `# ${title}\n\n${author ? `*${author}*\n\n` : ''}`
  return head + chapters.map((c) => `## ${c.title}\n\n${c.body.trim()}\n`).join('\n')
}

function toText(model: { title: string; author: string; settings: ExportSettings; language: string }, chapters: Array<{ title: string; body: string }>): string {
  const glyph = SCENE_BREAK_GLYPH[model.settings.sceneBreak] || ''
  const head = `${model.title}\n${model.author}\n\n\n`
  return (
    head +
    chapters
      .map((c, i) => {
        const text = markdownToPlain(c.body.replace(/^\* \* \*$/gm, glyph || ' '))
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        return `${i + 1}\n${c.title}\n\n${text}\n`
      })
      .join('\n\n\n')
  )
}

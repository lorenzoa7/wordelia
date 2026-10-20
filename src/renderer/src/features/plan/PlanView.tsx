import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, BookOpenText, CaretRight, ChatCircleText, DownloadSimple, Graph, ImageSquare, Plus, Trash, X } from '@phosphor-icons/react'
import { markdownToPlain } from '@shared/book'
import { entryNames } from '@shared/prompts/context'
import type { Entry } from '@shared/types'
import { Button, IconButton, Tooltip } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { invoke } from '@/lib/api'
import { useAssetUrl } from '@/lib/assets'
import { categoryName, useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { useChat } from '@/features/chat/chatStore'
import { useApp } from '@/stores/app'
import { LINE_PAGE, MAP_PAGE, MapView, PlanViewSwitch, mapBack, useReturnsToMap } from '@/features/graph'
import { StoryLineView } from './StoryLineView'
import { NoteEditor } from './NoteEditor'
import { CategoryIcon } from './PlanSidebar'
import { importNotes } from './importNotes'
import { BuildPlanningButton } from './SyncPanel'
import './plan.css'

/** One level up: from an entry to its category, from a category or the map to the overview. An entry opened from the map goes back to the map. */
function goBack(): void {
  if (mapBack()) return
  const s = useBook.getState()
  const entry = s.entries.find((e) => e.id === s.activeEntryId)
  if (entry) s.selectCategory(entry.category)
  else if (s.activeCategory) s.selectCategory(null)
}

function isTyping(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}

export function PlanView(): React.JSX.Element {
  const activeEntry = useBook((s) => s.entries.find((e) => e.id === s.activeEntryId))
  const activeCategory = useBook((s) => s.activeCategory)

  // Alt+Left goes back one level, as in a browser.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.key !== 'ArrowLeft' || isTyping(e.target)) return
      e.preventDefault()
      goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="plan-desk"
      // The back button of a mouse
      onMouseUp={(e) => {
        if (e.button === 3) {
          e.preventDefault()
          goBack()
        }
      }}
    >
      {activeEntry ? (
        <EntryEditor key={activeEntry.id} entry={activeEntry} />
      ) : activeCategory === MAP_PAGE ? (
        <MapView />
      ) : activeCategory === LINE_PAGE ? (
        <StoryLineView />
      ) : (
        <CategoryGrid key={activeCategory ?? ''} folder={activeCategory} />
      )}
    </div>
  )
}

/** "← Characters" at the top of a Plan page: back to the page above. */
function BackLink({ label, icon }: { label: string; icon?: ReactNode }): React.JSX.Element {
  const t = useT()
  return (
    <Tooltip label={t.plan.backTo(label)} shortcut="Alt+←">
      <button className="plan-back" onClick={goBack} aria-label={t.plan.backTo(label)}>
        <ArrowLeft className="plan-back-arrow" size={13} weight="bold" />
        {icon}
        <span>{label}</span>
      </button>
    </Tooltip>
  )
}

/* ------------------------------------------------------------------ */
/* Images                                                               */
/* ------------------------------------------------------------------ */

export { useAssetUrl }

function Portrait({ entry, size }: { entry: Entry; size: 'card' | 'large' }): React.JSX.Element {
  const url = useAssetUrl(entry.image)
  const initials = entry.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return url ? (
    <img className={`portrait portrait-${size}`} src={url} alt="" draggable={false} />
  ) : (
    <span className={`portrait portrait-${size} portrait-empty`}>{initials}</span>
  )
}

/* ------------------------------------------------------------------ */
/* Category grid                                                        */
/* ------------------------------------------------------------------ */

function CategoryGrid({ folder }: { folder: string | null }): React.JSX.Element {
  const t = useT()
  const manifest = useBook((s) => s.manifest)
  const entries = useBook((s) => s.entries)
  const categories = manifest?.planning.categories ?? []
  // An unknown folder (a deleted category, an old link) shows the overview.
  const category = categories.find((c) => c.folder === folder)
  const shown = category ? [category] : categories

  const add = async (cat: string): Promise<void> => {
    const e = await useBook.getState().createEntry(cat, t.plan.newEntryName)
    useBook.getState().selectEntry(e.id)
    setTimeout(() => document.querySelector<HTMLInputElement>('.entry-name')?.select(), 80)
  }

  const total = entries.length
  const count = (f: string): number => entries.filter((e) => e.category === f).length

  return (
    <div className="plan-scroll">
      <div className="plan-inner">
        {category ? (
          <header className="plan-hero plan-hero-category">
            <BackLink label={t.plan.sidebar.overview} />
            <h1>
              <CategoryIcon name={category.icon} size={26} />
              <span>{categoryName(t, category)}</span>
            </h1>
            <div className="plan-hero-row">
              <p className="plan-hero-count">{t.plan.category.count(count(category.folder))}</p>
              <div className="plan-hero-tools">
                <Button size="sm" variant="ghost" icon={<DownloadSimple size={14} />} onClick={() => void importNotes(category.folder)}>
                  {t.plan.category.importNotes}
                </Button>
                <Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={() => void add(category.folder)}>
                  {t.plan.category.newEntry}
                </Button>
              </div>
            </div>
          </header>
        ) : (
          <header className="plan-hero">
            <div className="plan-hero-top">
              <h1>{t.plan.overview.title}</h1>
              <PlanViewSwitch active="cards" />
            </div>
            <p>{t.plan.overview.intro}</p>
            {total === 0 && (
              <div className="plan-hero-actions">
                <BuildPlanningButton />
              </div>
            )}
          </header>
        )}
        {shown.map((c, ci) => {
          const list = entries.filter((e) => e.category === c.folder).sort((a, b) => a.name.localeCompare(b.name))
          return (
            <section key={c.id} className="plan-section">
              {!category && (
                <h2 className="plan-section-title">
                  <button className="plan-section-link" onClick={() => useBook.getState().selectCategory(c.folder)}>
                    <CategoryIcon name={c.icon} size={16} />
                    <span>{categoryName(t, c)}</span>
                    <span className="plan-section-count">{list.length}</span>
                    <CaretRight className="plan-section-go" size={11} weight="bold" aria-hidden />
                  </button>
                </h2>
              )}
              <div className="entry-grid">
                {list.map((e, i) => (
                  <motion.button
                    key={e.id}
                    className="entry-card grain"
                    onClick={() => useBook.getState().selectEntry(e.id)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.03 * (i + ci * 3), 0.4), duration: 0.35 }}
                  >
                    {c.folder === 'Characters' || e.image ? <Portrait entry={e} size="card" /> : null}
                    <span className="entry-card-name">{e.name}</span>
                    <span className="entry-card-summary">{e.summary || firstSentence(e.body) || t.plan.overview.noNotesYet}</span>
                  </motion.button>
                ))}
                <button className="entry-card entry-card-new" onClick={() => void add(c.folder)}>
                  <Plus size={18} />
                  <span>{t.plan.overview.newCard}</span>
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function firstSentence(md: string): string {
  const t = markdownToPlain(md).replace(/\s+/g, ' ').trim()
  const m = /^(.{0,140}?[.!?])(\s|$)/.exec(t)
  return m ? m[1] : t.slice(0, 140)
}

/* ------------------------------------------------------------------ */
/* Entry editor                                                         */
/* ------------------------------------------------------------------ */

function EntryEditor({ entry }: { entry: Entry }): React.JSX.Element {
  const t = useT()
  const root = useBook((s) => s.root)
  const chapters = useBook((s) => s.chapters)
  const rev = useBook((s) => s.externalRev[entry.id] ?? 0)
  const category = useBook((s) => s.manifest?.planning.categories.find((c) => c.folder === entry.category))
  const [name, setName] = useState(entry.name)
  const [aliasDraft, setAliasDraft] = useState('')
  const fromMap = useReturnsToMap(entry.id)
  useEffect(() => setName(entry.name), [entry.name])

  const mentions = useMemo(() => {
    const names = entryNames(entry)
    if (!names.length) return []
    return chapters
      .map((c, i) => {
        const plain = markdownToPlain(c.body)
        let n = 0
        for (const nm of names) {
          const re = new RegExp(`(?<![\\p{L}\\p{N}])${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu')
          n += plain.match(re)?.length ?? 0
        }
        return { id: c.id, title: c.title, index: i, n }
      })
      .filter((m) => m.n > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, entry.name, entry.aliases.join('|')])

  const update = useBook.getState().updateEntry
  const pickImage = async (): Promise<void> => {
    if (!root) return
    const path = await invoke('book:pickImage')
    if (!path) return
    const rel = await invoke('book:importAsset', root, path)
    update(entry.id, { image: rel })
  }
  const addAlias = (): void => {
    const a = aliasDraft.trim()
    if (a && !entry.aliases.includes(a)) update(entry.id, { aliases: [...entry.aliases, a] })
    setAliasDraft('')
  }
  const remove = async (): Promise<void> => {
    const ok = await askConfirm({
      title: t.plan.entry.deleteTitle(entry.name),
      message: t.plan.entry.deleteMessage,
      confirm: t.common.delete,
      danger: true
    })
    if (ok) await useBook.getState().deleteEntry(entry.id)
  }

  return (
    <div className="plan-scroll">
      <motion.article
        className="entry-page grain"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="entry-crumbs">
          {fromMap ? (
            <BackLink label={t.plan.map.map} icon={<Graph size={13} />} />
          ) : (
            <BackLink label={category ? categoryName(t, category) : entry.category} icon={<CategoryIcon name={category?.icon ?? 'Folder'} size={13} />} />
          )}
          <span className="entry-tools">
            <IconButton
              label={t.plan.entry.askChat}
              onClick={() => {
                useChat.getState().addMention({ kind: 'entry', id: entry.id, label: entry.name })
                useApp.getState().setUi({ chatOpen: true })
                setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer-input')?.focus(), 250)
              }}
            >
              <ChatCircleText size={16} />
            </IconButton>
            <IconButton label={t.plan.entry.deleteEntry} onClick={() => void remove()}>
              <Trash size={16} />
            </IconButton>
          </span>
        </div>
        <header className="entry-head">
          <button className="entry-portrait" onClick={() => void pickImage()} aria-label={t.plan.entry.chooseImage}>
            <Portrait entry={entry} size="large" />
            <span className="entry-portrait-hint">
              <ImageSquare size={14} /> {entry.image ? t.plan.entry.changeImage : t.plan.entry.addImage}
            </span>
          </button>
          <div className="entry-fields">
            <input
              className="entry-name"
              value={name}
              aria-label={t.plan.name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== entry.name && void useBook.getState().renameEntry(entry.id, name)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            {/* One line of text that wraps, so a long summary stays in view */}
            <textarea
              className="entry-summary"
              rows={1}
              value={entry.summary}
              placeholder={t.plan.entry.summaryPlaceholder}
              aria-label={t.plan.entry.summary}
              onChange={(e) => update(entry.id, { summary: e.target.value.replace(/\s*\n\s*/g, ' ') })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.target as HTMLTextAreaElement).blur()
                }
              }}
            />
            <div className="entry-aliases">
              <span className="caps">{t.plan.entry.alsoCalled}</span>
              {entry.aliases.map((a) => (
                <span key={a} className="alias-chip">
                  {a}
                  <button onClick={() => update(entry.id, { aliases: entry.aliases.filter((x) => x !== a) })} aria-label={t.plan.entry.removeAlias(a)}>
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                className="alias-input"
                value={aliasDraft}
                placeholder={t.plan.entry.aliasPlaceholder}
                onChange={(e) => setAliasDraft(e.target.value)}
                onBlur={addAlias}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addAlias()
                  }
                }}
              />
            </div>
          </div>
        </header>
        <div className="entry-body">
          <NoteEditor
            docKey={entry.id}
            rev={rev}
            value={entry.body}
            onChange={(md) => update(entry.id, { body: md })}
            quoteLabel={entry.name}
            inlineProposals
            placeholder={t.plan.entry.notesPlaceholder}
          />
        </div>
        {mentions.length > 0 && (
          <footer className="entry-mentions">
            <span className="caps">{t.plan.entry.inManuscript}</span>
            <div>
              {mentions.map((m) => (
                <button
                  key={m.id}
                  className="mention-link"
                  onClick={() => {
                    useBook.getState().selectChapter(m.id)
                    useUi.getState().setFindOpen(true)
                  }}
                >
                  <BookOpenText size={12} /> {m.index + 1}. {m.title} <span>×{m.n}</span>
                </button>
              ))}
            </div>
          </footer>
        )}
      </motion.article>
    </div>
  )
}

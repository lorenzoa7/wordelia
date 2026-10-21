import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, BookOpenText, CaretDown, CaretRight, ChatCircleText, Check, DownloadSimple, Graph, ImageSquare, Path, Plus, SquaresFour, Trash, X } from '@phosphor-icons/react'
import { markdownToPlain } from '@shared/book'
import { entryNames } from '@shared/prompts/context'
import { createNameMatcher } from '@shared/planning/graph'
import { compareNames, inFolder, subFolder, topFolder } from '@shared/planning/notes'
import type { Entry } from '@shared/types'
import { Button, IconButton, Menu, MenuItem, Tooltip } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { invoke } from '@/lib/api'
import { useAssetUrl } from '@/lib/assets'
import { registerFlusher } from '@/lib/flush'
import { categoryName, useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { useNotes } from './line/model'
import { useUi } from '@/stores/ui'
import { useChat } from '@/features/chat/chatStore'
import { ImageViewer } from '@/features/chat/ChatImages'
import { acceptPortraitProposal, rejectPortraitProposal, useInlineProposals } from '@/features/editor/inlineProposals'
import { useApp } from '@/stores/app'
import { LINE_PAGE, MAP_PAGE, MapView, PlanViewSwitch, planBack, useBackPlace } from '@/features/graph'
import { LineView } from './line/LineView'
import { NoteEditor } from './NoteEditor'
import { CategoryIcon, CategoryMenu } from './PlanSidebar'
import { importNotes } from './importNotes'
import { addAlias, deleteNote, moveNote, removePortrait, renameNote } from './noteActions'
import { BuildPlanningButton, SyncButton } from './SyncPanel'
import './plan.css'

/** Back to the page before, as in a browser (features/graph/nav.ts); with no page before, one level up. */
function goBack(): void {
  planBack()
}

function isTyping(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}

/** On macOS, Option+← moves the caret one word: in a text box it stays a text key. */
const MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

export function PlanView(): React.JSX.Element {
  const activeEntry = useBook((s) => s.entries.find((e) => e.id === s.activeEntryId))
  const activeCategory = useBook((s) => s.activeCategory)

  // Alt+Left goes back one level, as in a browser: also from a text box (it saves first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.key !== 'ArrowLeft') return
      const target = e.target instanceof HTMLElement ? e.target : null
      if ((MAC && isTyping(target)) || target?.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return
      e.preventDefault()
      // A box saves when it loses the focus: the name, an alias, a card.
      if (isTyping(document.activeElement)) (document.activeElement as HTMLElement).blur()
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
        <LineView />
      ) : (
        <CategoryGrid key={activeCategory ?? ''} folder={activeCategory} />
      )}
    </div>
  )
}

/** "← Story line" at the top of a Plan page: back to the page before (or one level up), with its name. */
function BackLink(): React.JSX.Element | null {
  const t = useT()
  const place = useBackPlace()
  const entry = useBook((s) => (place?.entry ? s.entries.find((e) => e.id === place.entry) : undefined))
  const categories = useBook((s) => s.manifest?.planning.categories ?? [])
  if (!place) return null
  const folder = topFolder(entry ? entry.category : (place.category ?? ''))
  const category = categories.find((c) => c.folder === folder)
  let label: string = t.plan.sidebar.overview
  let icon: ReactNode = <SquaresFour size={13} />
  if (entry) {
    label = entry.name
    icon = <CategoryIcon name={category?.icon ?? 'Folder'} size={13} />
  } else if (place.category === MAP_PAGE) {
    label = t.plan.map.map
    icon = <Graph size={13} />
  } else if (place.category === LINE_PAGE) {
    label = t.plan.line.title
    icon = <Path size={13} />
  } else if (place.category && category) {
    label = categoryName(t, category)
    icon = <CategoryIcon name={category.icon} size={13} />
  }
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

/** The image that the chat proposes as the portrait of a note */
function ProposedPortrait({ image }: { image: string }): React.JSX.Element {
  const url = useAssetUrl(image)
  return url ? <img className="portrait portrait-large" src={url} alt="" draggable={false} /> : <span className="portrait portrait-large portrait-empty" />
}

/* ------------------------------------------------------------------ */
/* Category grid                                                        */
/* ------------------------------------------------------------------ */

/** Where the overview and each category page were scrolled, for each book: back on a page, it is there again. */
const scrolls = new Map<string, number>()

function CategoryGrid({ folder }: { folder: string | null }): React.JSX.Element {
  const t = useT()
  const manifest = useBook((s) => s.manifest)
  const root = useBook((s) => s.root)
  const hasText = useBook((s) => s.chapters.some((c) => c.body.trim()))
  const sidebarOpen = useApp((s) => s.settings?.ui.sidebarOpen ?? true)
  const entries = useNotes()
  const categories = manifest?.planning.categories ?? []
  // An unknown folder (a deleted category, an old link) shows the overview.
  const category = categories.find((c) => c.folder === folder)
  const shown = category ? [category] : categories
  // Notes at the root of planning/ (no category folder) show in a section of their own.
  const outside = useMemo(() => (category ? [] : entries.filter((e) => !e.category).sort((a, b) => compareNames(a.name, b.name))), [category, entries])

  // The scroll of the page: it comes back when the writer comes back to the page.
  const box = useRef<HTMLDivElement>(null)
  const place = `${root}:${folder ?? ''}`
  useLayoutEffect(() => {
    const top = scrolls.get(place)
    if (box.current && top) box.current.scrollTop = top
  }, [place])

  const add = async (cat: string): Promise<void> => {
    const e = await useBook.getState().createEntry(cat, t.plan.newEntryName)
    useBook.getState().selectEntry(e.id)
    setTimeout(() => document.querySelector<HTMLInputElement>('.entry-name')?.select(), 80)
  }

  const total = entries.length
  const listOf = (f: string): Entry[] => entries.filter((e) => inFolder(e, f)).sort((a, b) => compareNames(a.name, b.name))

  return (
    <div className="plan-scroll" ref={box} onScroll={(e) => scrolls.set(place, e.currentTarget.scrollTop)}>
      <div className="plan-inner">
        {category ? (
          <header className="plan-hero plan-hero-category">
            <BackLink />
            <h1>
              <CategoryIcon name={category.icon} size={26} />
              <span>{categoryName(t, category)}</span>
            </h1>
            <div className="plan-hero-row">
              <p className="plan-hero-count">{t.plan.category.count(listOf(category.folder).length)}</p>
              <div className="plan-hero-tools">
                {!sidebarOpen && <SyncButton compact />}
                <Button size="sm" variant="ghost" icon={<DownloadSimple size={14} />} onClick={() => void importNotes(category.folder)}>
                  {t.plan.category.importNotes}
                </Button>
                <Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={() => void add(category.folder)}>
                  {t.plan.category.newEntry}
                </Button>
                <CategoryMenu category={category} notes={listOf(category.folder).length} />
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
            {/* With the sidebar hidden, the sync button is here. The build button needs text to read. */}
            {(!sidebarOpen || (total === 0 && hasText)) && (
              <div className="plan-hero-actions">
                {!sidebarOpen && <SyncButton compact />}
                {total === 0 && hasText && <BuildPlanningButton />}
              </div>
            )}
          </header>
        )}
        {shown.map((c, ci) => {
          const list = listOf(c.folder)
          return (
            <section key={c.id} className="plan-section">
              {!category && (
                <h2 className="plan-section-title">
                  <button className="plan-section-link" onClick={() => useBook.getState().selectCategory(c.folder)}>
                    <CategoryIcon name={c.icon} size={16} />
                    <span>{categoryName(t, c)}</span>
                    {/* As in the sidebar: an empty category shows no number. */}
                    <span className="plan-section-count">{list.length || ''}</span>
                    <CaretRight className="plan-section-go" size={11} weight="bold" aria-hidden />
                  </button>
                </h2>
              )}
              <div className="entry-grid">
                {list.map((e, i) => (
                  <EntryCard key={e.id} entry={e} delay={Math.min(0.03 * (i + ci * 3), 0.4)} portrait={c.folder === 'Characters'} />
                ))}
                <button className="entry-card entry-card-new" onClick={() => void add(c.folder)}>
                  <Plus size={18} />
                  <span>{t.plan.overview.newCard}</span>
                </button>
              </div>
            </section>
          )
        })}
        {outside.length > 0 && (
          <section className="plan-section">
            <h2 className="plan-section-title">
              <span className="plan-section-plain">
                <CategoryIcon name="Folder" size={16} />
                <span>{t.plan.sidebar.outside}</span>
                <span className="plan-section-count">{outside.length}</span>
              </span>
            </h2>
            <div className="entry-grid">
              {outside.map((e, i) => (
                <EntryCard key={e.id} entry={e} delay={Math.min(0.03 * i, 0.4)} portrait={false} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function EntryCard({ entry, delay, portrait }: { entry: Entry; delay: number; portrait: boolean }): React.JSX.Element {
  const t = useT()
  const folder = subFolder(entry.category)
  return (
    <motion.button
      className="entry-card grain"
      onClick={() => useBook.getState().selectEntry(entry.id)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
    >
      {portrait || entry.image ? <Portrait entry={entry} size="card" /> : null}
      {folder && (
        <span className="entry-card-folder" title={t.plan.entry.inFolder(folder)}>
          {folder}
        </span>
      )}
      <span className="entry-card-name">{entry.name}</span>
      <span className="entry-card-summary">{entry.summary || firstSentence(entry.body) || t.plan.overview.noNotesYet}</span>
    </motion.button>
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

/** The chapters that use the names of a note: how many times, and the name that comes first in each. */
function useMentions(entry: Entry): Array<{ id: string; title: string; index: number; n: number; first: string }> {
  const chapters = useBook((s) => s.chapters)
  return useMemo(() => {
    const names = entryNames(entry)
    if (!names.length) return []
    // The matcher of the map: each name once (an alias "Marta" next to the name "Marta" counts
    // once), the longest name first, and [[links]] too.
    const matcher = createNameMatcher([entry])
    return chapters
      .map((c, i) => {
        const n = matcher.count(c.body).get(entry.id)?.n ?? 0
        if (!n) return null
        const plain = markdownToPlain(c.body)
        let first = names[0]
        let at = Infinity
        for (const nm of names) {
          const body = nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const m = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu').exec(plain)
          if (m && m.index < at) {
            at = m.index
            first = nm
          }
        }
        return { id: c.id, title: c.title, index: i, n, first }
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, entry.name, entry.aliases.join('|')])
}

/** "Characters ▾" at the top of a note: the category of the note, and a menu to move it. */
function CategoryPicker({ entry }: { entry: Entry }): React.JSX.Element {
  const t = useT()
  const categories = useBook((s) => s.manifest?.planning.categories ?? [])
  const top = topFolder(entry.category)
  const current = categories.find((c) => c.folder === top)
  const label = current ? categoryName(t, current) : t.plan.sidebar.outside
  const folder = subFolder(entry.category)
  return (
    <Menu
      align="end"
      trigger={
        <button className="entry-category" aria-label={t.plan.entry.moveTo(label)} title={t.plan.entry.moveTo(label)}>
          <CategoryIcon name={current?.icon ?? 'Folder'} size={13} />
          <span>{folder ? `${label} / ${folder}` : label}</span>
          <CaretDown size={10} weight="bold" />
        </button>
      }
    >
      {categories.map((c) => (
        <MenuItem key={c.id} icon={<CategoryIcon name={c.icon} size={14} />} checked={c.folder === top} onSelect={() => c.folder !== top && void moveNote(entry.id, c.folder)}>
          {categoryName(t, c)}
        </MenuItem>
      ))}
    </Menu>
  )
}

function EntryEditor({ entry }: { entry: Entry }): React.JSX.Element {
  const t = useT()
  const root = useBook((s) => s.root)
  const rev = useBook((s) => s.externalRev[entry.id] ?? 0)
  const [name, setName] = useState(entry.name)
  const [aliasDraft, setAliasDraft] = useState('')
  const [viewing, setViewing] = useState<string | null>(null)
  useEffect(() => setName(entry.name), [entry.name])
  // A portrait that the chat proposes shows in the place of the portrait, with Use and Reject.
  const proposal = useInlineProposals((s) => s.portraits.filter((p) => p.docId === entry.id).at(-1) ?? null)
  const shown = proposal?.image ?? entry.image
  const mentions = useMentions(entry)

  // The name and the alias save when their box loses the focus. A page that closes (a shortcut, a
  // link) fires no blur: the draft saves then too. `sent` is the last name that went to the store.
  const draft = useRef({ name, alias: aliasDraft, sent: entry.name })
  draft.current.name = name
  draft.current.alias = aliasDraft
  useEffect(() => {
    draft.current.sent = entry.name
  }, [entry.name])
  const commitName = (): void => {
    const d = draft.current
    if (!d.name.trim() || d.name === d.sent) return
    d.sent = d.name
    void renameNote(entry.id, d.name).then((ok) => {
      // Refused (the name of another note): the box shows the name again.
      if (!ok) {
        const now = useBook.getState().entries.find((x) => x.id === entry.id)?.name ?? entry.name
        draft.current.sent = now
        setName(now)
      }
    })
  }
  const commitAlias = (): void => {
    const a = draft.current.alias.trim()
    draft.current.alias = ''
    setAliasDraft('')
    if (a) addAlias(entry.id, a)
  }
  useEffect(() => {
    const flush = (): void => {
      const d = draft.current
      if (d.name.trim() && d.name !== d.sent) {
        d.sent = d.name
        void renameNote(entry.id, d.name)
      }
      const a = d.alias.trim()
      d.alias = ''
      if (a) addAlias(entry.id, a)
    }
    const unregister = registerFlusher(flush)
    return () => {
      unregister()
      flush()
    }
  }, [entry.id])

  const update = useBook.getState().updateEntry
  const pickImage = async (): Promise<void> => {
    if (!root) return
    const path = await invoke('book:pickImage')
    if (!path) return
    const rel = await invoke('book:importAsset', root, path)
    update(entry.id, { image: rel })
  }
  const remove = async (): Promise<void> => {
    const ok = await askConfirm({
      title: t.plan.entry.deleteTitle(entry.name),
      message: t.plan.entry.deleteMessage,
      confirm: t.common.delete,
      danger: true
    })
    if (ok) await deleteNote(entry.id)
  }

  return (
    <div className="plan-scroll">
      <motion.article
        className="entry-page grain"
        data-entry={entry.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="entry-crumbs">
          <BackLink />
          <span className="entry-tools">
            <CategoryPicker entry={entry} />
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
          <div className="entry-portrait-col">
            {/* The image is square here: a click shows it whole. "Change" and "Remove" are buttons of their own. */}
            <div className={`entry-portrait${proposal ? ' is-proposed' : ''}`}>
              <button
                className="entry-portrait-img"
                onClick={() => (shown ? setViewing(shown) : void pickImage())}
                aria-label={shown ? t.plan.entry.viewImage : t.plan.entry.chooseImage}
              >
                {proposal ? <ProposedPortrait image={proposal.image} /> : <Portrait entry={entry} size="large" />}
              </button>
              {!proposal && (
                <div className="entry-portrait-bar">
                  <button className="entry-portrait-hint" onClick={() => void pickImage()} aria-label={t.plan.entry.chooseImage}>
                    <ImageSquare size={14} /> {entry.image ? t.plan.entry.changeImage : t.plan.entry.addImage}
                  </button>
                  {entry.image && (
                    <button className="entry-portrait-remove" onClick={() => removePortrait(entry.id)} aria-label={t.plan.entry.removeImageLabel}>
                      <X size={12} /> {t.plan.entry.removeImage}
                    </button>
                  )}
                </div>
              )}
            </div>
            {proposal && (
              <div className="entry-portrait-decide" role="group" aria-label={t.plan.entry.proposedPortrait}>
                <span className="caps">{t.plan.entry.proposedPortrait}</span>
                <button className="pm-prop-btn is-accept" onClick={() => acceptPortraitProposal(proposal)}>
                  <Check size={11} weight="bold" /> {t.plan.entry.usePortrait}
                </button>
                <button className="pm-prop-btn is-reject" onClick={() => rejectPortraitProposal(proposal)}>
                  <X size={11} weight="bold" /> {t.common.reject}
                </button>
              </div>
            )}
          </div>
          <ImageViewer file={viewing} name={entry.name} onClose={() => setViewing(null)} />
          <div className="entry-fields">
            <input
              className="entry-name"
              value={name}
              aria-label={t.plan.name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  // Esc puts the name back, and nothing changes.
                  draft.current.name = entry.name
                  setName(entry.name)
                  e.currentTarget.blur()
                }
              }}
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
                aria-label={t.plan.entry.alsoCalled}
                onChange={(e) => setAliasDraft(e.target.value)}
                onBlur={commitAlias}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    commitAlias()
                  }
                  if (e.key === 'Escape') {
                    draft.current.alias = ''
                    setAliasDraft('')
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
                <Tooltip key={m.id} label={t.plan.entry.findInChapter(m.first)}>
                  <button
                    className="mention-link"
                    data-chapter={m.id}
                    onClick={() => {
                      // The chapter opens with the find bar on the name, at its first mention.
                      useUi.getState().openFind(m.first, m.id)
                      useBook.getState().selectChapter(m.id)
                    }}
                  >
                    <BookOpenText size={12} /> {m.index + 1}. {m.title} <span>×{m.n}</span>
                  </button>
                </Tooltip>
              ))}
            </div>
          </footer>
        )}
      </motion.article>
    </div>
  )
}

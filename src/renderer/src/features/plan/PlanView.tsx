import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowBendUpLeft, BookOpenText, ImageSquare, Plus, Trash, X } from '@phosphor-icons/react'
import { markdownToPlain } from '@shared/book'
import { entryNames } from '@shared/prompts/context'
import type { Entry } from '@shared/types'
import { Button, IconButton, Tooltip } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { invoke } from '@/lib/api'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { useChat } from '@/features/chat/chatStore'
import { useApp } from '@/stores/app'
import { NoteEditor } from './NoteEditor'
import { CategoryIcon, RULES_CATEGORY } from './PlanSidebar'
import { startPlanningSync } from './sync'
import './plan.css'

export function PlanView(): React.JSX.Element {
  const activeEntry = useBook((s) => s.entries.find((e) => e.id === s.activeEntryId))
  const activeCategory = useBook((s) => s.activeCategory)
  return (
    <div className="plan-desk">
      {activeEntry ? (
        <EntryEditor key={activeEntry.id} entry={activeEntry} />
      ) : activeCategory === RULES_CATEGORY ? (
        <WritingRules />
      ) : (
        <CategoryGrid folder={activeCategory} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Images                                                               */
/* ------------------------------------------------------------------ */

export function useAssetUrl(rel: string | null): string | null {
  const root = useBook((s) => s.root)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!rel || !root) {
      setUrl(null)
      return
    }
    void invoke('book:assetUrl', root, rel).then(setUrl)
  }, [rel, root])
  return url
}

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
  const manifest = useBook((s) => s.manifest)
  const entries = useBook((s) => s.entries)
  const categories = manifest?.planning.categories ?? []
  const shown = folder ? categories.filter((c) => c.folder === folder) : categories

  const add = async (cat: string): Promise<void> => {
    const e = await useBook.getState().createEntry(cat, 'New entry')
    useBook.getState().selectEntry(e.id)
    setTimeout(() => document.querySelector<HTMLInputElement>('.entry-name')?.select(), 80)
  }

  const total = entries.length

  return (
    <div className="plan-scroll">
      <div className="plan-inner">
        {!folder && (
          <header className="plan-hero">
            <h1>The story bible</h1>
            <p>
              Characters, places, the world and the plot. The AI reads this planning in every chat and action, so the book stays consistent.
            </p>
            {total === 0 && (
              <div className="plan-hero-actions">
                <Button variant="ribbon" onClick={() => void startPlanningSync({ bootstrap: true })}>
                  Build the planning from the manuscript
                </Button>
              </div>
            )}
          </header>
        )}
        {shown.map((c, ci) => {
          const list = entries.filter((e) => e.category === c.folder).sort((a, b) => a.name.localeCompare(b.name))
          return (
            <section key={c.id} className="plan-section">
              <h2 className="plan-section-title">
                <CategoryIcon name={c.icon} size={16} />
                <span>{c.name}</span>
                <span className="plan-section-count">{list.length}</span>
              </h2>
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
                    <span className="entry-card-summary">{e.summary || firstSentence(e.body) || 'No notes yet.'}</span>
                  </motion.button>
                ))}
                <button className="entry-card entry-card-new" onClick={() => void add(c.folder)}>
                  <Plus size={18} />
                  <span>New</span>
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
  const root = useBook((s) => s.root)
  const chapters = useBook((s) => s.chapters)
  const rev = useBook((s) => s.externalRev[entry.id] ?? 0)
  const category = useBook((s) => s.manifest?.planning.categories.find((c) => c.folder === entry.category))
  const [name, setName] = useState(entry.name)
  const [aliasDraft, setAliasDraft] = useState('')
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
      title: `Delete “${entry.name}”?`,
      message: "The file moves to the book's .wordelia/trash folder.",
      confirm: 'Delete',
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
          <button onClick={() => useBook.getState().selectCategory(entry.category)}>
            <CategoryIcon name={category?.icon ?? 'Folder'} size={13} /> {category?.name ?? entry.category}
          </button>
          <span className="entry-tools">
            <Tooltip label="Ask the chat about this entry">
              <IconButton
                label="Mention in chat"
                onClick={() => {
                  useChat.getState().addMention({ kind: 'entry', id: entry.id, label: entry.name })
                  useApp.getState().setUi({ chatOpen: true })
                }}
              >
                <ArrowBendUpLeft size={15} />
              </IconButton>
            </Tooltip>
            <IconButton label="Delete entry" onClick={() => void remove()}>
              <Trash size={15} />
            </IconButton>
          </span>
        </div>
        <header className="entry-head">
          <button className="entry-portrait" onClick={() => void pickImage()} title="Choose an image">
            <Portrait entry={entry} size="large" />
            <span className="entry-portrait-hint">
              <ImageSquare size={14} /> {entry.image ? 'Change' : 'Add image'}
            </span>
          </button>
          <div className="entry-fields">
            <input
              className="entry-name"
              value={name}
              aria-label="Name"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== entry.name && void useBook.getState().renameEntry(entry.id, name)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <input
              className="entry-summary"
              value={entry.summary}
              placeholder="One line that describes this entry"
              aria-label="Summary"
              onChange={(e) => update(entry.id, { summary: e.target.value })}
            />
            <div className="entry-aliases">
              <span className="caps">Also called</span>
              {entry.aliases.map((a) => (
                <span key={a} className="alias-chip">
                  {a}
                  <button onClick={() => update(entry.id, { aliases: entry.aliases.filter((x) => x !== a) })} aria-label={`Remove ${a}`}>
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                className="alias-input"
                value={aliasDraft}
                placeholder="+ name"
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
            placeholder="Notes: appearance, personality, history, secrets…"
          />
        </div>
        {mentions.length > 0 && (
          <footer className="entry-mentions">
            <span className="caps">In the manuscript</span>
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

/* ------------------------------------------------------------------ */
/* Writing rules                                                        */
/* ------------------------------------------------------------------ */

function WritingRules(): React.JSX.Element {
  const rules = useBook((s) => s.writingRules)
  const setRules = useBook((s) => s.setWritingRules)
  return (
    <div className="plan-scroll">
      <motion.article className="entry-page grain" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <header className="rules-head">
          <h1>Writing rules</h1>
          <p>
            Your rules for this book: voice, point of view, tense, dialogue, words to avoid. Every AI action and chat follows them. Paste the rules from your old prompt here.
          </p>
        </header>
        <div className="entry-body">
          <NoteEditor docKey="writing-rules" value={rules} onChange={setRules} placeholder="Write your rules…" />
        </div>
      </motion.article>
    </div>
  )
}


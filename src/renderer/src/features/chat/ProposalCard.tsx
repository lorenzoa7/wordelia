import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { BookOpenText, Check, Columns, Crosshair, FilePlus, Notebook, Path, Rows, UserCircle, WarningCircle, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import { markdownToPlain } from '@shared/book'
import { readFrontmatter } from '@shared/markdown/frontmatter'
import { hunkKey, parseProposals, type Hunk, type Segment } from '@shared/proposals/parse'
import { wordDiff, diffStats, type DiffOp } from '@shared/text/diff'
import { findStoryLine } from '@shared/storyline'
import type { ChatMessage, HunkState, Thread } from '@shared/types'
import { Spinner, Tooltip } from '@/ui'
import { useBook } from '@/stores/book'
import { typesetForBook } from '@/lib/typeset'
import { useAssetUrl } from '@/lib/assets'
import { toast } from '@/stores/ui'
import { folderCategoryName, useT } from '@/lib/i18n'
import { inlineProposalId, revealProposal } from '@/features/editor/inlineProposals'
import { openLine } from '@/features/graph'
import { acceptLineProposal, isLineSegment, lineStateOf, messageLineProposal, rejectLineProposal, type LineSegment } from '@/features/plan/line/proposal'
import { useChat } from './chatStore'
import { applyCreate, applyEditHunk, applyPortrait, markAfter, resolveTarget, restoreSnapshot, setHunkStates, snapshotOf, type Snapshot } from './applyProposal'

type EditSeg = Extract<Segment, { kind: 'edit' }>
type CreateSeg = Extract<Segment, { kind: 'create' }>
type PortraitSeg = Extract<Segment, { kind: 'portrait' }>

interface Props {
  segment: EditSeg | CreateSeg | PortraitSeg
  message?: ChatMessage
  thread?: Thread
  streaming?: boolean
}

function setHunkState(thread: Thread, messageId: string, key: string, state: HunkState): void {
  setHunkStates(thread, messageId, { [key]: state })
}

export function ProposalCard(props: Props): React.JSX.Element {
  if (props.segment.kind === 'portrait') return <PortraitCard {...props} segment={props.segment} />
  // The story line shows its changes on its board: the card has the counts and the decision.
  if (isLineSegment(props.segment)) return <LineCard {...props} segment={props.segment as LineSegment} />
  return props.segment.kind === 'edit' ? <EditCard {...props} segment={props.segment} /> : <CreateCard {...props} segment={props.segment} />
}

function DiffText({ ops }: { ops: DiffOp[] }): React.JSX.Element {
  return (
    <>
      {ops.map((op, i) =>
        op.type === 'equal' ? (
          <span key={i}>{op.text}</span>
        ) : op.type === 'delete' ? (
          <del key={i}>{op.text}</del>
        ) : (
          <ins key={i}>{op.text}</ins>
        )
      )}
    </>
  )
}

function plain(md: string): string {
  return markdownToPlain(md).replace(/\n{3,}/g, '\n\n').trim()
}

function HunkView({ hunk, split }: { hunk: Hunk; split: boolean }): React.JSX.Element {
  const before = plain(hunk.find)
  const after = plain(hunk.replace)
  const ops = useMemo(() => (hunk.complete ? wordDiff(before, after) : []), [before, after, hunk.complete])
  if (!hunk.complete) {
    return <div className="hunk-text is-partial">{after || before}</div>
  }
  if (split) {
    return (
      <div className="hunk-split">
        {before && (
          <div className="hunk-line hunk-old">
            <span className="hunk-sign">−</span>
            <div>
              <DiffText ops={ops.filter((o) => o.type !== 'insert')} />
            </div>
          </div>
        )}
        <div className="hunk-line hunk-new">
          <span className="hunk-sign">+</span>
          <div>
            <DiffText ops={ops.filter((o) => o.type !== 'delete')} />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="hunk-text">
      {before ? <DiffText ops={ops} /> : <ins>{after}</ins>}
    </div>
  )
}

function EditCard({ segment: raw, message, thread, streaming }: Props & { segment: EditSeg }): React.JSX.Element {
  const t = useT()
  const [split, setSplit] = useState(false)
  const [busy, setBusy] = useState(false)
  const target = resolveTarget(raw.file)
  // Show chapter text with the quotes of the book, as it will be applied.
  const segment = useMemo(
    () => (target.kind === 'chapter' ? { ...raw, hunks: raw.hunks.map((h) => ({ ...h, replace: typesetForBook(h.replace) })) } : raw),
    [raw, target.kind]
  )
  const states = message?.hunks ?? {}
  const keys = segment.hunks.map((_, i) => hunkKey(segment.index, i))
  const pending = keys.filter((k) => !states[k] || states[k] === 'pending')
  const totals = useMemo(() => {
    let added = 0
    let removed = 0
    for (const h of segment.hunks) {
      if (!h.complete) continue
      const s = diffStats(wordDiff(plain(h.find), plain(h.replace)))
      added += s.added
      removed += s.removed
    }
    return { added, removed }
  }, [segment.hunks])

  const apply = (i: number): boolean => {
    if (!thread || !message) return false
    const res = applyEditHunk(segment.file, segment.hunks[i])
    setHunkState(thread, message.id, keys[i], res.ok ? 'accepted' : 'failed')
    if (!res.ok) toast(res.reason, { kind: 'error' })
    return res.ok
  }
  const offerUndo = (snap: Snapshot | null, accepted: number[], label: string): void => {
    if (!snap || !thread || !message) return
    toast(label, {
      ms: 8000,
      action: {
        label: t.common.undo,
        run: () => {
          if (!restoreSnapshot(snap)) {
            toast(t.chat.undoUnsafe, { kind: 'error' })
            return
          }
          for (const i of accepted) setHunkState(thread, message.id, keys[i], 'pending')
        }
      }
    })
  }
  const accept = (i: number): void => {
    const snap = snapshotOf(segment.file)
    if (apply(i)) {
      markAfter(snap)
      offerUndo(snap, [i], t.chat.changeApplied(target.label))
    }
  }
  const reject = (i: number): void => {
    if (thread && message) setHunkState(thread, message.id, keys[i], 'rejected')
  }
  const acceptAll = (): void => {
    setBusy(true)
    const snap = snapshotOf(segment.file)
    const accepted: number[] = []
    // Apply from the last hunk to the first, so earlier text does not move.
    for (let i = segment.hunks.length - 1; i >= 0; i--) {
      if (states[keys[i]] && states[keys[i]] !== 'pending') continue
      if (apply(i)) accepted.push(i)
    }
    setBusy(false)
    markAfter(snap)
    if (accepted.length) offerUndo(snap, accepted, t.chat.changesApplied(accepted.length, target.label))
  }

  const Icon = target.kind === 'chapter' ? BookOpenText : Notebook
  /** Take the user to the change in the chapter. Pending changes show in the text with Accept and Reject. */
  const reveal = (i: number): void => {
    if (target.kind !== 'chapter' || !thread || !message) return
    const found = revealProposal(target.chapter.id, segment.hunks[i].find, inlineProposalId(thread.id, message.id, keys[i]))
    if (!found) toast(t.chat.passageNotFound, { kind: 'error' })
  }
  const firstPending = segment.hunks.findIndex((h, i) => h.complete && pending.includes(keys[i]))
  const open = (): void => {
    if (target.kind === 'chapter') {
      if (!streaming && firstPending >= 0) reveal(firstPending)
      else useBook.getState().selectChapter(target.chapter.id)
    }
    if (target.kind === 'entry') useBook.getState().selectEntry(target.entry.id)
  }

  return (
    <motion.div className="proposal" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {/* The name and the counts on the left, the buttons on the right. When both do not fit, the buttons go to a second line. */}
      <header className="proposal-head">
        <div className="proposal-title">
          <button
            className="proposal-file"
            onClick={open}
            title={target.kind === 'chapter' && !streaming && firstPending >= 0 ? t.chat.showInTextHint : t.common.open}
          >
            <Icon size={14} />
            <span>{target.label}</span>
          </button>
          <span className="proposal-stats">
            <span className="plus">+{totals.added}</span>
            <span className="minus">−{totals.removed}</span>
          </span>
        </div>
        <div className="proposal-tools">
          <Tooltip label={split ? t.chat.inlineView : t.chat.splitView}>
            <button className="proposal-icon" onClick={() => setSplit(!split)} aria-label={t.chat.toggleView}>
              {split ? <Rows size={14} /> : <Columns size={14} />}
            </button>
          </Tooltip>
          {streaming ? (
            <Spinner size={12} />
          ) : (
            pending.length > 0 && (
              <>
                <button className="proposal-btn" onClick={() => keys.forEach((k, i) => pending.includes(k) && reject(i))}>
                  {segment.hunks.length > 1 ? t.common.rejectAll : t.common.reject}
                </button>
                <button className="proposal-btn is-accept" onClick={acceptAll} disabled={busy}>
                  <Check size={12} weight="bold" /> {segment.hunks.length > 1 ? t.common.acceptAll : t.common.accept}
                </button>
              </>
            )
          )}
        </div>
      </header>
      <div className="proposal-hunks">
        {segment.hunks.map((h, i) => {
          const st = states[keys[i]] ?? 'pending'
          return (
            <div key={i} className={clsx('hunk', `is-${st}`)}>
              <HunkView hunk={h} split={split} />
              {!streaming && h.complete && st === 'pending' && (target.kind === 'chapter' || segment.hunks.length > 1) && (
                <div className="hunk-foot">
                  {target.kind === 'chapter' && (
                    <Tooltip label={t.chat.showInTextHint}>
                      <button className="hunk-reveal" onClick={() => reveal(i)}>
                        <Crosshair size={12} /> {t.chat.showInText}
                      </button>
                    </Tooltip>
                  )}
                  <span className="proposal-spacer" />
                  {segment.hunks.length > 1 && (
                    <>
                      <Tooltip label={t.chat.rejectChange}>
                        <button className="hunk-icon" onClick={() => reject(i)} aria-label={t.chat.rejectChange}>
                          <X size={12} />
                        </button>
                      </Tooltip>
                      <Tooltip label={t.chat.acceptChange}>
                        <button className="hunk-icon is-accept" onClick={() => accept(i)} aria-label={t.chat.acceptChange}>
                          <Check size={12} weight="bold" />
                        </button>
                      </Tooltip>
                    </>
                  )}
                </div>
              )}
              {st !== 'pending' && <HunkBadge state={st} />}
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

function HunkBadge({ state }: { state: HunkState }): React.JSX.Element {
  const t = useT()
  return (
    <span className={clsx('hunk-badge', `is-${state}`)}>
      {state === 'accepted' && (
        <>
          <Check size={11} weight="bold" /> {t.chat.applied}
        </>
      )}
      {state === 'rejected' && (
        <>
          <X size={11} /> {t.chat.rejected}
        </>
      )}
      {state === 'failed' && (
        <>
          <WarningCircle size={11} /> {t.chat.notFound}
        </>
      )}
    </span>
  )
}

function CreateCard({ segment, message, thread, streaming }: Props & { segment: CreateSeg }): React.JSX.Element {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const key = hunkKey(segment.index, 0)
  const state = message?.hunks?.[key] ?? 'pending'
  const target = resolveTarget(segment.file)
  const { data, body } = readFrontmatter(segment.content)
  // A new note can have a portrait: an image of the chat.
  const portrait = useAssetUrl(typeof data.image === 'string' && data.image.startsWith('_assets/') ? data.image : null)
  const categories = useBook((s) => s.manifest?.planning.categories ?? [])
  const category = folderCategoryName(t, segment.file.replace(/^planning\//, '').split('/').slice(0, -1).join('/'), categories)
  // After the user creates the entry, it exists: the card still shows where it went.
  const exists = target.kind === 'entry' && state === 'pending'

  const create = async (): Promise<void> => {
    if (!thread || !message) return
    const res = await applyCreate(segment.file, segment.content)
    // Keep the replaced entry, so a rewind of the thread can bring it back.
    setHunkStates(thread, message.id, { [key]: res.ok ? 'accepted' : 'failed' }, res.ok && res.previous ? { [key]: res.previous } : undefined)
    if (!res.ok) toast(res.reason, { kind: 'error' })
    else toast(exists ? t.chat.entryUpdated(target.label) : t.chat.entryCreated(target.label))
  }

  return (
    <motion.div className="proposal is-create" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <header className="proposal-head">
        <div className="proposal-title">
          <span className="proposal-file">
            <FilePlus size={14} />
            <span>{target.label}</span>
          </span>
          <span className="proposal-cat">{exists ? t.chat.replacesEntry : category}</span>
        </div>
        <div className="proposal-tools">
          {streaming ? (
            <Spinner size={12} />
          ) : state === 'pending' ? (
            <>
              <button className="proposal-btn" onClick={() => thread && message && setHunkState(thread, message.id, key, 'rejected')}>
                {t.chat.dismiss}
              </button>
              <button className="proposal-btn is-accept" onClick={() => void create()}>
                <Check size={12} weight="bold" /> {exists ? t.chat.replace : t.common.create}
              </button>
            </>
          ) : (
            <HunkBadge state={state} />
          )}
        </div>
      </header>
      <div id={`create-${segment.index}`} className={clsx('proposal-body prose', !expanded && 'is-clamped')}>
        {portrait && <img className="proposal-portrait is-small" src={portrait} alt={t.chat.portraitAlt(target.label)} />}
        {typeof data.summary === 'string' && <p className="proposal-summary">{data.summary}</p>}
        {Array.isArray(data.aliases) && data.aliases.length > 0 && (
          <p className="proposal-aliases">{t.chat.aliases((data.aliases as unknown[]).map(String).join(', '))}</p>
        )}
        <ReactMarkdown>{body}</ReactMarkdown>
      </div>
      <button className="proposal-more" aria-expanded={expanded} aria-controls={`create-${segment.index}`} onClick={() => setExpanded(!expanded)}>
        {expanded ? t.chat.showLess : t.chat.showAll}
      </button>
    </motion.div>
  )
}

/** An image of the chat as the portrait of a note: the image, and Use or Dismiss. */
function PortraitCard({ segment, message, thread, streaming }: Props & { segment: PortraitSeg }): React.JSX.Element {
  const t = useT()
  const key = hunkKey(segment.index, 0)
  const state = message?.hunks?.[key] ?? 'pending'
  const target = resolveTarget(segment.file)
  const url = useAssetUrl(segment.complete ? segment.image : null)

  const use = (): void => {
    if (!thread || !message) return
    const res = applyPortrait(segment.file, segment.image)
    // Keep the image from before, so a rewind of the thread can bring it back.
    setHunkStates(thread, message.id, { [key]: res.ok ? 'accepted' : 'failed' }, res.ok ? { [key]: res.previous ?? '' } : undefined)
    if (!res.ok) toast(res.reason, { kind: 'error' })
    else toast(t.chat.portraitSet(target.label))
  }

  return (
    <motion.div className="proposal is-portrait" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <header className="proposal-head">
        <div className="proposal-title">
          <button
            className="proposal-file"
            onClick={() => target.kind === 'entry' && useBook.getState().selectEntry(target.entry.id)}
            title={t.common.open}
          >
            <UserCircle size={14} />
            <span>{target.label}</span>
          </button>
          <span className="proposal-cat">{t.chat.portrait}</span>
        </div>
        <div className="proposal-tools">
          {streaming || !segment.complete ? (
            <Spinner size={12} />
          ) : state === 'pending' ? (
            <>
              <button className="proposal-btn" onClick={() => thread && message && setHunkState(thread, message.id, key, 'rejected')}>
                {t.chat.dismiss}
              </button>
              <button className="proposal-btn is-accept" onClick={use}>
                <Check size={12} weight="bold" /> {t.chat.usePortrait}
              </button>
            </>
          ) : (
            <HunkBadge state={state} />
          )}
        </div>
      </header>
      <div className="proposal-body">{url && <img className="proposal-portrait" src={url} alt={t.chat.portraitAlt(target.label)} />}</div>
    </motion.div>
  )
}

/**
 * The proposal of a message for the story line: one card for the whole message (the AI can write
 * the change in several parts), the count of its changes, "Show in the line", and the decision.
 */
function LineCard({ segment, message, thread, streaming }: Props & { segment: LineSegment }): React.JSX.Element | null {
  const t = useT()
  const entries = useBook((s) => s.entries)
  useBook((s) => s.chapters)
  const story = findStoryLine(entries)
  const parts = useMemo(() => (message ? parseProposals(message.content).filter((s): s is LineSegment => isLineSegment(s)) : [segment]), [message, segment])
  const first = parts[0]?.index === segment.index
  const state: HunkState = message ? lineStateOf(message, parts.length ? parts : [segment]) : 'pending'
  const p = thread && message && !streaming && segment.complete && state === 'pending' ? messageLineProposal(thread, message, story ? story.body : null) : null
  if (!first) return null
  const show = (): void => {
    if (thread) useChat.getState().setActiveThread(thread.id)
    openLine()
  }
  return (
    <motion.div className="proposal is-line" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <header className="proposal-head">
        <div className="proposal-title">
          <button className="proposal-file" onClick={show} title={t.plan.line.showInLine}>
            <Path size={14} />
            <span>{t.plan.line.title}</span>
          </button>
          {p && p.after !== null && <span className="proposal-cat">{t.plan.line.changes(p.changes.length)}</span>}
        </div>
        <div className="proposal-tools">{streaming || !segment.complete ? <Spinner size={12} /> : !p && <HunkBadge state={state} />}</div>
      </header>
      {/* The decision has its own line: the panel of the chat is narrow. */}
      {p && (
        <div className="proposal-line">
          {p.after === null ? (
            <span className="proposal-line-stale">{t.plan.line.reviewStale}</span>
          ) : (
            <button className="hunk-reveal" onClick={show}>
              <Crosshair size={12} /> {t.plan.line.showInLine}
            </button>
          )}
          <span className="proposal-spacer" />
          <button className="proposal-btn" onClick={() => rejectLineProposal(p)}>
            {t.plan.line.rejectAll}
          </button>
          {p.after !== null && (
            <button className="proposal-btn is-accept" onClick={() => void acceptLineProposal(p)}>
              <Check size={12} weight="bold" /> {t.plan.line.applyAll}
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}

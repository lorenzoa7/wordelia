import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { BookOpenText, Check, Columns, FilePlus, Notebook, Rows, WarningCircle, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import { markdownToPlain } from '@shared/book'
import { readFrontmatter } from '@shared/markdown/frontmatter'
import { hunkKey, type Hunk, type Segment } from '@shared/proposals/parse'
import { wordDiff, diffStats, type DiffOp } from '@shared/text/diff'
import type { ChatMessage, HunkState, Thread } from '@shared/types'
import { Spinner, Tooltip } from '@/ui'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { applyCreate, applyEditHunk, markAfter, resolveTarget, restoreSnapshot, snapshotOf, type Snapshot } from './applyProposal'

type EditSeg = Extract<Segment, { kind: 'edit' }>
type CreateSeg = Extract<Segment, { kind: 'create' }>

interface Props {
  segment: EditSeg | CreateSeg
  message?: ChatMessage
  thread?: Thread
  streaming?: boolean
}

function setHunkState(thread: Thread, messageId: string, key: string, state: HunkState): void {
  const latest = useBook.getState().threads.find((t) => t.id === thread.id) ?? thread
  const messages = latest.messages.map((m) => (m.id === messageId ? { ...m, hunks: { ...(m.hunks ?? {}), [key]: state } } : m))
  useBook.getState().saveThread({ ...latest, messages })
}

export function ProposalCard(props: Props): React.JSX.Element {
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

function EditCard({ segment, message, thread, streaming }: Props & { segment: EditSeg }): React.JSX.Element {
  const [split, setSplit] = useState(false)
  const [busy, setBusy] = useState(false)
  const target = resolveTarget(segment.file)
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
        label: 'Undo',
        run: () => {
          if (!restoreSnapshot(snap)) {
            toast('The text changed after the AI change, so Undo could stop your new words. Use Ctrl+Z or the version history.', { kind: 'error' })
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
      offerUndo(snap, [i], `Change applied to “${target.label}”.`)
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
    if (accepted.length) offerUndo(snap, accepted, `${accepted.length} change${accepted.length > 1 ? 's' : ''} applied to “${target.label}”.`)
  }

  const Icon = target.kind === 'chapter' ? BookOpenText : Notebook
  const open = (): void => {
    if (target.kind === 'chapter') useBook.getState().selectChapter(target.chapter.id)
    if (target.kind === 'entry') useBook.getState().selectEntry(target.entry.id)
  }

  return (
    <motion.div className="proposal" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <header className="proposal-head">
        <button className="proposal-file" onClick={open} title="Open">
          <Icon size={14} />
          <span>{target.label}</span>
        </button>
        <span className="proposal-stats">
          <span className="plus">+{totals.added}</span>
          <span className="minus">−{totals.removed}</span>
        </span>
        <span className="proposal-spacer" />
        <Tooltip label={split ? 'Inline view' : 'Split view'}>
          <button className="proposal-icon" onClick={() => setSplit(!split)} aria-label="Toggle diff view">
            {split ? <Rows size={14} /> : <Columns size={14} />}
          </button>
        </Tooltip>
        {streaming ? (
          <Spinner size={12} />
        ) : (
          pending.length > 0 && (
            <>
              <button className="proposal-btn" onClick={() => keys.forEach((k, i) => pending.includes(k) && reject(i))}>
                {segment.hunks.length > 1 ? 'Reject all' : 'Reject'}
              </button>
              <button className="proposal-btn is-accept" onClick={acceptAll} disabled={busy}>
                <Check size={12} weight="bold" /> Accept{segment.hunks.length > 1 ? ' all' : ''}
              </button>
            </>
          )
        )}
      </header>
      <div className="proposal-hunks">
        {segment.hunks.map((h, i) => {
          const st = states[keys[i]] ?? 'pending'
          return (
            <div key={i} className={clsx('hunk', `is-${st}`)}>
              <HunkView hunk={h} split={split} />
              {!streaming && h.complete && segment.hunks.length > 1 && st === 'pending' && (
                <div className="hunk-actions">
                  <button onClick={() => reject(i)} aria-label="Reject change">
                    <X size={12} />
                  </button>
                  <button className="is-accept" onClick={() => accept(i)} aria-label="Accept change">
                    <Check size={12} weight="bold" />
                  </button>
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
  return (
    <span className={clsx('hunk-badge', `is-${state}`)}>
      {state === 'accepted' && (
        <>
          <Check size={11} weight="bold" /> Applied
        </>
      )}
      {state === 'rejected' && (
        <>
          <X size={11} /> Rejected
        </>
      )}
      {state === 'failed' && (
        <>
          <WarningCircle size={11} /> Not found
        </>
      )}
    </span>
  )
}

function CreateCard({ segment, message, thread, streaming }: Props & { segment: CreateSeg }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const key = hunkKey(segment.index, 0)
  const state = message?.hunks?.[key] ?? 'pending'
  const target = resolveTarget(segment.file)
  const { data, body } = readFrontmatter(segment.content)
  const category = segment.file.replace(/^planning\//, '').split('/').slice(0, -1).join('/')
  const exists = target.kind === 'entry'

  const create = async (): Promise<void> => {
    if (!thread || !message) return
    const res = await applyCreate(segment.file, segment.content)
    setHunkState(thread, message.id, key, res.ok ? 'accepted' : 'failed')
    if (!res.ok) toast(res.reason, { kind: 'error' })
    else toast(`${exists ? 'Updated' : 'Created'} “${target.label}” in the planning.`)
  }

  return (
    <motion.div className="proposal is-create" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <header className="proposal-head">
        <span className="proposal-file">
          <FilePlus size={14} />
          <span>{target.label}</span>
        </span>
        <span className="proposal-cat">{exists ? 'replaces the entry' : category}</span>
        <span className="proposal-spacer" />
        {streaming ? (
          <Spinner size={12} />
        ) : state === 'pending' ? (
          <>
            <button className="proposal-btn" onClick={() => thread && message && setHunkState(thread, message.id, key, 'rejected')}>
              Dismiss
            </button>
            <button className="proposal-btn is-accept" onClick={() => void create()}>
              <Check size={12} weight="bold" /> {exists ? 'Replace' : 'Create'}
            </button>
          </>
        ) : (
          <HunkBadge state={state} />
        )}
      </header>
      <div id={`create-${segment.index}`} className={clsx('proposal-body prose', !expanded && 'is-clamped')}>
        {typeof data.summary === 'string' && <p className="proposal-summary">{data.summary}</p>}
        {Array.isArray(data.aliases) && data.aliases.length > 0 && (
          <p className="proposal-aliases">Also: {(data.aliases as unknown[]).map(String).join(', ')}</p>
        )}
        <ReactMarkdown>{body}</ReactMarkdown>
      </div>
      <button className="proposal-more" aria-expanded={expanded} aria-controls={`create-${segment.index}`} onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Show less' : 'Show all'}
      </button>
    </motion.div>
  )
}

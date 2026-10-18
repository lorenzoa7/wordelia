// The planning sync in the Plan view: the sync button with its progress, the card with the result,
// and "Build the planning from the manuscript". The job itself is in sync.ts.

import { useMemo, useState } from 'react'
import { ArrowsClockwise, CheckCircle, ListChecks, WarningCircle, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { Button, IconButton, Spinner, Tooltip } from '@/ui'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import {
  SYNC_THREAD_ID,
  acceptAllSync,
  cancelPlanningSync,
  changedChapters,
  dismissSyncResult,
  rejectAllSync,
  reviewSync,
  startPlanningSync,
  syncResult,
  useSyncJob
} from './sync'

const NO_IDS: string[] = []

/** The sync button. While the sync runs: its progress and Cancel. */
export function SyncButton(): React.JSX.Element {
  const t = useT()
  const chapters = useBook((s) => s.chapters)
  const syncState = useBook((s) => s.syncState)
  const job = useSyncJob()
  const pending = useMemo(() => changedChapters().length, [chapters, syncState]) // eslint-disable-line react-hooks/exhaustive-deps

  if (job.state === 'running') {
    const step = job.writing ? t.plan.sync.writing(job.found) : t.plan.sync.reading(job.chapters)
    return (
      <div className="sync-btn is-running" role="status">
        <span className="sync-spin" aria-hidden>
          <Spinner size={14} />
        </span>
        <span className="sync-text">
          <span className="sync-label">{t.plan.sync.syncing}</span>
          <span className="sync-progress" data-step={job.writing ? 'writing' : 'reading'} data-found={job.found}>
            {job.parts > 1 ? `${t.plan.sync.part(job.part, job.parts)} · ${step}` : step}
          </span>
        </span>
        <IconButton className="sync-cancel" label={t.plan.sync.cancel} side="right" onClick={cancelPlanningSync}>
          <X size={13} />
        </IconButton>
      </div>
    )
  }

  // Nothing to read: the button looks off and says why. It stays focusable, so its tooltip shows.
  const upToDate = pending === 0
  return (
    <Tooltip
      side="right"
      label={
        <span className="sync-tip">
          <span>{t.plan.sidebar.updateNotesHint}</span>
          <b>{upToDate ? t.plan.sidebar.upToDate : t.plan.sidebar.changedChapters(pending)}</b>
        </span>
      }
    >
      <button
        className={clsx('sync-btn', pending > 0 && 'has-pending')}
        aria-label={t.plan.sidebar.sync}
        aria-disabled={upToDate || undefined}
        onClick={() => !upToDate && void startPlanningSync()}
      >
        <ArrowsClockwise size={15} />
        <span className="sync-text">
          <span className="sync-label">{t.plan.sidebar.sync}</span>
        </span>
        {pending > 0 && <span className="sync-count">{pending}</span>}
      </button>
    </Tooltip>
  )
}

/** The result of the last sync, where the author started it: the changes, or the error. */
export function SyncResultCard(): React.JSX.Element | null {
  const t = useT()
  const job = useSyncJob()
  const thread = useBook((s) => s.threads.find((th) => th.id === SYNC_THREAD_ID))
  const ids = job.state === 'done' || job.state === 'failed' ? job.messageIds : NO_IDS
  const result = useMemo(() => syncResult(thread, ids), [thread, ids])
  const [busy, setBusy] = useState(false)

  if (job.state !== 'done' && job.state !== 'failed') return null
  const failed = job.state === 'failed'
  // The author decided every change (here or in the chat): nothing to show. Undo brings the card back.
  if (!failed && result.total > 0 && result.pending === 0) return null

  const title = failed ? t.plan.sync.failed : result.pending ? t.plan.sync.proposed(result.pending) : t.plan.sync.noChanges
  const acceptAll = async (): Promise<void> => {
    setBusy(true)
    try {
      await acceptAllSync(ids)
    } finally {
      setBusy(false)
    }
  }
  const retry = (): void => {
    if (job.state !== 'failed') return
    if (job.settings) useUi.getState().openSettings('ai')
    else void startPlanningSync({ bootstrap: job.bootstrap })
  }

  return (
    <section className={clsx('sync-card', failed && 'is-error', !failed && !result.pending && 'is-quiet')} aria-label={t.plan.sync.result} role="status">
      <div className="sync-card-head">
        <span className="sync-card-icon" aria-hidden>
          {failed ? <WarningCircle size={15} /> : result.pending ? <ListChecks size={15} /> : <CheckCircle size={15} />}
        </span>
        <span className="sync-card-title">{title}</span>
        <IconButton className="sync-card-close" label={t.common.close} side="right" onClick={dismissSyncResult}>
          <X size={12} />
        </IconButton>
      </div>
      {failed && <p className="sync-card-text">{job.error}</p>}
      {result.pending > 0 && <p className="sync-card-notes">{result.notes.join(' · ')}</p>}
      {result.pending > 0 && (
        <div className="sync-card-actions">
          <Tooltip label={t.plan.sync.reviewHint} side="right">
            <Button size="sm" variant="primary" className="sync-review" onClick={reviewSync}>
              {t.plan.sync.review}
            </Button>
          </Tooltip>
          <div className="sync-card-bulk">
            <Button size="sm" className="sync-accept-all" disabled={busy} icon={busy ? <Spinner size={12} /> : undefined} onClick={() => void acceptAll()}>
              {t.common.acceptAll}
            </Button>
            <Button size="sm" variant="ghost" className="sync-reject-all" disabled={busy} onClick={() => rejectAllSync(ids)}>
              {t.common.rejectAll}
            </Button>
          </div>
        </div>
      )}
      {failed && (
        <div className="sync-card-actions">
          <Button size="sm" className="sync-retry" onClick={retry}>
            {job.settings ? t.plan.sync.openSettings : t.common.retry}
          </Button>
        </div>
      )}
    </section>
  )
}

/** "Build the planning from the manuscript": a sync of all chapters. While a sync runs, it waits. */
export function BuildPlanningButton(): React.JSX.Element {
  const t = useT()
  const running = useSyncJob((s) => s.state === 'running')
  return (
    <Button variant="ribbon" disabled={running} icon={running ? <Spinner size={13} /> : undefined} onClick={() => void startPlanningSync({ bootstrap: true })}>
      {running ? t.plan.sync.syncing : t.plan.overview.buildFromManuscript}
    </Button>
  )
}

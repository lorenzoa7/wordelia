import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ArrowSquareOut, CaretDown, CheckCircle, Globe, Key, SignIn, Terminal } from '@phosphor-icons/react'
import clsx from 'clsx'
import { installPage } from '@shared/ai/install'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import type { ProviderId } from '@shared/types'
import { Button, Menu, MenuItem, Spinner } from '@/ui'
import { Logo } from '@/app/Logo'
import { invoke } from '@/lib/api'
import { LOCALES, useT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { toast, useUi } from '@/stores/ui'
import './welcome.css'

const CLI: ProviderId[] = ['claude-code', 'codex']
const LOGIN_CMD: Record<string, string> = { 'claude-code': 'claude auth login', codex: 'codex login' }
/** How often a row looks again for its program while the writer installs it or logs in */
const POLL_MS = 4000

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
/** A stable ref callback: React calls it when the element mounts, not on each render. */
const focusOnMount = (el: HTMLElement | null): void => el?.focus()

/** First run: a short welcome, then connect an AI. */
export function Welcome(): React.JSX.Element | null {
  const t = useT()
  const onboarded = useApp((s) => s.settings?.onboarded ?? true)
  const update = useApp((s) => s.updateSettings)
  const [step, setStep] = useState(0)
  const card = useRef<HTMLDivElement>(null)

  const finish = (): void => void update({ onboarded: true })

  // A modal dialog: Tab stays in it, and Esc closes it (like Skip and Later).
  useEffect(() => {
    if (onboarded) return
    const onKey = (e: KeyboardEvent): void => {
      const box = card.current
      if (!box) return
      // An open menu (the language picker) closes first: it marks the key as handled.
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        void useApp.getState().updateSettings({ onboarded: true })
        return
      }
      if (e.key !== 'Tab') return
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const inside = box.contains(document.activeElement)
      if (e.shiftKey && (!inside || document.activeElement === items[0])) {
        e.preventDefault()
        items[items.length - 1].focus()
      } else if (!e.shiftKey && (!inside || document.activeElement === items[items.length - 1])) {
        e.preventDefault()
        items[0].focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onboarded])

  if (onboarded) return null

  const start = (): void => {
    finish()
    void useApp.getState().autoRoute()
    // No book yet: "Start writing" starts the first book.
    if (!useApp.getState().library.length) useUi.getState().setNewBookOpen(true)
  }

  return (
    <div className="welcome-backdrop">
      <motion.div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={t.onboarding.dialog}
        className="welcome grain" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
        <LanguagePicker />
        <AnimatePresence mode="wait">
          {step === 0 ? (
            <motion.div key="hello" className="welcome-step" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <Logo height={40} blink />
              <h1 className="welcome-title">{t.onboarding.title}</h1>
              <div className="welcome-points">
                <p>
                  <b>{t.onboarding.youWrite}</b> {t.onboarding.youWriteText}
                </p>
                <p>
                  <b>{t.onboarding.aiEdits}</b> {t.onboarding.aiEditsBefore} <kbd className="kbd">Ctrl+J</kbd>
                  {t.onboarding.aiEditsAfter}
                </p>
                <p>
                  <b>{t.onboarding.aiRemembers}</b> {t.onboarding.aiRemembersText}
                </p>
              </div>
              <div className="welcome-actions">
                <Button variant="ghost" onClick={finish}>
                  {t.onboarding.skip}
                </Button>
                <Button variant="ribbon" autoFocus onClick={() => setStep(1)}>
                  {t.onboarding.connectAi} <ArrowRight size={14} />
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="connect" className="welcome-step" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              {/* The focus moves to the title of the step, so Tab goes on from here. */}
              <h2 className="welcome-h2" tabIndex={-1} ref={focusOnMount}>
                {t.onboarding.connectTitle}
              </h2>
              <p className="welcome-sub">{t.onboarding.connectSub}</p>
              <div className="welcome-providers">
                {CLI.map((p) => (
                  <CliRow key={p} id={p} />
                ))}
                <button
                  className="welcome-api"
                  onClick={() => {
                    finish()
                    useUi.getState().openSettings('ai')
                  }}
                >
                  <Key size={16} /> {t.onboarding.apiKey}
                  <ArrowRight size={13} />
                </button>
              </div>
              <div className="welcome-actions">
                <Button variant="ghost" onClick={finish}>
                  {t.onboarding.later}
                </Button>
                <Button variant="primary" onClick={start}>
                  {t.onboarding.start}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function CliRow({ id }: { id: ProviderId }): React.JSX.Element {
  const t = useT()
  const status = useApp((s) => s.status[id])
  const checking = useApp((s) => s.checking[id])
  const check = useApp((s) => s.checkProvider)
  /** The writer opened the install page or the login window: look again every few seconds. */
  const [waiting, setWaiting] = useState<'install' | 'login' | null>(null)

  const ok = status?.installed && status.loggedIn !== false

  // Look for the program again: every few seconds while the writer installs it or logs in, and when the
  // window gets the focus back (the writer comes back from the browser or the terminal). A light status
  // call first; the full check (with the models) only when something changed.
  useEffect(() => {
    if (ok) return
    let busy = false
    const look = async (): Promise<void> => {
      if (busy) return
      busy = true
      try {
        const now = await invoke('ai:status', id)
        const was = useApp.getState().status[id]
        if (now.installed === was?.installed && now.loggedIn === was?.loggedIn) return
        const st = await check(id)
        if (st.installed && st.loggedIn !== false) {
          setWaiting(null)
          void useApp.getState().autoRoute()
        } else if (st.installed && waiting === 'install') {
          setWaiting(null)
        }
      } finally {
        busy = false
      }
    }
    const timer = waiting ? setInterval(() => void look(), POLL_MS) : undefined
    const onFocus = (): void => void look()
    window.addEventListener('focus', onFocus)
    return () => {
      if (timer) clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [ok, waiting, id, check])

  const copy = (text: string): void => {
    navigator.clipboard.writeText(text).then(
      () => toast(t.onboarding.copied),
      () => toast(t.onboarding.runInTerminal(text))
    )
  }

  return (
    <div className={clsx('welcome-row', ok && 'is-ok')}>
      <span className="welcome-row-icon">
        <Terminal size={16} />
      </span>
      <div className="welcome-row-main">
        <strong>{PROVIDER_LABELS[id].name}</strong>
        <span>{t.common.providerKind[id]}</span>
        {status && !status.installed && (
          <span className="welcome-hint">{waiting === 'install' ? t.onboarding.installWaiting : t.onboarding.notInstalled}</span>
        )}
        {status?.installed && status.loggedIn === false && (
          <span className="welcome-hint">{status.reason === 'expired' ? t.onboarding.expired : t.onboarding.notLoggedIn}</span>
        )}
        {ok && <span className="welcome-hint">{t.onboarding.found(status?.account)}</span>}
      </div>
      <div className="welcome-row-state">
        {checking && !status ? (
          <Spinner />
        ) : ok ? (
          <span className="state-ok">
            <CheckCircle size={15} weight="fill" /> {t.onboarding.connected}
          </span>
        ) : status?.installed ? (
          <Button
            size="sm"
            icon={waiting === 'login' ? <Spinner size={12} /> : <SignIn size={13} />}
            onClick={() =>
              void invoke('ai:openLogin', id).then((opened) => {
                if (opened) setWaiting('login')
                else copy(LOGIN_CMD[id])
              })
            }
          >
            {waiting === 'login' ? t.onboarding.waiting : t.onboarding.logIn}
          </Button>
        ) : status ? (
          <Button
            size="sm"
            variant="primary"
            icon={waiting === 'install' ? <Spinner size={12} /> : <ArrowSquareOut size={13} />}
            onClick={() => {
              void invoke('window:openExternal', installPage(id, window.wordelia?.platform ?? '') ?? '')
              setWaiting('install')
            }}
          >
            {waiting === 'install' ? t.onboarding.waiting : t.onboarding.install}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** A small picker for the interface language, in the corner of the welcome card. */
function LanguagePicker(): React.JSX.Element {
  const t = useT()
  const language = useApp((s) => s.settings?.language ?? 'en')
  const current = LOCALES.find((l) => l.id === language) ?? LOCALES[0]
  return (
    <div className="welcome-lang">
      <Menu
        align="end"
        trigger={
          <button className="welcome-lang-btn" aria-label={`${t.onboarding.language}: ${current.label}`}>
            <Globe size={13} />
            <span>{current.label}</span>
            <CaretDown size={10} />
          </button>
        }
      >
        {LOCALES.map((l) => (
          <MenuItem key={l.id} checked={l.id === language} onSelect={() => void useApp.getState().updateSettings({ language: l.id })}>
            <span lang={l.id}>{l.label}</span>
          </MenuItem>
        ))}
      </Menu>
    </div>
  )
}

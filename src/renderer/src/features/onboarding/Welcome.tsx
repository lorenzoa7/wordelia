import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CheckCircle, Copy, Key, SignIn, Terminal, WarningCircle } from '@phosphor-icons/react'
import clsx from 'clsx'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import type { ProviderId } from '@shared/types'
import { Button, Spinner } from '@/ui'
import { Logo } from '@/app/Logo'
import { invoke } from '@/lib/api'
import { useApp } from '@/stores/app'
import { toast, useUi } from '@/stores/ui'
import './welcome.css'

const CLI: ProviderId[] = ['claude-code', 'codex']
const LOGIN_CMD: Record<string, string> = { 'claude-code': 'claude auth login', codex: 'codex login' }
const INSTALL: Record<string, { cmd: string; url: string }> = {
  'claude-code': { cmd: 'npm install -g @anthropic-ai/claude-code', url: 'https://claude.com/claude-code' },
  codex: { cmd: 'npm install -g @openai/codex', url: 'https://developers.openai.com/codex' }
}

/** First run: a short welcome, then connect an AI. */
export function Welcome(): React.JSX.Element | null {
  const onboarded = useApp((s) => s.settings?.onboarded ?? true)
  const update = useApp((s) => s.updateSettings)
  const [step, setStep] = useState(0)
  if (onboarded) return null
  const finish = (): void => void update({ onboarded: true })

  return (
    <div className="welcome-backdrop">
      <motion.div className="welcome grain" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
        <AnimatePresence mode="wait">
          {step === 0 ? (
            <motion.div key="hello" className="welcome-step" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <Logo height={40} blink />
              <h1 className="welcome-title">A quiet desk for your book.</h1>
              <div className="welcome-points">
                <p>
                  <b>You write.</b> Wordelia gives you a calm page with real book typography.
                </p>
                <p>
                  <b>The AI edits.</b> Select a passage and press <kbd className="kbd">Ctrl+J</kbd>. The AI polishes it with your rules, and you see every change before you accept it.
                </p>
                <p>
                  <b>The AI remembers.</b> It reads the whole book, the planning of your story, and your other conversations.
                </p>
              </div>
              <div className="welcome-actions">
                <Button variant="ghost" onClick={finish}>
                  Skip
                </Button>
                <Button variant="ribbon" onClick={() => setStep(1)}>
                  Connect an AI <ArrowRight size={14} />
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="connect" className="welcome-step" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <h2 className="welcome-h2">Connect the AI you already pay for</h2>
              <p className="welcome-sub">Wordelia is free. It runs your own Claude Code or Codex program, or uses an API key.</p>
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
                  <Key size={16} /> I have an API key (Anthropic or OpenAI)
                  <ArrowRight size={13} />
                </button>
              </div>
              <div className="welcome-actions">
                <Button variant="ghost" onClick={finish}>
                  Later
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    finish()
                    void useApp.getState().autoRoute()
                  }}
                >
                  Start writing
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
  const status = useApp((s) => s.status[id])
  const checking = useApp((s) => s.checking[id])
  const check = useApp((s) => s.checkProvider)
  const [waiting, setWaiting] = useState(false)

  // After the login window opens, check again every few seconds.
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => {
      void check(id).then((st) => {
        if (st.loggedIn) {
          setWaiting(false)
          void useApp.getState().autoRoute()
        }
      })
    }, 4000)
    return () => clearInterval(t)
  }, [waiting, id, check])

  const ok = status?.installed && status.loggedIn !== false
  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text)
    toast('Copied.')
  }

  return (
    <div className={clsx('welcome-row', ok && 'is-ok')}>
      <span className="welcome-row-icon">
        <Terminal size={16} />
      </span>
      <div className="welcome-row-main">
        <strong>{PROVIDER_LABELS[id].name}</strong>
        <span>{PROVIDER_LABELS[id].kind}</span>
        {status && !status.installed && (
          <span className="welcome-hint">
            Not installed. In a terminal, run{' '}
            <button className="cmd-chip" onClick={() => copy(INSTALL[id].cmd)}>
              {INSTALL[id].cmd} <Copy size={11} />
            </button>
          </span>
        )}
        {status?.installed && status.loggedIn === false && (
          <span className="welcome-hint">Installed, but not logged in.</span>
        )}
      </div>
      <div className="welcome-row-state">
        {checking && !status ? (
          <Spinner />
        ) : ok ? (
          <span className="state-ok">
            <CheckCircle size={15} weight="fill" /> Ready
          </span>
        ) : status?.installed ? (
          <Button
            size="sm"
            icon={waiting ? <Spinner size={12} /> : <SignIn size={13} />}
            onClick={() =>
              void invoke('ai:openLogin', id).then((opened) => {
                if (opened) setWaiting(true)
                else copy(LOGIN_CMD[id])
              })
            }
          >
            {waiting ? 'Waiting…' : 'Log in'}
          </Button>
        ) : (
          <span className="state-bad">
            <WarningCircle size={15} weight="fill" />
          </span>
        )}
      </div>
    </div>
  )
}

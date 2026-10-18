import clsx from 'clsx'
import { Moon, Sun, Desktop } from '@phosphor-icons/react'
import type { Locale, ThemeSetting } from '@shared/types'
import { useEffect, useState } from 'react'
import { Button, Field, NumberInput, Select, Switch } from '@/ui'
import { invoke } from '@/lib/api'
import { checkForUpdate, installUpdate, useUpdate } from '@/lib/update'
import { useApp } from '@/stores/app'
import { useUi } from '@/stores/ui'
import { LOCALES, actionName, useT } from '@/lib/i18n'
import { typewriterSound } from '@/features/editor/typewriter-sound'
import { ZOOM_STEPS } from '@/features/editor/zoom'
import { DIFF_VIEWS, setDiffView, type DiffView } from '@/features/editor/diffView'
import { useAllActions } from '@/features/actions/allActions'

const THEMES: Array<{ id: ThemeSetting; icon: React.ReactNode }> = [
  { id: 'light', icon: <Sun size={16} /> },
  { id: 'dark', icon: <Moon size={16} /> },
  { id: 'system', icon: <Desktop size={16} /> }
]

/** The highest daily goal, in words */
const MAX_GOAL = 100000

/** The zoom choices, with the current zoom also when it is not a step (an old setting). */
function zoomOptions(zoom: number): Array<{ value: string; label: string }> {
  const steps = ZOOM_STEPS.includes(zoom) ? ZOOM_STEPS : [...ZOOM_STEPS, zoom].sort((a, b) => a - b)
  return steps.map((z) => ({ value: String(z), label: `${Math.round(z * 100)}%` }))
}

export function GeneralTab(): React.JSX.Element | null {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const setUi = useApp((s) => s.setUi)
  // The actions of the open book too, with the shortcuts that work in it.
  const actions = useAllActions()
  const t = useT()
  if (!settings) return null
  const g = t.settings.general
  return (
    <div>
      <h3 className="settings-h">{g.language}</h3>
      <Field label={g.interfaceLanguage} hint={g.languageHint}>
        <Select
          value={settings.language}
          onValueChange={(v) => void update({ language: v as Locale })}
          options={LOCALES.map((l) => ({ value: l.id, label: l.label }))}
          ariaLabel={g.interfaceLanguage}
        />
      </Field>

      <h3 className="settings-h">{g.theme}</h3>
      <div className="theme-picker">
        {THEMES.map((th) => (
          <button key={th.id} aria-pressed={settings.theme === th.id} className={clsx('theme-card', `theme-${th.id}`, settings.theme === th.id && 'is-active')} onClick={() => void update({ theme: th.id })}>
            <span className="theme-swatch">
              <span className="theme-page" />
            </span>
            <span className="theme-label">
              {th.icon} {g.themes[th.id]}
            </span>
          </button>
        ))}
      </div>

      <h3 className="settings-h">{g.writing}</h3>
      <Field label={g.pageZoom} inline>
        <Select
          value={String(settings.ui.zoom)}
          onValueChange={(v) => setUi({ zoom: Number(v) })}
          options={zoomOptions(settings.ui.zoom)}
          ariaLabel={g.pageZoom}
        />
      </Field>
      <Field label={g.dailyGoal} hint={g.goalHint} inline>
        <NumberInput
          value={settings.editor.dailyGoal ?? 0}
          onCommit={(v) => void update({ editor: { ...settings.editor, dailyGoal: v } })}
          min={0}
          max={MAX_GOAL}
          step={50}
          unit={g.goalUnit}
        />
      </Field>
      <Field label={g.spellcheck} inline>
        <Switch checked={settings.editor.spellcheck} onCheckedChange={(v) => void update({ editor: { ...settings.editor, spellcheck: v } })} />
      </Field>
      <Field label={g.focusMode} inline>
        <Switch checked={settings.ui.focusMode} onCheckedChange={(v) => setUi({ focusMode: v })} />
      </Field>
      <Field label={g.typewriterSounds} inline>
        <Switch
          checked={settings.editor.typewriterSounds}
          onCheckedChange={(v) => {
            void update({ editor: { ...settings.editor, typewriterSounds: v } })
            if (v) typewriterSound('bell')
          }}
        />
      </Field>
      <Field label={g.typewriterScrolling} hint={g.typewriterHint} inline>
        <Switch checked={settings.ui.typewriterScroll} onCheckedChange={(v) => setUi({ typewriterScroll: v })} />
      </Field>
      <Field label={g.diffView} hint={g.diffViewHint} inline>
        <Select
          value={settings.editor.diffView ?? 'words'}
          onValueChange={(v) => setDiffView(v as DiffView)}
          options={DIFF_VIEWS.map((v) => ({ value: v, label: t.editor.review.views[v] }))}
          ariaLabel={g.diffView}
        />
      </Field>

      <UpdatesSection />

      <h3 className="settings-h">{g.keyboard}</h3>
      <dl className="shortcuts">
        {[
          ...actions.filter((a) => a.shortcut).map((a) => [actionName(t, a), a.shortcut!]),
          [g.shortcuts.acceptReject, 'Enter / Esc'],
          [g.shortcuts.dialogueDash, '--'],
          [g.shortcuts.sceneBreak, 'Ctrl+Shift+Enter'],
          [g.shortcuts.findReplace, 'Ctrl+F / Ctrl+H'],
          [g.shortcuts.toggleChat, 'Ctrl+L'],
          [g.shortcuts.toggleSidebar, 'Ctrl+\\'],
          [g.shortcuts.writePlan, 'Ctrl+1 / Ctrl+2'],
          [g.shortcuts.zoomInOut, 'Ctrl+= / Ctrl+-'],
          [g.shortcuts.zoomReset, 'Ctrl+0'],
          [t.common.export, 'Ctrl+Shift+E'],
          [t.common.settings, 'Ctrl+,']
        ].map(([label, key], i) => (
          <div key={`${i}-${label}`} className="shortcut-row">
            <dt>{label}</dt>
            <dd>
              <kbd className="kbd">{key}</kbd>
            </dd>
          </div>
        ))}
      </dl>
      <p className="shortcuts-hint">
        <button className="link-btn" onClick={() => useUi.getState().openSettings('actions')}>
          {g.actionKeysHint}
        </button>
      </p>
    </div>
  )
}

function UpdatesSection(): React.JSX.Element | null {
  const t = useT()
  const g = t.settings.general
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const u = useUpdate()
  const [version, setVersion] = useState('')
  useEffect(() => {
    void invoke('app:version').then(setVersion)
  }, [])
  if (!settings) return null
  const st = g.updateStates
  const line =
    u.state === 'downloading'
      ? st.downloading(u.version, u.percent)
      : u.state === 'ready'
        ? st.ready(u.version)
        : u.state === 'error'
          ? st.error(u.message)
          : st[u.state]
  return (
    <>
      <h3 className="settings-h">{g.updates}</h3>
      <Field label={g.autoUpdate} hint={g.autoUpdateHint} inline>
        <Switch checked={settings.autoUpdate} onCheckedChange={(v) => void update({ autoUpdate: v })} />
      </Field>
      <div className="update-row">
        <span className="update-version">{version ? g.version(version) : ''}</span>
        <span className={clsx('update-line', u.state === 'error' && 'is-error')} role="status" aria-live="polite">
          {line}
        </span>
        {u.state === 'ready' ? (
          <Button size="sm" variant="primary" onClick={installUpdate}>
            {g.restartToUpdate}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void checkForUpdate()} disabled={u.state === 'off' || u.state === 'checking' || u.state === 'downloading'}>
            {g.checkNow}
          </Button>
        )}
      </div>
    </>
  )
}

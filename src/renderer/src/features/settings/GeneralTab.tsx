import clsx from 'clsx'
import { Moon, Sun, Desktop } from '@phosphor-icons/react'
import type { Locale, ThemeSetting } from '@shared/types'
import { Field, Select, Switch } from '@/ui'
import { useApp } from '@/stores/app'
import { LOCALES, useT } from '@/lib/i18n'
import { typewriterSound } from '@/features/editor/typewriter-sound'

const THEMES: Array<{ id: ThemeSetting; icon: React.ReactNode }> = [
  { id: 'light', icon: <Sun size={16} /> },
  { id: 'dark', icon: <Moon size={16} /> },
  { id: 'system', icon: <Desktop size={16} /> }
]

export function GeneralTab(): React.JSX.Element | null {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const setUi = useApp((s) => s.setUi)
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
          options={[0.9, 1, 1.1, 1.2, 1.35].map((z) => ({ value: String(z), label: `${Math.round(z * 100)}%` }))}
          ariaLabel={g.pageZoom}
        />
      </Field>
      <Field label={g.dailyGoal} inline>
        <Select
          value={String(settings.editor.dailyGoal ?? 0)}
          onValueChange={(v) => void update({ editor: { ...settings.editor, dailyGoal: Number(v) } })}
          options={[0, 250, 500, 750, 1000, 1500, 2000].map((n) => ({ value: String(n), label: n ? g.goalWords(n) : g.goalOff }))}
          ariaLabel={g.dailyGoalAria}
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
      <Field label={g.typewriterScrolling} inline>
        <Switch checked={settings.ui.typewriterScroll} onCheckedChange={(v) => setUi({ typewriterScroll: v })} />
      </Field>

      <h3 className="settings-h">{g.keyboard}</h3>
      <dl className="shortcuts">
        {[
          [g.shortcuts.polish, 'Ctrl+J'],
          [g.shortcuts.otherActions, 'Alt+1 … 9'],
          [g.shortcuts.acceptReject, 'Enter / Esc'],
          [g.shortcuts.dialogueDash, '--'],
          [g.shortcuts.sceneBreak, 'Ctrl+Shift+Enter'],
          [g.shortcuts.findReplace, 'Ctrl+F / Ctrl+H'],
          [g.shortcuts.toggleChat, 'Ctrl+L'],
          [g.shortcuts.toggleSidebar, 'Ctrl+\\'],
          [g.shortcuts.writePlan, 'Ctrl+1 / Ctrl+2'],
          [t.common.export, 'Ctrl+Shift+E'],
          [t.common.settings, 'Ctrl+,']
        ].map(([label, key]) => (
          <div key={label} className="shortcut-row">
            <dt>{label}</dt>
            <dd>
              <kbd className="kbd">{key}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

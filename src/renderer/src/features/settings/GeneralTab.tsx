import clsx from 'clsx'
import { Moon, Sun, Desktop } from '@phosphor-icons/react'
import type { ThemeSetting } from '@shared/types'
import { Field, Select, Switch } from '@/ui'
import { useApp } from '@/stores/app'
import { typewriterSound } from '@/features/editor/typewriter-sound'

const THEMES: Array<{ id: ThemeSetting; label: string; icon: React.ReactNode }> = [
  { id: 'light', label: 'Paper', icon: <Sun size={16} /> },
  { id: 'dark', label: 'Lamplight', icon: <Moon size={16} /> },
  { id: 'system', label: 'System', icon: <Desktop size={16} /> }
]

export function GeneralTab(): React.JSX.Element | null {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const setUi = useApp((s) => s.setUi)
  if (!settings) return null
  return (
    <div>
      <h3 className="settings-h">Theme</h3>
      <div className="theme-picker">
        {THEMES.map((t) => (
          <button key={t.id} className={clsx('theme-card', `theme-${t.id}`, settings.theme === t.id && 'is-active')} onClick={() => void update({ theme: t.id })}>
            <span className="theme-swatch">
              <span className="theme-page" />
            </span>
            <span className="theme-label">
              {t.icon} {t.label}
            </span>
          </button>
        ))}
      </div>

      <h3 className="settings-h">Writing</h3>
      <Field label="Page zoom" inline>
        <Select
          value={String(settings.ui.zoom)}
          onValueChange={(v) => setUi({ zoom: Number(v) })}
          options={[0.9, 1, 1.1, 1.2, 1.35].map((z) => ({ value: String(z), label: `${Math.round(z * 100)}%` }))}
          ariaLabel="Page zoom"
        />
      </Field>
      <Field label="Spell check" inline>
        <Switch checked={settings.editor.spellcheck} onCheckedChange={(v) => void update({ editor: { ...settings.editor, spellcheck: v } })} />
      </Field>
      <Field label="Focus mode (dim other paragraphs)" inline>
        <Switch checked={settings.ui.focusMode} onCheckedChange={(v) => setUi({ focusMode: v })} />
      </Field>
      <Field label="Typewriter sounds" inline>
        <Switch
          checked={settings.editor.typewriterSounds}
          onCheckedChange={(v) => {
            void update({ editor: { ...settings.editor, typewriterSounds: v } })
            if (v) typewriterSound('bell')
          }}
        />
      </Field>
      <Field label="Typewriter scrolling" inline>
        <Switch checked={settings.ui.typewriterScroll} onCheckedChange={(v) => setUi({ typewriterScroll: v })} />
      </Field>

      <h3 className="settings-h">Keyboard</h3>
      <dl className="shortcuts">
        {[
          ['Polish the selection', 'Ctrl+J'],
          ['Other actions', 'Alt+1 … 9'],
          ['Accept or reject an AI change', 'Enter / Esc'],
          ['Dialogue dash', '--'],
          ['Scene break', 'Ctrl+Shift+Enter'],
          ['Find and replace', 'Ctrl+F / Ctrl+H'],
          ['Show or hide the chat', 'Ctrl+L'],
          ['Show or hide the sidebar', 'Ctrl+\\'],
          ['Write / Plan', 'Ctrl+1 / Ctrl+2'],
          ['Export', 'Ctrl+Shift+E'],
          ['Settings', 'Ctrl+,']
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

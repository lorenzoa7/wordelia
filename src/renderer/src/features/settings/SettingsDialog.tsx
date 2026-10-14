import { useEffect, useState } from 'react'
import { Tabs } from 'radix-ui'
import { BookOpenText, Lightning, PaintBrush, Robot } from '@phosphor-icons/react'
import { useUi, type SettingsTab } from '@/stores/ui'
import { useBook } from '@/stores/book'
import { Dialog } from '@/ui'
import { GeneralTab } from './GeneralTab'
import { BookTab } from './BookTab'
import { AiTab } from './AiTab'
import { ActionsTab } from './ActionsTab'
import './settings.css'

export function SettingsDialog(): React.JSX.Element {
  const open = useUi((s) => s.settingsOpen)
  const tab = useUi((s) => s.settingsTab)
  const close = useUi((s) => s.closeSettings)
  const hasBook = useBook((s) => s.root !== null)
  const [current, setCurrent] = useState<SettingsTab>(tab)
  useEffect(() => {
    if (open) setCurrent(tab === 'book' && !hasBook ? 'general' : tab)
  }, [open, tab, hasBook])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()} title="Settings" width={860} className="settings-dialog">
      <Tabs.Root className="settings" value={current} onValueChange={(v) => setCurrent(v as SettingsTab)} orientation="vertical">
        <Tabs.List className="settings-tabs" aria-label="Settings sections">
          <Tabs.Trigger value="general" className="settings-tab">
            <PaintBrush size={15} /> Appearance
          </Tabs.Trigger>
          {hasBook && (
            <Tabs.Trigger value="book" className="settings-tab">
              <BookOpenText size={15} /> This book
            </Tabs.Trigger>
          )}
          <Tabs.Trigger value="ai" className="settings-tab">
            <Robot size={15} /> AI
          </Tabs.Trigger>
          <Tabs.Trigger value="actions" className="settings-tab">
            <Lightning size={15} /> Actions
          </Tabs.Trigger>
        </Tabs.List>
        <div className="settings-panes">
          <Tabs.Content value="general" className="settings-pane">
            <GeneralTab />
          </Tabs.Content>
          {hasBook && (
            <Tabs.Content value="book" className="settings-pane">
              <BookTab />
            </Tabs.Content>
          )}
          <Tabs.Content value="ai" className="settings-pane">
            <AiTab />
          </Tabs.Content>
          <Tabs.Content value="actions" className="settings-pane">
            <ActionsTab />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </Dialog>
  )
}

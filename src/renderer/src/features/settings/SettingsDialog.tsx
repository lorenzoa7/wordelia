import { useEffect, useRef } from 'react'
import { Tabs } from 'radix-ui'
import { BookOpenText, Lightning, Robot, Scroll, SlidersHorizontal } from '@phosphor-icons/react'
import { useUi, type SettingsTab } from '@/stores/ui'
import { useBook } from '@/stores/book'
import { Dialog } from '@/ui'
import { useT } from '@/lib/i18n'
import { GeneralTab } from './GeneralTab'
import { BookTab } from './BookTab'
import { RulesTab } from './RulesTab'
import { AiTab } from './AiTab'
import { ActionsTab } from './ActionsTab'
import './settings.css'

/** Tabs of the open book. Without a book, the dialog shows General in their place. */
const BOOK_TABS: SettingsTab[] = ['book', 'rules']

export function SettingsDialog(): React.JSX.Element {
  const open = useUi((s) => s.settingsOpen)
  const tab = useUi((s) => s.settingsTab)
  const close = useUi((s) => s.closeSettings)
  const hasBook = useBook((s) => s.root !== null)
  const bookTitle = useBook((s) => s.manifest?.title ?? '')
  const t = useT()
  const d = t.settings.dialog
  const current: SettingsTab = BOOK_TABS.includes(tab) && !hasBook ? 'general' : tab
  // Each tab starts at its top: the panes share one scroll area.
  const panes = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panes.current?.scrollTo({ top: 0 })
  }, [current, open])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()} title={t.common.settings} width={940} className="settings-dialog">
      <Tabs.Root className="settings" value={current} onValueChange={(v) => useUi.setState({ settingsTab: v as SettingsTab })} orientation="vertical">
        <Tabs.List className="settings-tabs" aria-label={d.sections}>
          <Tabs.Trigger value="general" className="settings-tab">
            <SlidersHorizontal size={15} /> {d.general}
          </Tabs.Trigger>
          <Tabs.Trigger value="ai" className="settings-tab">
            <Robot size={15} /> {d.ai}
          </Tabs.Trigger>
          <Tabs.Trigger value="actions" className="settings-tab">
            <Lightning size={15} /> {d.actions}
          </Tabs.Trigger>
          {hasBook && (
            <div className="settings-tab-group" role="group" aria-label={d.bookGroup(bookTitle || t.common.untitled)}>
              <hr className="settings-tabs-sep" />
              <div className="settings-tabs-book" title={bookTitle} aria-hidden>
                {bookTitle || t.common.untitled}
              </div>
              <Tabs.Trigger value="book" className="settings-tab">
                <BookOpenText size={15} className="icon-book" /> {d.book}
              </Tabs.Trigger>
              <Tabs.Trigger value="rules" className="settings-tab">
                <Scroll size={15} /> {d.rules}
              </Tabs.Trigger>
            </div>
          )}
        </Tabs.List>
        <div className="settings-panes" ref={panes}>
          <Tabs.Content value="general" className="settings-pane">
            <GeneralTab />
          </Tabs.Content>
          <Tabs.Content value="ai" className="settings-pane">
            <AiTab />
          </Tabs.Content>
          <Tabs.Content value="actions" className="settings-pane">
            <ActionsTab />
          </Tabs.Content>
          {hasBook && (
            <>
              <Tabs.Content value="book" className="settings-pane">
                <BookTab />
              </Tabs.Content>
              <Tabs.Content value="rules" className="settings-pane settings-pane-rules">
                <RulesTab />
              </Tabs.Content>
            </>
          )}
        </div>
      </Tabs.Root>
    </Dialog>
  )
}

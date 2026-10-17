import { useState } from 'react'
import clsx from 'clsx'
import { Popover } from 'radix-ui'
import { CaretDown } from '@phosphor-icons/react'
import { ACTION_ICON_NAMES, ActionIcon } from '@/features/actions/ActionIcon'

/** One button with the icon of the action. It opens a small grid of the other icons. */
export function IconPicker({ value, onChange, label }: { value: string; onChange: (icon: string) => void; label: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="icon-pick" aria-label={label} title={label}>
          <ActionIcon name={value} size={17} />
          <CaretDown size={9} className="icon-pick-caret" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="menu icon-pop" align="start" sideOffset={6}>
          <div className="icon-grid" role="radiogroup" aria-label={label}>
            {ACTION_ICON_NAMES.map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={value === n}
                aria-label={n}
                className={clsx('icon-choice', value === n && 'is-active')}
                onClick={() => {
                  onChange(n)
                  setOpen(false)
                }}
              >
                <ActionIcon name={n} size={16} />
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

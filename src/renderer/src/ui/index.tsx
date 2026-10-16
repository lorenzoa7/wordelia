// UI primitives. Behavior from Radix (accessible), look from ui.css.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Dialog as RDialog, DropdownMenu, Select as RSelect, Switch as RSwitch, Tooltip as RTooltip } from 'radix-ui'
import { CaretDown, Check, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useT } from '@/lib/i18n'

/* ------------------------------------------------------------------ */
/* Buttons                                                            */
/* ------------------------------------------------------------------ */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ribbon'
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, ...rest },
  ref
) {
  return (
    <button ref={ref} className={clsx('btn', `btn-${variant}`, `btn-${size}`, className)} {...rest}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children && <span>{children}</span>}
    </button>
  )
})

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  shortcut?: string
  active?: boolean
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, side = 'bottom', className, children, ...rest },
  ref
) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={side}>
      <button
        ref={ref}
        aria-label={label}
        aria-pressed={active}
        className={clsx('icon-btn', active && 'is-active', className)}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  )
})

/* ------------------------------------------------------------------ */
/* Tooltip                                                              */
/* ------------------------------------------------------------------ */

export function TooltipProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <RTooltip.Provider delayDuration={450} skipDelayDuration={150}>
      {children}
    </RTooltip.Provider>
  )
}

export function Tooltip({
  label,
  shortcut,
  side = 'bottom',
  children
}: {
  label: ReactNode
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}): React.JSX.Element {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={6} className="tooltip">
          {label}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}

export function Kbd({ children }: { children: ReactNode }): React.JSX.Element {
  return <kbd className="kbd">{children}</kbd>
}

/* ------------------------------------------------------------------ */
/* Menu                                                                 */
/* ------------------------------------------------------------------ */

export function Menu({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className
}: {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}): React.JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} side={side} sideOffset={6} className={clsx('menu', className)}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function MenuItem({
  children,
  icon,
  shortcut,
  onSelect,
  danger,
  checked,
  disabled,
  style
}: {
  children: ReactNode
  icon?: ReactNode
  shortcut?: string
  onSelect?: () => void
  danger?: boolean
  checked?: boolean
  disabled?: boolean
  style?: React.CSSProperties
}): React.JSX.Element {
  return (
    <DropdownMenu.Item
      className={clsx('menu-item', danger && 'is-danger')}
      onSelect={onSelect}
      disabled={disabled}
      style={style}
      {...(checked !== undefined ? { role: 'menuitemradio', 'aria-checked': checked } : {})}
    >
      <span className="menu-item-icon">{checked ? <Check size={14} weight="bold" /> : icon}</span>
      <span className="menu-item-label">{children}</span>
      {shortcut && <span className="menu-item-shortcut">{shortcut}</span>}
    </DropdownMenu.Item>
  )
}

export function MenuSeparator(): React.JSX.Element {
  return <DropdownMenu.Separator className="menu-sep" />
}

export function MenuLabel({ children }: { children: ReactNode }): React.JSX.Element {
  return <DropdownMenu.Label className="menu-label caps">{children}</DropdownMenu.Label>
}

/* ------------------------------------------------------------------ */
/* Dialog                                                               */
/* ------------------------------------------------------------------ */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 520,
  className
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number
  className?: string
}): React.JSX.Element {
  const t = useT()
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="dialog-overlay" />
        <RDialog.Content
          className={clsx('dialog grain', className)}
          style={{ width }}
          onOpenAutoFocus={(e) => {
            // Do not put a focus ring on the close button. Fields with autoFocus still get focus.
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).focus()
          }}
          tabIndex={-1}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className="dialog-head">
            <div>
              <RDialog.Title className="dialog-title">{title}</RDialog.Title>
              {description && <RDialog.Description className="dialog-desc">{description}</RDialog.Description>}
            </div>
            <RDialog.Close asChild>
              <button className="icon-btn" aria-label={t.common.close}>
                <X size={16} />
              </button>
            </RDialog.Close>
          </header>
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

/* ------------------------------------------------------------------ */
/* Form controls                                                        */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  children,
  inline
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  inline?: boolean
}): React.JSX.Element {
  return (
    <div className={clsx('field', inline && 'field-inline')}>
      <label className="field-main">
        <span className="field-label">{label}</span>
        <span className="field-control">{children}</span>
      </label>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={clsx('input', className)} {...rest} />
})

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref
) {
  return <textarea ref={ref} className={clsx('input textarea', className)} {...rest} />
})

export function Switch({
  checked,
  onCheckedChange,
  label
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label?: string
}): React.JSX.Element {
  return (
    <RSwitch.Root className="switch" checked={checked} onCheckedChange={onCheckedChange} aria-label={label}>
      <RSwitch.Thumb className="switch-thumb" />
    </RSwitch.Root>
  )
}

export interface SelectOption {
  value: string
  label: ReactNode
  hint?: ReactNode
  style?: React.CSSProperties
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  ariaLabel
}: {
  value: string
  onValueChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  ariaLabel?: string
}): React.JSX.Element {
  return (
    <RSelect.Root value={value} onValueChange={onValueChange}>
      <RSelect.Trigger className={clsx('select', className)} aria-label={ariaLabel}>
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon className="select-caret">
          <CaretDown size={12} />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="menu select-content" position="popper" sideOffset={4}>
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item key={o.value} value={o.value} className="menu-item" style={o.style}>
                <span className="menu-item-icon">
                  <RSelect.ItemIndicator>
                    <Check size={14} weight="bold" />
                  </RSelect.ItemIndicator>
                </span>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                {o.hint && <span className="menu-item-shortcut">{o.hint}</span>}
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  )
}

export function Spinner({ size = 14 }: { size?: number }): React.JSX.Element {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden />
}

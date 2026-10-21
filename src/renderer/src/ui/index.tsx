// UI primitives. Behavior from Radix (accessible), look from ui.css.

import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
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
  delay,
  children
}: {
  label: ReactNode
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Milliseconds before the tooltip shows. The default comes from TooltipProvider. */
  delay?: number
  children: ReactNode
}): React.JSX.Element {
  return (
    <RTooltip.Root delayDuration={delay}>
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
  className,
  onCloseAutoFocus
}: {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  /** The menu closes and gives the focus back to its button; `preventDefault()` keeps it where an item put it */
  onCloseAutoFocus?: (e: Event) => void
}): React.JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} side={side} sideOffset={6} className={clsx('menu', className)} onCloseAutoFocus={onCloseAutoFocus}>
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
  className,
  onEscapeKeyDown
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number
  className?: string
  /** Escape closes the dialog; `preventDefault()` keeps it open (for example while a list of a field is open) */
  onEscapeKeyDown?: (e: KeyboardEvent) => void
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
          onEscapeKeyDown={onEscapeKeyDown}
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

/** Ties the label of a Field to its control. The control takes `controlId`; `labelId` names it. */
const FieldContext = createContext<{ controlId: string; labelId: string } | null>(null)

/**
 * A label and its control. The label is not wrapped around the control: a click beside the
 * control does nothing, so a dropdown opens only from its own box. A click on the label text
 * focuses a text box or flips a switch; it never opens a dropdown.
 */
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
  const id = useId()
  const ids = useMemo(() => ({ controlId: `${id}control`, labelId: `${id}label` }), [id])
  return (
    <div className={clsx('field', inline && 'field-inline')}>
      <div className="field-main">
        <label className="field-label" id={ids.labelId} htmlFor={ids.controlId}>
          {label}
        </label>
        <span className="field-control">
          <FieldContext.Provider value={ids}>{children}</FieldContext.Provider>
        </span>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, id, ...rest },
  ref
) {
  const field = useContext(FieldContext)
  return <input ref={ref} id={id ?? field?.controlId} className={clsx('input', className)} {...rest} />
})

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, id, ...rest },
  ref
) {
  const field = useContext(FieldContext)
  return <textarea ref={ref} id={id ?? field?.controlId} className={clsx('input textarea', className)} {...rest} />
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
  const field = useContext(FieldContext)
  return (
    <RSwitch.Root
      className="switch"
      id={field?.controlId}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      aria-labelledby={label ? undefined : field?.labelId}
    >
      <RSwitch.Thumb className="switch-thumb" />
    </RSwitch.Root>
  )
}

/**
 * A box for a number. Typing stays in the box; Enter, leaving the box or closing its dialog saves it.
 * Esc puts the saved value back, and only that: the dialog stays open. The arrow keys step the value (Shift: ten steps) and save at once. The box
 * accepts a comma or a point for decimals and shows the number in the interface language.
 */
export function NumberInput({
  value,
  onCommit,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  decimals = 0,
  unit,
  id,
  ariaLabel,
  className
}: {
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number
  /** Digits after the decimal point */
  decimals?: number
  /** Text after the number in the box, for example "words a day" */
  unit?: string
  id?: string
  ariaLabel?: string
  className?: string
}): React.JSX.Element {
  const t = useT()
  const field = useContext(FieldContext)
  const unitId = useId()
  const input = useRef<HTMLInputElement>(null)
  const locale = t.common.locale
  const format = useCallback(
    (v: number): string => v.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false }),
    [locale, decimals]
  )
  const [draft, setDraft] = useState(() => format(value))
  const [editing, setEditing] = useState(false)
  // A change from somewhere else shows, but not while the user types.
  useEffect(() => {
    if (!editing) setDraft(format(value))
  }, [value, editing, format])

  const round = (n: number): number => {
    const f = 10 ** decimals
    return Math.min(max, Math.max(min, Math.round(n * f) / f))
  }
  const parse = (text: string): number | null => {
    const clean = text.replace(/\s/g, '')
    if (!clean) return min
    // Decimals accept a comma or a point. Whole numbers ignore group separators ("1.000", "1,000").
    const n = decimals ? Number(clean.replace(',', '.')) : Number(clean.replace(/[.,]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  const commit = (next: number | null): void => {
    const v = next === null ? value : round(next)
    setDraft(format(v))
    if (v !== value) onCommit(v)
  }
  // The latest draft and commit, for the listeners below.
  const latest = useRef({ draft, value, editing, format, commit: (_: string): void => {} })
  latest.current = { draft, value, editing, format, commit: (text: string) => commit(parse(text)) }

  // Esc with a changed draft puts the saved value back and does nothing more. A dialog listens for Esc
  // on the document in the capture phase, so the box listens on the window first and stops the key there.
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent): void => {
      const l = latest.current
      if (e.key !== 'Escape' || e.target !== input.current || l.draft === l.format(l.value)) return
      e.stopPropagation()
      e.preventDefault()
      setDraft(l.format(l.value))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editing])

  // The box goes away while the user types (the dialog closes): save the draft.
  useEffect(
    () => () => {
      const l = latest.current
      if (l.editing && l.draft !== l.format(l.value)) l.commit(l.draft)
    },
    []
  )
  // The width of the longest value, in characters: the UI font is monospaced.
  const chars = Math.max(String(Math.trunc(max)).length, String(Math.trunc(min)).length) + (decimals ? decimals + 1 : 0)

  return (
    <span
      className={clsx('number-input', unit && 'has-unit', className)}
      onMouseDown={(e) => {
        // A click on the unit or the padding puts the cursor in the box.
        if (e.target !== input.current) {
          e.preventDefault()
          input.current?.focus()
        }
      }}
    >
      <input
        ref={input}
        id={id ?? field?.controlId}
        className="number-input-box"
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        role="spinbutton"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : [field?.labelId, unit ? unitId : null].filter(Boolean).join(' ') || undefined}
        autoComplete="off"
        spellCheck={false}
        style={{ width: `${chars + 0.5}ch` }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setEditing(true)
          e.target.select()
        }}
        onBlur={() => {
          setEditing(false)
          commit(parse(draft))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(parse(draft))
            input.current?.select()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const base = parse(draft) ?? value
            const delta = (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)
            // Step to the next multiple of the step: 512 → 550 → 600.
            const stepped = Math.round((delta > 0 ? Math.floor(base / step + 1e-9) * step + delta : Math.ceil(base / step - 1e-9) * step + delta) * 1e6) / 1e6
            commit(stepped)
          }
        }}
      />
      {unit && (
        <span className="number-input-unit" id={unitId}>
          {unit}
        </span>
      )}
    </span>
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
  // In a Field, the label names the box, but a click on the label does not open it.
  const field = useContext(FieldContext)
  return (
    <RSelect.Root value={value} onValueChange={onValueChange}>
      <RSelect.Trigger className={clsx('select', className)} aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : field?.labelId}>
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

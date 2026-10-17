import { AnimatePresence, motion } from 'motion/react'
import { WarningCircle, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useUi } from '@/stores/ui'
import { useT } from '@/lib/i18n'

export function Toasts(): React.JSX.Element {
  const t = useT()
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            className={clsx('toast', toast.kind === 'error' && 'is-error')}
            onMouseEnter={() => useUi.getState().pauseToast(toast.id)}
            onMouseLeave={() => useUi.getState().resumeToast(toast.id)}
            onFocus={() => useUi.getState().pauseToast(toast.id)}
            onBlur={() => useUi.getState().resumeToast(toast.id)}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            {toast.kind === 'error' && <WarningCircle className="toast-icon" size={16} weight="bold" aria-hidden />}
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
              <button
                className="toast-action"
                onClick={() => {
                  toast.action?.run()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
            {(toast.action || toast.kind === 'error') && (
              <button className="toast-close" aria-label={t.common.close} onClick={() => dismiss(toast.id)}>
                <X size={13} weight="bold" />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

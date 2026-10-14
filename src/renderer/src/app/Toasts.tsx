import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { useUi } from '@/stores/ui'

export function Toasts(): React.JSX.Element {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={clsx('toast', t.kind === 'error' && 'is-error')}
            onMouseEnter={() => useUi.getState().pauseToast(t.id)}
            onMouseLeave={() => useUi.getState().resumeToast(t.id)}
            onFocus={() => useUi.getState().pauseToast(t.id)}
            onBlur={() => useUi.getState().resumeToast(t.id)}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { WarningCircle } from '@phosphor-icons/react'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import { useApp } from '@/stores/app'
import { useUi } from '@/stores/ui'
import { Tooltip } from '@/ui'
import { useT } from '@/lib/i18n'

/** A problem must last this long before the badge shows: the start-up checks take a moment. */
const SETTLE_MS = 1500

/**
 * A small warning in the title bar when the chat has no AI: no AI is connected, or the login
 * of its provider is not valid. A click opens Settings → AI. When the AI is ready, it shows nothing.
 */
export function ProviderBadge(): React.JSX.Element | null {
  const t = useT()
  const route = useApp((s) => s.settings?.routes.chat)
  const status = useApp((s) => (route ? s.status[route.provider] : undefined))
  const busy = useApp((s) => Object.values(s.checking).some(Boolean))
  const openSettings = useUi((s) => s.openSettings)

  const problem: 'none' | 'notConnected' | 'expired' | null = busy
    ? null
    : !route
      ? 'none'
      : !status
        ? null
        : !status.installed || status.loggedIn === false
          ? status.reason === 'expired'
            ? 'expired'
            : 'notConnected'
          : null

  // Show a problem only after it stays for a moment, so the badge does not flash at start.
  const [shown, setShown] = useState<typeof problem>(null)
  useEffect(() => {
    if (!problem) {
      setShown(null)
      return
    }
    const timer = setTimeout(() => setShown(problem), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [problem])

  if (!shown) return null
  const p = t.app.provider
  const name = route ? PROVIDER_LABELS[route.provider].name : ''
  const label = shown === 'none' ? p.connect : shown === 'expired' ? p.expired : p.notConnectedShort
  const hint = shown === 'none' ? p.connectHint : shown === 'expired' ? p.expiredHint(name) : p.notConnectedHint(name)

  return (
    <Tooltip label={hint}>
      <button className="provider-badge" aria-label={label} onClick={() => openSettings('ai')}>
        <WarningCircle size={14} weight="bold" />
        <span>{label}</span>
      </button>
    </Tooltip>
  )
}

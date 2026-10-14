import clsx from 'clsx'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import { useApp } from '@/stores/app'
import { useUi } from '@/stores/ui'
import { Tooltip } from '@/ui'

/** A small dot that shows if the chat model is ready. Click opens AI settings. */
export function ProviderBadge(): React.JSX.Element | null {
  const route = useApp((s) => s.settings?.routes.chat)
  const status = useApp((s) => (route ? s.status[route.provider] : undefined))
  const checking = useApp((s) => (route ? s.checking[route.provider] : false))
  const openSettings = useUi((s) => s.openSettings)

  const state = !route ? 'off' : checking && !status ? 'checking' : status?.installed && status.loggedIn !== false ? 'ok' : 'error'
  const label = !route
    ? 'Connect an AI'
    : state === 'ok'
      ? PROVIDER_LABELS[route.provider].short
      : state === 'checking'
        ? 'Checking…'
        : `${PROVIDER_LABELS[route.provider].short}: not connected`

  return (
    <Tooltip label={state === 'ok' ? `AI ready: ${PROVIDER_LABELS[route!.provider].name}` : 'Open AI settings'}>
      <button className={clsx('provider-badge', `is-${state}`)} onClick={() => openSettings('ai')}>
        <span className="provider-dot" />
        <span>{label}</span>
      </button>
    </Tooltip>
  )
}

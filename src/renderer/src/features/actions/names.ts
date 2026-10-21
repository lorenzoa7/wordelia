// The name of an action as the interface shows it.

import type { AiAction } from '@shared/types'
import { actionName, type getT } from '@/lib/i18n'

/** The name in the interface language (built-in names), or "Unnamed action" for an action without a name. */
export function actionLabel(t: ReturnType<typeof getT>, a: AiAction): string {
  return actionName(t, a).trim() || t.settings.actions.unnamed
}

// Interface texts in the main process, in the language of the interface (settings.language).

import { messagesFor, type Messages } from '@shared/i18n'
import { getSettings } from './settings'

export async function mainT(): Promise<Messages> {
  return messagesFor((await getSettings()).language)
}

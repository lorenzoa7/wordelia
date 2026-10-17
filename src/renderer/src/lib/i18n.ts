// The texts of the interface in the language of the settings.
//
//   const t = useT()            in React components (re-renders when the language changes)
//   const t = getT()            in stores and other code outside React
//
// t.<namespace>.<key> is a string or a function, for example t.common.words(12).

import { messagesFor, type Messages } from '@shared/i18n'
import { useApp } from '@/stores/app'

export function useT(): Messages {
  const locale = useApp((s) => s.settings?.language)
  return messagesFor(locale)
}

export function getT(): Messages {
  return messagesFor(useApp.getState().settings?.language)
}

export { actionInstructions, actionName, categoryName, effortName, folderCategoryName, routeText, LOCALES } from '@shared/i18n'

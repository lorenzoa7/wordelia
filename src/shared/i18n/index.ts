// Interface languages. English is the source; Portuguese (Brazil) and Spanish are translations.
// Pure data and functions: the main process and the renderer both use this module.

import type { AiAction, CategoryDef, Effort, Locale, ModelChoice, ModelInfo } from '../types'
import { PROVIDER_LABELS } from '../ai/routes'
import { messages as en, type Messages } from './en'
import { messages as ptBR } from './pt-BR'
import { messages as es } from './es'

export type { Messages }

export const MESSAGES: Record<Locale, Messages> = { en, 'pt-BR': ptBR, es }

/** The choices in Settings, each in its own language. */
export const LOCALES: Array<{ id: Locale; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'es', label: 'Español' }
]

export function messagesFor(locale: Locale | undefined): Messages {
  return MESSAGES[locale ?? 'en'] ?? en
}

export function effortName(t: Messages, e: Effort): string {
  return t.common.efforts[e]
}

/** The name of an action. Built-in actions that the user did not rename show the name in the interface language. */
export function actionName(t: Messages, a: Pick<AiAction, 'id' | 'name' | 'builtIn'>): string {
  if (a.builtIn && en.common.builtinActions[a.id] === a.name) return t.common.builtinActions[a.id] ?? a.name
  return a.name
}

/**
 * The instructions of an action. Built-in actions whose instructions the user did not change show,
 * and send to the AI, the instructions in the interface language. Changed instructions belong to the user.
 */
export function actionInstructions(t: Messages, a: Pick<AiAction, 'id' | 'instructions' | 'builtIn'>): string {
  if (a.builtIn && en.common.builtinActionInstructions[a.id] === a.instructions) return t.common.builtinActionInstructions[a.id] ?? a.instructions
  return a.instructions
}

/** The name of a planning category. Default categories that the user did not rename show the name in the interface language. */
export function categoryName(t: Messages, c: Pick<CategoryDef, 'id' | 'name'>): string {
  if (en.common.categories[c.id] === c.name) return t.common.categories[c.id] ?? c.name
  return c.name
}

/** The name of the category in a planning folder, for example "Characters" → "Personagens". */
export function folderCategoryName(t: Messages, folder: string, categories: Array<Pick<CategoryDef, 'id' | 'name' | 'folder'>>): string {
  const c = categories.find((x) => x.folder === folder)
  return c ? categoryName(t, c) : folder
}

/** "Claude · Opus · Medium" */
export function routeText(t: Messages, route: ModelChoice | null, models?: ModelInfo[], notSet = '—', defaultModel = '—'): string {
  if (!route) return notSet
  const model = models?.find((m) => m.id === route.model)?.label ?? (route.model || defaultModel)
  return `${PROVIDER_LABELS[route.provider].short} · ${model}${route.effort ? ` · ${effortName(t, route.effort)}` : ''}`
}

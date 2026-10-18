import type { history as en } from '../en/history'

export const history: typeof en = {
  title: 'Historial',
  titleOf: (title) => `Historial de “${title}”`,
  description: 'Wordelia guarda versiones cuando abres un capítulo, cada pocos minutos mientras escribes y antes de los cambios de la IA.',
  restore: 'Restaurar esta versión',
  reading: 'Leyendo el historial…',
  unreadable: 'Wordelia no puede leer esta versión.',
  empty: 'Todavía no hay versiones. Wordelia guarda una cuando abres el capítulo y mientras escribes.',
  ifRestore: 'Si restauras esta versión:',
  words: 'palabras',
  today: (time) => `Hoy, ${time}`,
  restored: (title, when) => `“${title}” volvió a la versión de ${when}.`,
  labels: {
    opened: 'Abierto',
    left: 'Salió del capítulo',
    autosave: 'Guardado automático',
    beforeRestore: 'Antes de restaurar',
    beforeChat: 'Antes de un cambio de la IA en el chat',
    snapshot: 'Versión'
  },
  before: (action) => `Antes de ${action}`
}

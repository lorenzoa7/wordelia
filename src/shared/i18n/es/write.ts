import type { write as en } from '../en/write'

const n = (v: number): string => v.toLocaleString('es')

export const write: typeof en = {
  chapters: 'Capítulos',
  newChapter: 'Nuevo capítulo',
  addChapter: 'Agregar capítulo',
  chapterTitle: 'Título del capítulo',
  chapterOptions: 'Opciones del capítulo',
  chapterLabel: (num, title, words) =>
    `Capítulo ${num}: ${title}, ${words} palabras. F2 cambia el nombre; Alt y las flechas lo mueven.`,
  newChapterAfter: 'Nuevo capítulo después de este',
  moveUp: 'Subir',
  moveDown: 'Bajar',
  mention: 'Mencionar en el chat',
  versionHistoryMenu: 'Historial de versiones…',
  deleteChapter: 'Eliminar capítulo',
  deleteTitle: (title) => `¿Eliminar “${title}”?`,
  deleteMessage: 'El archivo pasa a la carpeta .wordelia/trash del libro. Puedes recuperarlo desde ahí.',
  deleted: (title) => `“${title}” se movió a la carpeta de la papelera.`,
  status: {
    selected: 'seleccionadas',
    wordsInChapter: 'palabras en el capítulo',
    inBook: (count) => `${count} en el libro`,
    minRead: (minutes) => `${minutes} min de lectura`,
    dailyGoal: (words) => `Meta diaria: ${n(words)} palabras`,
    goalReached: 'Meta alcanzada',
    today: (words) => `+${words} hoy`,
    versionHistory: 'Historial de versiones',
    history: 'Historial',
    saved: 'Guardado',
    saving: 'Guardando…',
    notSaved: 'Sin guardar'
  },
  action: {
    connectFirst: 'Conecta una IA primero.',
    openSettings: 'Abrir ajustes',
    nothingToChange: 'La IA no encontró nada que cambiar.',
    noRewrite: 'La IA no envió la nueva versión. Inténtalo de nuevo.'
  }
}

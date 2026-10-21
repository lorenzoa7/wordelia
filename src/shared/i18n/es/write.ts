import type { write as en } from '../en/write'

const n = (v: number): string => v.toLocaleString('es')

export const write: typeof en = {
  chapters: 'Capítulos',
  chapterTitle: 'Título del capítulo',
  chapterOptions: 'Opciones del capítulo',
  /** Pages of a chapter in the chapter list */
  chapterPages: (n) => `${n} p.`,
  /** Tooltip of the pages: the words of the chapter */
  chapterWords: (n) => `${n.toLocaleString('es')} palabras`,
  chapterLabel: (num, title, words) =>
    `Capítulo ${num}: ${title}, ${words} palabras. F2 cambia el nombre; Alt y las flechas lo mueven.`,
  newChapterAfter: 'Nuevo capítulo después de este',
  moveUp: 'Subir',
  moveDown: 'Bajar',
  mention: 'Mencionar en el chat',
  versionHistoryMenu: 'Historial de versiones…',
  deleteChapter: 'Eliminar capítulo',
  deleteTitle: (title) => `¿Eliminar “${title}”?`,
  deleteMessage: 'Puedes deshacerlo justo después. El archivo también queda en la carpeta del libro, en .wordelia/trash.',
  deleted: (title) => `Se eliminó “${title}”.`,
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
  },
  newChapterAfterOne: (title) => `Nuevo capítulo después de “${title}”`,
  addChapterAtEnd: 'Nuevo capítulo al final',
  saveProblems: {
    readOnly: 'El archivo es de solo lectura, o el sistema no deja que Wordelia lo cambie.',
    busy: 'Otro programa está usando el archivo, por ejemplo una app de sincronización.',
    missing: 'La carpeta del libro no está. Se movió, o su disco no está conectado.',
    diskFull: 'El disco está lleno.',
    other: 'Wordelia no puede escribir el archivo.'
  },
  notSavedToast: (reason) => `Tus últimos cambios no se guardaron. ${reason} Wordelia lo intenta de nuevo solo.`,
  clickToRetry: 'Haz clic para intentarlo de nuevo.'
}

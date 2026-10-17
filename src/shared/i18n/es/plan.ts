import type { plan as en } from '../en/plan'

export const plan: typeof en = {
  newEntryName: 'Nueva nota',
  writingRules: 'Reglas de escritura',
  name: 'Nombre',
  backTo: (to) => `Volver a ${to}`,
  category: {
    count: (n) => (n === 1 ? '1 nota' : `${n} notas`),
    newEntry: 'Nueva nota',
    importNotes: 'Importar notas'
  },
  sidebar: {
    planning: 'Planificación',
    updateNotes: 'Actualizar notas',
    updateNotesFrom: 'desde los capítulos',
    updateNotesHint:
      'La IA lee los capítulos que cambiaron desde la última actualización y propone cambios en las notas de la planificación. Tú aceptas o rechazas cada cambio. La IA no cambia el manuscrito.',
    changedChapters: (count) =>
      count === 1 ? '1 capítulo cambió desde la última actualización.' : `${count} capítulos cambiaron desde la última actualización.`,
    upToDate: 'Ningún capítulo cambió desde la última actualización.',
    overview: 'Vista general',
    showEntries: (category) => `${category}: mostrar notas`,
    importNotesInto: (category) => `Importar notas a ${category}`,
    newIn: (category) => `Nueva nota en ${category}`,
    empty: 'Vacía',
    newCategory: 'Nueva categoría',
    categoryPlaceholder: 'Objetos, Facciones, Cronología…',
    add: 'Agregar',
    addCategory: 'Agregar categoría'
  },
  overview: {
    title: 'La biblia de la historia',
    intro: 'Personajes, lugares, el mundo y la trama. La IA lee esta planificación en cada chat y acción, así el libro se mantiene coherente.',
    buildFromManuscript: 'Crear la planificación a partir del manuscrito',
    noNotesYet: 'Nada escrito todavía.',
    newCard: 'Nueva'
  },
  entry: {
    deleteTitle: (name) => `¿Eliminar “${name}”?`,
    deleteMessage: 'El archivo pasa a la carpeta .wordelia/trash del libro.',
    askChat: 'Preguntar al chat sobre esta nota',
    mentionInChat: 'Mencionar en el chat',
    deleteEntry: 'Eliminar nota',
    chooseImage: 'Elegir una imagen',
    changeImage: 'Cambiar',
    addImage: 'Agregar imagen',
    summary: 'Resumen',
    summaryPlaceholder: 'Una línea que describe esta nota',
    alsoCalled: 'Otros nombres',
    removeAlias: (alias) => `Quitar ${alias}`,
    aliasPlaceholder: '+ nombre',
    notesPlaceholder: 'Apuntes: apariencia, personalidad, pasado, secretos…',
    inManuscript: 'En el manuscrito'
  },
  rules: {
    intro:
      'Tus reglas para este libro: voz, punto de vista, tiempo verbal, diálogos, palabras a evitar. Todas las acciones y chats de la IA las siguen. Pega aquí las reglas de tu prompt anterior.',
    placeholder: 'Escribe tus reglas…'
  },
  noteEditor: {
    placeholder: 'Escribe aquí…',
    notesAbout: (label) => `Apuntes sobre ${label}`,
    notes: 'Apuntes',
    reply: 'Responder'
  },
  sync: {
    connectAiFirst: 'Conecta una IA primero.',
    openSettings: 'Abrir ajustes',
    upToDate: 'La planificación está al día con el manuscrito.',
    done: 'Sincronización completa. Revisa las propuestas en el chat.',
    threadTitle: 'Sincronización de la planificación',
    threadBrief: 'Mantiene la planificación al día con el manuscrito. Las propuestas vienen del botón Actualizar notas.',
    request: (bootstrap, count, chapters, part, parts) => {
      const what = bootstrap
        ? count === 1
          ? 'Crear la planificación a partir del capítulo'
          : `Crear la planificación a partir de ${count} capítulos`
        : count === 1
          ? 'Sincronizar la planificación con el capítulo'
          : `Sincronizar la planificación con ${count} capítulos`
      return `${what}: ${chapters}${parts > 1 ? ` (parte ${part} de ${parts})` : ''}.`
    }
  },
  links: {
    noEntry: (name) => `Ninguna nota de la planificación se llama "${name}".`,
    createIt: 'Crear nota'
  },
  imported: (count, category) => (count === 1 ? `1 nota importada a ${category}.` : `${count} notas importadas a ${category}.`)
}

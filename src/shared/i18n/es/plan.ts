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
    /** The sync button. Its tooltip says what it does. */
    sync: 'Sincronizar',
    updateNotesHint:
      'La IA lee los capítulos que cambiaron desde la última actualización y propone cambios en las notas de la planificación. Tú aceptas o rechazas cada cambio. La IA no cambia el manuscrito.',
    changedChapters: (count) =>
      count === 1 ? '1 capítulo cambió desde la última actualización.' : `${count} capítulos cambiaron desde la última actualización.`,
    upToDate: 'Al día: ningún capítulo cambió desde la última actualización.',
    overview: 'Vista general',
    showEntries: (category) => `${category}: mostrar notas`,
    hideEntries: (category) => `${category}: ocultar notas`,
    importNotesInto: (category) => `Importar notas a ${category}`,
    newIn: (category) => `Nueva nota en ${category}`,
    empty: 'Vacía',
    newCategory: 'Nueva categoría',
    categoryPlaceholder: 'Objetos, Facciones, Cronología…',
    add: 'Agregar',
    addCategory: 'Agregar categoría'
  },
  overview: {
    title: 'El universo de la historia',
    intro: 'Personajes, lugares, el mundo y la trama. La IA lee esta planificación en cada chat y acción, así el libro se mantiene coherente.',
    buildFromManuscript: 'Crear la planificación a partir del manuscrito',
    noNotesYet: 'Nada escrito todavía.',
    newCard: 'Nueva'
  },
  line: {
    title: 'Línea de la historia',
    views: 'Vistas de la línea de la historia',
    byChapter: 'Por capítulo',
    byTime: 'Por orden',
    statsChapters: (chapters, cards) => `${chapters === 1 ? '1 capítulo' : `${chapters} capítulos`} · ${cards === 1 ? '1 tarjeta' : `${cards} tarjetas`}`,
    statsMoments: (moments, cards) => `${moments === 1 ? '1 momento' : `${moments} momentos`} · ${cards === 1 ? '1 tarjeta' : `${cards} tarjetas`}`,
    here: 'Estás aquí',
    hereChapter: 'El último capítulo del libro',
    hereTime: 'El momento del último capítulo del libro',
    trayChapter: 'Sin capítulo',
    trayChapterHint: 'Tarjetas que todavía no están en un capítulo. Arrástralas a un capítulo.',
    trayTime: 'Sin momento',
    trayTimeHint: 'Tarjetas que todavía no están en un momento. Arrástralas a un momento.',
    written: 'Un capítulo del libro. Los capítulos siguen el orden del libro.',
    planned: 'Un capítulo planeado: todavía no está en el libro. Arrástralo para cambiar su lugar.',
    moment: 'Un momento de la historia. Arrástralo para cambiar su lugar.',
    untitled: 'Sin título',
    chapterNumber: (n) => `Capítulo ${n}`,
    cards: (n) => (n === 1 ? '1 tarjeta' : `${n} tarjetas`),
    addCard: 'Añadir una tarjeta',
    cardPlaceholder: '¿Qué pasa? Escribe @ para mencionar una nota.',
    cardKeys: 'Intro añade la tarjeta · Esc cierra',
    addChapter: 'Planear un capítulo',
    addMoment: 'Añadir un momento',
    chapterPlaceholder: 'Título del capítulo',
    momentPlaceholder: 'Por ejemplo: agosto de 1883',
    columnKeys: 'Intro añade · Esc cierra',
    columnMenu: (title) => `Acciones de «${title}»`,
    move: (title) => `Mover «${title}»`,
    rename: 'Renombrar',
    renameChapter: 'Renombrar el capítulo',
    openChapter: 'Abrir el capítulo',
    deleteColumn: 'Borrar la columna',
    columnDeleted: (title, cards, tray) =>
      cards ? `«${title}» se borró. ${cards === 1 ? 'Su tarjeta está' : `Sus ${cards} tarjetas están`} en «${tray}».` : `«${title}» se borró.`,
    cardTitle: 'Tarjeta',
    chapter: 'Capítulo',
    momentField: 'Momento',
    none: 'Ninguno',
    mentions: 'Notas mencionadas',
    deleteCard: 'Borrar la tarjeta',
    cardDeleted: 'La tarjeta se borró.',
    textRequired: 'Escribe lo que pasa.',
    suggestions: 'Notas para mencionar',
    bannerText: 'Deja que la IA llene la línea a partir de un resumen, una nota o una imagen.',
    bannerAction: 'Llenar con la IA',
    bannerDraft: 'Llena mi línea de la historia con esta información: ',
    threadTitle: 'Línea de la historia',
    reviewTitle: 'Propuesta de la IA',
    reviewStats: (s) =>
      [
        s.added && `${s.added} ${s.added === 1 ? 'nueva' : 'nuevas'}`,
        s.moved && `${s.moved} ${s.moved === 1 ? 'movida' : 'movidas'}`,
        s.changed && `${s.changed} ${s.changed === 1 ? 'cambiada' : 'cambiadas'}`,
        s.removed && `${s.removed} ${s.removed === 1 ? 'borrada' : 'borradas'}`
      ]
        .filter(Boolean)
        .join(' · ') || 'Ningún cambio en las tarjetas',
    reviewLocked: 'Acepta o rechaza la propuesta antes de cambiar la línea.',
    reviewStale: 'Esta propuesta de la IA ya no cabe en la línea.',
    writing: 'La IA está escribiendo una propuesta para la línea…',
    showInChat: 'Mostrar en el chat',
    showInLine: 'Mostrar en la línea',
    markNew: 'Nueva',
    markMoved: 'Movida',
    markChanged: 'Cambiada',
    markDeleted: 'Borrada',
    accepted: 'La línea se actualizó.',
    created: 'La línea de la historia está lista.',
    summary: 'Los sucesos de la historia, por capítulo y por orden.',
    card: 'Línea de la historia',
    inLine: (n) => `Capítulo ${n} en la línea`,
    more: (n) => `+${n}`,
    dndInstructions: 'Pulsa Espacio para tomar una tarjeta o una columna. Muévela con las flechas. Pulsa Espacio para soltarla, o Esc para cancelar.',
    dndStart: (text) => `Tomaste «${text}».`,
    dndOver: (title) => `Sobre «${title}».`,
    dndEnd: (title) => `Soltada en «${title}».`,
    dndCancel: 'El movimiento se canceló.'
  },
  map: {
    views: 'Vistas de la planificación',
    cards: 'Tarjetas',
    map: 'Mapa',
    line: 'Línea',
    stats: (entries, links) => `${entries === 1 ? '1 nota' : `${entries} notas`} · ${links === 1 ? '1 conexión' : `${links} conexiones`}`,
    searchPlaceholder: 'Buscar una nota',
    search: 'Buscar una nota en el mapa',
    clearSearch: 'Borrar la búsqueda',
    matches: (n) => (n === 0 ? 'Sin resultados' : n === 1 ? '1 resultado' : `${n} resultados`),
    categories: 'Categorías',
    toggleCategory: (category, shown) => (shown ? `Ocultar ${category}` : `Mostrar ${category}`),
    chapters: 'Capítulos',
    chaptersHint: 'Mostrar los capítulos y las notas que mencionan',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    fit: 'Ajustar a la pantalla',
    label: (entries, links) => `Mapa de ${entries} notas y ${links} conexiones. Usa la búsqueda para encontrar y abrir una nota.`,
    links: (n) => (n === 0 ? 'Sin conexiones' : n === 1 ? '1 conexión' : `${n} conexiones`),
    chapter: (n) => `Capítulo ${n}`,
    emptyTitle: 'Todavía no hay nada que mapear',
    emptyText: 'El mapa muestra las notas de la planificación y las conexiones entre ellas. Agrega personajes, lugares y notas, y aparecen aquí.',
    noLinksTitle: 'Todavía no hay conexiones',
    noLinks: 'Una nota se conecta con otra cuando su resumen o su texto usa el nombre de la otra nota, o [[Nombre]].',
    allHidden: 'Todas las categorías están ocultas.',
    showAll: 'Mostrar todas'
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
    syncing: 'Sincronizando…',
    started: 'Las notas se actualizan en segundo plano. La vista Planificar muestra el progreso.',
    reading: (n) => (n === 1 ? 'Leyendo 1 capítulo…' : `Leyendo ${n} capítulos…`),
    writing: (found) => (found === 0 ? 'Escribiendo los cambios…' : found === 1 ? '1 cambio hasta ahora…' : `${found} cambios hasta ahora…`),
    part: (part, parts) => `Parte ${part} de ${parts}`,
    cancel: 'Cancelar la sincronización',
    proposed: (n) => (n === 1 ? '1 cambio propuesto en las notas' : `${n} cambios propuestos en las notas`),
    noChanges: 'Ningún cambio. Las notas coinciden con los capítulos.',
    review: 'Revisar',
    reviewHint: 'Abrir los cambios en el chat. Allí aceptas o rechazas cada cambio.',
    accepted: (n) => (n === 1 ? '1 cambio aplicado en las notas.' : `${n} cambios aplicados en las notas.`),
    rejected: (n) => (n === 1 ? '1 cambio rechazado.' : `${n} cambios rechazados.`),
    failed: 'La sincronización se detuvo.',
    result: 'Resultado de la sincronización',
    threadTitle: 'Sincronización de la planificación',
    threadBrief: 'Mantiene la planificación al día con el manuscrito. Las propuestas vienen del botón Sincronizar.',
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

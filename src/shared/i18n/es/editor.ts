import type { editor as en } from '../en/editor'

export const editor: typeof en = {
  toolbar: {
    formatting: 'Formato',
    redo: 'Rehacer',
    font: 'Fuente',
    selectedText: 'Texto seleccionado',
    bookFont: (font) => `Fuente del libro (${font})`,
    changeBookFont: 'Cambiar la fuente de todo el libro…',
    fontSize: 'Tamaño de fuente',
    bookSize: (size) => `Tamaño del libro (${size})`,
    bold: 'Negrita',
    italic: 'Cursiva',
    underline: 'Subrayado',
    alignment: 'Alineación',
    align: { left: 'Izquierda', center: 'Centro', right: 'Derecha', justify: 'Justificado' },
    bookDefault: 'Predeterminado del libro',
    noIndent: 'Sin sangría en la primera línea',
    sceneBreak: 'Salto de escena',
    findReplace: 'Buscar y reemplazar',
    focusMode: 'Modo concentración',
    zoom: 'Zoom',
    zoomReset: 'Volver al 100 %',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    zoomSliderHint: 'Arrastra para cambiar el zoom. Doble clic: 100 %'
  },
  selection: {
    askChat: 'Preguntar al chat sobre esto',
    reply: 'Responder',
    withAi: (action) => `${action} con IA`,
    moreActions: 'Más acciones',
    actions: 'Acciones',
    editActions: 'Editar acciones…',
    chapter: 'Capítulo'
  },
  /** The mark of a selected page break (Ctrl+Enter) */
  pageBreak: 'Salto de página',
  review: {
    chatProposal: 'Propuesta del chat',
    words: (n) => (n === 1 ? '1 palabra' : `${n} palabras`),
    stop: 'Detener',
    /** The three views of an AI change in the review bar */
    viewLabel: 'Ver el cambio',
    views: {
      words: 'Palabra por palabra',
      stacked: 'Antes y después',
      new: 'Solo el texto nuevo'
    },
    barLabel: (action) => `Revisión de ${action}`,
    working: (action) => `${action}: la IA trabaja en el pasaje. Puedes escribir en el resto del capítulo.`,
    readyStatus: (action, added, removed) =>
      `${action}: el cambio está listo, ${added} añadidas y ${removed} quitadas. Enter acepta, Esc rechaza, Tab va a la barra.`,
    lockedShort: 'Bloqueado',
    lockedWorking: 'El pasaje queda bloqueado mientras la IA trabaja. Esc detiene.',
    lockedReady: 'El pasaje queda bloqueado hasta que decidas. Enter acepta, Esc rechaza.'
  },
  find: {
    replaceToggle: 'Reemplazar',
    find: 'Buscar',
    noResults: 'Sin resultados',
    matchCase: 'Coincidir mayúsculas y minúsculas',
    wholeWord: 'Palabra completa',
    wholeWordShort: 'P',
    previous: 'Anterior',
    next: 'Siguiente',
    replaceWith: 'Reemplazar con',
    replace: 'Reemplazar',
    replaceAll: 'Reemplazar todo',
    otherChapters: 'Otros capítulos'
  },
  page: {
    placeholder: 'Empieza aquí…',
    chapterText: 'Texto del capítulo',
    chapterTitle: 'Título del capítulo',
    nextChapter: 'Empezar el siguiente capítulo',
    noChapters: 'Este libro aún no tiene capítulos.',
    addFirstChapter: 'Agregar el primer capítulo'
  },
  apply: {
    notFound: 'El texto que hay que cambiar no está en el capítulo. Puede que haya cambiado.',
    manyMatches: 'El texto que hay que cambiar aparece más de una vez en el capítulo. Pídele a la IA un fragmento más largo.',
    noChapter: 'El capítulo no existe.'
  }
}

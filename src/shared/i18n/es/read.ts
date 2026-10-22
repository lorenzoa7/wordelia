import type { read as en } from '../en/read'

export const read: typeof en = {
  stateChanged: {
    open: (n) => (n === 1 ? 'Comentario reabierto.' : `${n} comentarios reabiertos.`),
    done: (n) => (n === 1 ? 'Comentario marcado como hecho.' : `${n} comentarios marcados como hechos.`),
    ignored: (n) => (n === 1 ? 'Comentario ignorado.' : `${n} comentarios ignorados.`),
    intentional: (n) => (n === 1 ? 'Comentario marcado como intencional.' : `${n} comentarios marcados como intencionales.`)
  },
  newerFile: 'Una versión más nueva de Wordelia escribió los comentarios de este libro. Esta versión los muestra, pero no guarda cambios en ellos.',

  title: 'Lectura de editor',
  lens: {
    all: 'Todas las miradas',
    structure: 'Estructura',
    reader: 'Lector',
    style: 'Estilo',
    continuity: 'Continuidad',
    proofread: 'Revisión'
  },
  threadTitle: (chapter) => `Lectura · ${chapter}`,
  ask: (chapter, lens, how) => {
    const base = {
      all: `Lee el capítulo “${chapter}” con todas las miradas`,
      structure: `Lee el capítulo “${chapter}” como editor de estructura`,
      reader: `Lee el capítulo “${chapter}” como primer lector`,
      style: `Lee el capítulo “${chapter}” como editor de estilo`,
      continuity: `Lee el capítulo “${chapter}” como editor de continuidad`,
      proofread: `Lee el capítulo “${chapter}” como corrector`
    }
    const extra = [how.selection ? 'solo el fragmento seleccionado' : '', how.inProgress ? 'capítulo en curso' : ''].filter(Boolean)
    return `${base[lens]}${extra.length ? ` (${extra.join(', ')})` : ''}.`
  },
  run: 'Leer',
  running: 'Este capítulo se está leyendo ahora.',
  popover: {
    whatToRead: 'Qué leer',
    thisChapter: 'Este capítulo',
    theSelection: 'La selección',
    lens: 'Mirada',
    inProgress: 'Capítulo en curso',
    inProgressHint: 'El editor no dice que falta el final.',
    note: 'El editor deja comentarios. Nunca cambia tu texto.'
  },
  offer: (n, lens) => `Hacer la lectura de editor del cap. ${n} · ${lens}`,
  head: {
    place: (n, lens) => `Cap. ${n} · ${lens}`,
    comments: (n) => (n === 1 ? '1 comentario' : `${n} comentarios`)
  },
  resolved: (n) => (n === 1 ? 'La lectura cree que 1 comentario se resolvió.' : `La lectura cree que ${n} comentarios se resolvieron.`),
  markDone: (n) => (n === 1 ? 'Marcar como hecho' : 'Marcar como hechos'),
  margin: {
    title: (n) => `Comentarios del editor · ${n}`,
    filter: 'Mostrar los comentarios de una mirada',
    hide: 'Ocultar',
    lost: 'El fragmento cambió',
    discuss: 'Discutir en el chat',
    polish: 'Pulir fragmento',
    updateNote: 'Actualizar la nota',
    intentional: 'Es intencional',
    ignore: 'Ignorar',
    done: 'Hecho',
    readOnly: 'Una versión más nueva de Wordelia guarda estos comentarios. Esta versión no puede cambiarlos.',
    chapter: (n) => `Cap. ${n}`,
    storyLine: 'Línea',
    note: 'Nota',
    quote: (text) => `«${text}»`,
    card: (n, lens) => (n === null ? `Comentario · ${lens}` : `Comentario ${n} · ${lens}`)
  },
  status: {
    count: (n) => (n === 1 ? '1 comentario del editor' : `${n} comentarios del editor`),
    show: 'Mostrar los comentarios en el margen',
    goTo: 'Ir a los comentarios'
  },
  aboutComment: (n, text) => (n === null ? `Sobre el comentario «${text}»: ` : `Sobre el comentario ${n} («${text}»): `),
  updateNoteAsk: (text, targets) => {
    const what = targets.length ? (targets.length === 1 ? targets[0] : `${targets.slice(0, -1).join(', ')} y ${targets[targets.length - 1]}`) : 'la nota de la planificación o la línea de la historia'
    return `El texto de este capítulo está bien así. Actualiza ${what} para que concuerde con el fragmento. No cambies este capítulo. El comentario: «${text}»`
  },
  polished: '¿Marcar el comentario como hecho?',
  noPassage: 'El fragmento de este comentario ya no está en el texto.',
  intentionalAsk: {
    title: 'Es intencional',
    label: 'Motivo para las próximas lecturas (opcional)',
    placeholder: 'Por ejemplo: el personaje miente a propósito',
    confirm: 'Marcar como intencional'
  },
  letterRef: {
    open: (n, lens) => (n === null ? `Ir al comentario · ${lens}` : `Ir al comentario ${n} · ${lens}`),
    done: (lens) => `Hecho · ${lens}`,
    ignored: (lens) => `Ignorado · ${lens}`,
    intentional: (lens) => `Intencional · ${lens}`
  },
  threadBusy: 'El chat todavía escribe una respuesta en la conversación de esta lectura. Inténtalo de nuevo cuando la respuesta termine.',
  list: {
    title: 'Lista de revisión',
    intro: 'Todos los comentarios de las lecturas de editor, de todas las miradas. Ningún comentario cambia el texto.',
    newRead: 'Nueva lectura',
    lensFilter: 'Mirada',
    stateFilter: 'Estado',
    all: 'Todos',
    states: { open: 'Abiertos', done: 'Hechos', ignored: 'Ignorados', intentional: 'Intencionales' },
    state: { open: 'Abierto', done: 'Hecho', ignored: 'Ignorado', intentional: 'Intencional' },
    count: {
      open: (n) => `${n} ${n === 1 ? 'abierto' : 'abiertos'}`,
      done: (n) => `${n} ${n === 1 ? 'hecho' : 'hechos'}`,
      ignored: (n) => `${n} ${n === 1 ? 'ignorado' : 'ignorados'}`,
      intentional: (n) => `${n} ${n === 1 ? 'intencional' : 'intencionales'}`
    },
    openCount: (n) => (n === 1 ? '1 comentario abierto' : `${n} comentarios abiertos`),
    goTo: 'Ir al fragmento',
    reason: 'Tu razón:',
    empty: 'Aún no hay comentarios. Los comentarios de las lecturas de editor quedan aquí.',
    noMatch: 'Ningún comentario coincide con estos filtros.',
    conflict: (chapter, source) => `${chapter} está en conflicto con ${source}`
  },
  damagedFile: 'El archivo de comentarios de este libro está dañado. Wordelia no lo cambia. Corrige o elimina ai/comments.json.'
}

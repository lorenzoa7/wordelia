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
    const extra = [how.selection ? 'solo el pasaje seleccionado' : '', how.inProgress ? 'capítulo en curso' : ''].filter(Boolean)
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
  }
}

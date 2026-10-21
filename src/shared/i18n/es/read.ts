import type { read as en } from '../en/read'

export const read: typeof en = {
  stateChanged: {
    open: (n) => (n === 1 ? 'Comentario reabierto.' : `${n} comentarios reabiertos.`),
    done: (n) => (n === 1 ? 'Comentario marcado como hecho.' : `${n} comentarios marcados como hechos.`),
    ignored: (n) => (n === 1 ? 'Comentario ignorado.' : `${n} comentarios ignorados.`),
    intentional: (n) => (n === 1 ? 'Comentario marcado como intencional.' : `${n} comentarios marcados como intencionales.`)
  },
  newerFile: 'Una versión más nueva de Wordelia escribió los comentarios de este libro. Esta versión los muestra, pero no guarda cambios en ellos.'
}

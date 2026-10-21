import type { read as en } from '../en/read'

export const read: typeof en = {
  stateChanged: {
    open: (n) => (n === 1 ? 'Comentário reaberto.' : `${n} comentários reabertos.`),
    done: (n) => (n === 1 ? 'Comentário marcado como feito.' : `${n} comentários marcados como feitos.`),
    ignored: (n) => (n === 1 ? 'Comentário ignorado.' : `${n} comentários ignorados.`),
    intentional: (n) => (n === 1 ? 'Comentário marcado como intencional.' : `${n} comentários marcados como intencionais.`)
  },
  newerFile: 'Uma versão mais nova do Wordelia escreveu os comentários deste livro. Esta versão mostra os comentários, mas não salva mudanças neles.'
}

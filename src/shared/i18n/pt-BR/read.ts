import type { read as en } from '../en/read'

export const read: typeof en = {
  stateChanged: {
    open: (n) => (n === 1 ? 'Comentário reaberto.' : `${n} comentários reabertos.`),
    done: (n) => (n === 1 ? 'Comentário marcado como feito.' : `${n} comentários marcados como feitos.`),
    ignored: (n) => (n === 1 ? 'Comentário ignorado.' : `${n} comentários ignorados.`),
    intentional: (n) => (n === 1 ? 'Comentário marcado como intencional.' : `${n} comentários marcados como intencionais.`)
  },
  newerFile: 'Uma versão mais nova do Wordelia escreveu os comentários deste livro. Esta versão mostra os comentários, mas não salva mudanças neles.',

  title: 'Leitura de editor',
  lens: {
    all: 'Todos os olhares',
    structure: 'Estrutura',
    reader: 'Leitor',
    style: 'Estilo',
    continuity: 'Continuidade',
    proofread: 'Revisão'
  },
  threadTitle: (chapter) => `Leitura · ${chapter}`,
  ask: (chapter, lens, how) => {
    const base = {
      all: `Leia o capítulo “${chapter}” com todos os olhares`,
      structure: `Leia o capítulo “${chapter}” como editor de estrutura`,
      reader: `Leia o capítulo “${chapter}” como primeiro leitor`,
      style: `Leia o capítulo “${chapter}” como editor de estilo`,
      continuity: `Leia o capítulo “${chapter}” como editor de continuidade`,
      proofread: `Leia o capítulo “${chapter}” como revisor`
    }
    const extra = [how.selection ? 'só o trecho selecionado' : '', how.inProgress ? 'capítulo em andamento' : ''].filter(Boolean)
    return `${base[lens]}${extra.length ? ` (${extra.join(', ')})` : ''}.`
  },
  run: 'Ler',
  running: 'Este capítulo está sendo lido agora.',
  popover: {
    whatToRead: 'O que ler',
    thisChapter: 'Este capítulo',
    theSelection: 'A seleção',
    lens: 'Olhar',
    inProgress: 'Capítulo em andamento',
    inProgressHint: 'O editor não diz que falta o final.',
    note: 'O editor deixa comentários. Ele nunca muda o seu texto.'
  },
  offer: (n, lens) => `Fazer a leitura de editor do cap. ${n} · ${lens}`,
  head: {
    place: (n, lens) => `Cap. ${n} · ${lens}`,
    comments: (n) => (n === 1 ? '1 comentário' : `${n} comentários`)
  },
  resolved: (n) => (n === 1 ? 'A leitura acha que 1 comentário foi resolvido.' : `A leitura acha que ${n} comentários foram resolvidos.`),
  markDone: (n) => (n === 1 ? 'Marcar como feito' : 'Marcar como feitos')
}

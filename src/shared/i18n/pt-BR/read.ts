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
  markDone: (n) => (n === 1 ? 'Marcar como feito' : 'Marcar como feitos'),
  margin: {
    title: (n) => `Comentários do editor · ${n}`,
    filter: 'Mostrar os comentários de um olhar',
    hide: 'Ocultar',
    lost: 'O trecho mudou',
    discuss: 'Discutir no chat',
    polish: 'Polir trecho',
    updateNote: 'Atualizar a nota',
    intentional: 'É intencional',
    ignore: 'Ignorar',
    done: 'Feito',
    readOnly: 'Uma versão mais nova do Wordelia guarda estes comentários. Esta versão não pode mudá-los.',
    chapter: (n) => `Cap. ${n}`,
    storyLine: 'Linha',
    note: 'Nota',
    quote: (text) => `«${text}»`,
    card: (n, lens) => (n === null ? `Comentário · ${lens}` : `Comentário ${n} · ${lens}`)
  },
  status: {
    count: (n) => (n === 1 ? '1 comentário do editor' : `${n} comentários do editor`),
    show: 'Mostrar os comentários na margem',
    goTo: 'Ir aos comentários'
  }
}

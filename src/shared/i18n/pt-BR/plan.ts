import type { plan as en } from '../en/plan'

export const plan: typeof en = {
  newEntryName: 'Nova nota',
  writingRules: 'Regras de escrita',
  name: 'Nome',
  backTo: (to) => `Voltar para ${to}`,
  category: {
    count: (n) => (n === 1 ? '1 nota' : `${n} notas`),
    newEntry: 'Nova nota',
    importNotes: 'Importar notas'
  },
  sidebar: {
    planning: 'Planejamento',
    syncWithManuscript: 'Sincronizar manuscrito',
    changedChapters: (count) =>
      count === 1 ? '1 capítulo alterado desde a última sincronização' : `${count} capítulos alterados desde a última sincronização`,
    upToDate: 'O planejamento está em dia',
    overview: 'Visão geral',
    showEntries: (category) => `${category}: mostrar notas`,
    importNotesInto: (category) => `Importar notas para ${category}`,
    newIn: (category) => `Nova nota em ${category}`,
    empty: 'Vazia',
    newCategory: 'Nova categoria',
    categoryPlaceholder: 'Objetos, Facções, Linha do tempo…',
    add: 'Adicionar',
    addCategory: 'Adicionar categoria'
  },
  overview: {
    title: 'A bíblia da história',
    intro: 'Personagens, lugares, o mundo e a trama. A IA lê este planejamento em cada chat e ação, e assim o livro fica coerente.',
    buildFromManuscript: 'Criar o planejamento a partir do manuscrito',
    noNotesYet: 'Nada escrito ainda.',
    newCard: 'Nova'
  },
  map: {
    views: 'Modos do planejamento',
    cards: 'Cartões',
    map: 'Mapa',
    stats: (entries, links) => `${entries === 1 ? '1 nota' : `${entries} notas`} · ${links === 1 ? '1 conexão' : `${links} conexões`}`,
    searchPlaceholder: 'Encontrar uma nota',
    search: 'Encontrar uma nota no mapa',
    clearSearch: 'Limpar a busca',
    matches: (n) => (n === 0 ? 'Nada encontrado' : n === 1 ? '1 resultado' : `${n} resultados`),
    categories: 'Categorias',
    toggleCategory: (category, shown) => (shown ? `Ocultar ${category}` : `Mostrar ${category}`),
    chapters: 'Capítulos',
    chaptersHint: 'Mostrar os capítulos e as notas que eles citam',
    zoomIn: 'Aproximar',
    zoomOut: 'Afastar',
    fit: 'Ajustar à tela',
    label: (entries, links) => `Mapa de ${entries} notas e ${links} conexões. Use a busca para encontrar e abrir uma nota.`,
    links: (n) => (n === 0 ? 'Nenhuma conexão' : n === 1 ? '1 conexão' : `${n} conexões`),
    chapter: (n) => `Capítulo ${n}`,
    emptyTitle: 'Nada para mapear ainda',
    emptyText: 'O mapa mostra as notas do planejamento e as conexões entre elas. Adicione personagens, lugares e notas, e eles aparecem aqui.',
    noLinksTitle: 'Nenhuma conexão ainda',
    noLinks: 'Uma nota se conecta a outra quando o resumo ou o texto dela usa o nome da outra nota, ou [[Nome]].',
    allHidden: 'Todas as categorias estão ocultas.',
    showAll: 'Mostrar todas'
  },
  entry: {
    deleteTitle: (name) => `Excluir “${name}”?`,
    deleteMessage: 'O arquivo vai para a pasta .wordelia/trash do livro.',
    askChat: 'Perguntar ao chat sobre esta nota',
    mentionInChat: 'Mencionar no chat',
    deleteEntry: 'Excluir nota',
    chooseImage: 'Escolher uma imagem',
    changeImage: 'Trocar',
    addImage: 'Adicionar imagem',
    summary: 'Resumo',
    summaryPlaceholder: 'Uma linha que descreve esta nota',
    alsoCalled: 'Outros nomes',
    removeAlias: (alias) => `Remover ${alias}`,
    aliasPlaceholder: '+ nome',
    notesPlaceholder: 'Anotações: aparência, personalidade, passado, segredos…',
    inManuscript: 'No manuscrito'
  },
  rules: {
    intro:
      'Suas regras para este livro: voz, ponto de vista, tempo verbal, diálogos, palavras a evitar. Todas as ações e chats da IA seguem essas regras. Cole aqui as regras do seu prompt antigo.',
    placeholder: 'Escreva suas regras…'
  },
  noteEditor: {
    placeholder: 'Escreva aqui…',
    notesAbout: (label) => `Anotações sobre ${label}`,
    notes: 'Anotações',
    reply: 'Responder'
  },
  sync: {
    connectAiFirst: 'Conecte uma IA primeiro.',
    openSettings: 'Abrir configurações',
    upToDate: 'O planejamento está em dia com o manuscrito.',
    done: 'Sincronização concluída. Revise as propostas no chat.',
    threadTitle: 'Sincronização do planejamento',
    threadBrief: 'Mantém o planejamento em dia com o manuscrito. As propostas vêm do botão Sincronizar.',
    request: (bootstrap, count, chapters, part, parts) => {
      const what = bootstrap
        ? count === 1
          ? 'Criar o planejamento a partir do capítulo'
          : `Criar o planejamento a partir de ${count} capítulos`
        : count === 1
          ? 'Sincronizar o planejamento com o capítulo'
          : `Sincronizar o planejamento com ${count} capítulos`
      return `${what}: ${chapters}${parts > 1 ? ` (parte ${part} de ${parts})` : ''}.`
    }
  },
  links: {
    noEntry: (name) => `Nenhuma nota do planejamento se chama "${name}".`,
    createIt: 'Criar nota'
  },
  imported: (count, category) => (count === 1 ? `1 nota importada para ${category}.` : `${count} notas importadas para ${category}.`)
}

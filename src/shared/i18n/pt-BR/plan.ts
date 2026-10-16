import type { plan as en } from '../en/plan'

export const plan: typeof en = {
  newEntryName: 'Nova nota',
  writingRules: 'Regras de escrita',
  name: 'Nome',
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

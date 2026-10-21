import type { write as en } from '../en/write'

const n = (v: number): string => v.toLocaleString('pt-BR')

export const write: typeof en = {
  chapters: 'Capítulos',
  chapterTitle: 'Título do capítulo',
  chapterOptions: 'Opções do capítulo',
  /** Pages of a chapter in the chapter list */
  chapterPages: (n) => `${n} p.`,
  /** Tooltip of the pages: the words of the chapter */
  chapterWords: (n) => `${n.toLocaleString('pt-BR')} palavras`,
  chapterLabel: (num, title, words) =>
    `Capítulo ${num}: ${title}, ${words} palavras. F2 renomeia; Alt e as setas o movem.`,
  newChapterAfter: 'Novo capítulo depois deste',
  moveUp: 'Mover para cima',
  moveDown: 'Mover para baixo',
  mention: 'Mencionar no chat',
  versionHistoryMenu: 'Histórico de versões…',
  deleteChapter: 'Excluir capítulo',
  deleteTitle: (title) => `Excluir “${title}”?`,
  deleteMessage: 'Você pode desfazer logo depois. O arquivo também fica na pasta do livro, em .wordelia/trash.',
  deleted: (title) => `“${title}” foi excluído.`,
  status: {
    selected: 'selecionadas',
    wordsInChapter: 'palavras no capítulo',
    inBook: (count) => `${count} no livro`,
    minRead: (minutes) => `${minutes} min de leitura`,
    dailyGoal: (words) => `Meta diária: ${n(words)} palavras`,
    goalReached: 'Meta atingida',
    today: (words) => `+${words} hoje`,
    versionHistory: 'Histórico de versões',
    history: 'Histórico',
    saved: 'Salvo',
    saving: 'Salvando…',
    notSaved: 'Não salvo'
  },
  action: {
    connectFirst: 'Conecte uma IA primeiro.',
    openSettings: 'Abrir configurações',
    nothingToChange: 'A IA não encontrou nada para mudar.',
    noRewrite: 'A IA não enviou a reescrita. Tente de novo.'
  },
  newChapterAfterOne: (title) => `Novo capítulo depois de “${title}”`,
  addChapterAtEnd: 'Adicionar um capítulo no fim',
  saveProblems: {
    readOnly: 'O arquivo é somente leitura, ou o sistema não deixa o Wordelia alterá-lo.',
    busy: 'Outro programa está usando o arquivo, por exemplo um app de sincronização.',
    missing: 'A pasta do livro não está lá. Ela mudou de lugar, ou o disco dela não está conectado.',
    diskFull: 'O disco está cheio.',
    other: 'O Wordelia não consegue gravar o arquivo.'
  },
  notSavedToast: (reason) => `Suas últimas mudanças não foram salvas. ${reason} O Wordelia tenta de novo sozinho.`,
  clickToRetry: 'Clique para tentar de novo.'
}

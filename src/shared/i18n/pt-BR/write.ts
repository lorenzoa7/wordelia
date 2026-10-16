import type { write as en } from '../en/write'

const n = (v: number): string => v.toLocaleString('pt-BR')

export const write: typeof en = {
  chapters: 'Capítulos',
  newChapter: 'Novo capítulo',
  addChapter: 'Adicionar capítulo',
  chapterTitle: 'Título do capítulo',
  chapterOptions: 'Opções do capítulo',
  chapterLabel: (num, title, words) =>
    `Capítulo ${num}: ${title}, ${words} palavras. F2 renomeia; Alt e as setas o movem.`,
  newChapterAfter: 'Novo capítulo depois deste',
  moveUp: 'Mover para cima',
  moveDown: 'Mover para baixo',
  mention: 'Mencionar no chat',
  versionHistoryMenu: 'Histórico de versões…',
  deleteChapter: 'Excluir capítulo',
  deleteTitle: (title) => `Excluir “${title}”?`,
  deleteMessage: 'O arquivo vai para a pasta .wordelia/trash do livro. Você pode recuperá-lo de lá.',
  deleted: (title) => `“${title}” foi para a pasta da lixeira.`,
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
  }
}

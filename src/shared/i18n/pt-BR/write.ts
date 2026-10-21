import type { write as en } from '../en/write'

const n = (v: number): string => v.toLocaleString('pt-BR')

export const write: typeof en = {
  chapters: 'Capítulos',
  newChapter: 'Novo capítulo',
  addChapter: 'Adicionar capítulo',
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
    noRewrite: 'A IA não enviou a reescrita. Tente de novo.',
    nothingSelected: 'Selecione um texto ou ponha o cursor num parágrafo com texto.',
    aiSays: (words) => `A IA não reescreveu o trecho: “${words}”`,
    readyIn: (action, chapter) => `A mudança de ${action} está pronta em “${chapter}”.`,
    show: 'Mostrar',
    changedMeanwhile: 'O trecho mudou enquanto a IA trabalhava. A mudança dela não foi mantida.'
  }
}

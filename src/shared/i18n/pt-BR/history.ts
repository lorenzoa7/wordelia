import type { history as en } from '../en/history'

export const history: typeof en = {
  title: 'Histórico',
  titleOf: (title) => `Histórico de “${title}”`,
  description: 'O Wordelia guarda versões quando você abre um capítulo, a cada poucos minutos enquanto você escreve e antes das mudanças da IA.',
  restore: 'Restaurar esta versão',
  reading: 'Lendo o histórico…',
  unreadable: 'O Wordelia não consegue ler esta versão.',
  empty: 'Ainda não há versões. O Wordelia salva uma quando você abre o capítulo e enquanto você escreve.',
  ifRestore: 'Se você restaurar esta versão:',
  words: 'palavras',
  today: (time) => `Hoje, ${time}`,
  restored: (title, when) => `“${title}” voltou à versão de ${when}.`,
  labels: {
    opened: 'Aberto',
    left: 'Saiu do capítulo',
    autosave: 'Salvamento automático',
    beforeRestore: 'Antes de restaurar',
    beforeChat: 'Antes de uma mudança da IA no chat',
    snapshot: 'Versão'
  },
  before: (action) => `Antes de ${action}`
}

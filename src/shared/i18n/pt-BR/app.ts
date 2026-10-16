import type { app as en } from '../en/app'

export const app: typeof en = {
  showSidebar: 'Mostrar barra lateral',
  hideSidebar: 'Ocultar barra lateral',
  library: 'Biblioteca',
  backToLibrary: 'Voltar para a biblioteca',
  bookSettings: 'Configurações do livro',
  exportBook: 'Exportar…',
  showFolder: 'Mostrar pasta',
  closeBook: 'Fechar livro',
  viewNav: 'Visualização',
  views: { write: 'Escrever', plan: 'Planejar' },
  showChat: 'Mostrar chat',
  hideChat: 'Ocultar chat',
  chatWidth: 'Largura do chat. Use as setas para mudar.',
  provider: {
    connect: 'Conectar uma IA',
    checking: 'Verificando…',
    notConnected: (name) => `${name}: não conectado`,
    ready: (name) => `IA pronta: ${name}`,
    openSettings: 'Abrir configurações de IA'
  },
  aiErrors: {
    notInstalled: 'O provedor de IA não está instalado.',
    notLoggedIn: 'Sem login.',
    connectHint: (detail) => `${detail} Abra Configurações → IA para conectar.`,
    rateLimit: 'O provedor de IA diz que o limite de uso foi atingido. Tente de novo mais tarde.',
    network: 'Sem conexão com o provedor de IA.',
    cancelled: 'Interrompido.',
    unknown: 'Algo deu errado.'
  }
}
